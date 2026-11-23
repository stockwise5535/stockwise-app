/* Stockwise Sales CRM - orchestration. All I/O goes through `deps`, so tests use in-memory fakes.
   deps: { store:{rows(t),append(t,obj),update(t,row,patch)}, mail:{send(m),threadMessages(id),self()},
           now():Date, localParts(Date):{day,hour,dow}, id():string } */
var SalesEngine = (function () {
  function C() { return typeof SalesCore !== 'undefined' ? SalesCore : require('./Core.js'); }
  function iso(d) { return d.toISOString(); }
  function log(deps, event, leadId, queueId, detail) { deps.store.append('ActivityLog', { timestamp: iso(deps.now()), event: event, lead_id: leadId || '', queue_id: queueId || '', detail: String(detail || '').slice(0, 500) }); }
  function loadSettings(deps) { return C().settingsFrom(deps.store.rows('Settings')); }
  function byId(rows, field, v) { for (var i = 0; i < rows.length; i++) if (rows[i][field] === v) return rows[i]; return null; }

  function dedupeLeads(deps) {
    var core = C(), leads = deps.store.rows('Leads'), changed = 0, now = iso(deps.now());
    leads.forEach(function (l) {
      var patch = {}, e = core.normalizeEmail(l.contact_email);
      if (!l.lead_id) patch.lead_id = core.leadId(l);
      var dom = core.normalizeDomain(l.domain || l.website || e); if (dom && dom !== l.domain) patch.domain = dom;
      if (e !== l.contact_email) patch.contact_email = e;
      if (!l.status) patch.status = 'NEW';
      if (!l.created_at) patch.created_at = now;
      if (Object.keys(patch).length) { patch.updated_at = now; deps.store.update('Leads', l._row, patch); Object.keys(patch).forEach(function (k) { l[k] = patch[k]; }); changed++; }
    });
    var dups = core.findDuplicates(leads);
    dups.forEach(function (d) {
      var l = leads[d.index]; deps.store.update('Leads', l._row, { status: 'DUPLICATE', duplicate_of: d.duplicate_of, eligibility_note: d.reason, updated_at: now });
      log(deps, 'LEAD_DUPLICATE', l.lead_id, '', d.reason + ' of ' + d.duplicate_of);
    });
    return { normalized: changed, duplicates: dups.length };
  }

  function generateDrafts(deps) {
    var core = C(), s = loadSettings(deps), sup = core.suppressionSet(deps.store.rows('Suppression')), queue = deps.store.rows('EmailQueue'), made = 0, held = 0, now = iso(deps.now());
    deps.store.rows('Leads').forEach(function (l) {
      if (l.status !== 'NEW' && l.status !== 'REVIEW_NEEDED') return;
      var reasons = core.leadEligibility(l, s, sup);
      if (!s.senderName || !s.senderAddress) reasons.push('SENDER_IDENTITY_MISSING');
      if (reasons.length) { deps.store.update('Leads', l._row, { status: 'REVIEW_NEEDED', eligibility_note: reasons.join(','), updated_at: now }); held++; return; }
      var key = core.sendKey(l.lead_id, 1); if (queue.some(function (q) { return q.send_key === key; })) return;
      var m = core.buildEmail(l, s, 1), qid = 'Q-' + deps.id();
      deps.store.append('EmailQueue', { queue_id: qid, lead_id: l.lead_id, step: 1, send_key: key, to_email: l.contact_email, subject: m.subject, body: m.body, content_hash: core.contentHash(m.subject, m.body, l.contact_email), language: m.language, approval_status: 'DRAFT', status: 'QUEUED', scheduled_at: now, attempts: 0 });
      deps.store.update('Leads', l._row, { status: 'DRAFTED', eligibility_note: '', updated_at: now });
      log(deps, 'DRAFT_CREATED', l.lead_id, qid, 'step 1'); made++;
    });
    return { drafts: made, held: held };
  }

  /* Record the content hash at the moment the owner approved. Any later edit invalidates the approval. */
  function snapshotApprovals(deps) {
    var core = C(), n = 0, now = iso(deps.now());
    deps.store.rows('EmailQueue').forEach(function (q) {
      if (q.approval_status === 'APPROVED' && String(q.approved_by || '').trim() && !q.approved_hash && !q.sent_at && ['QUEUED','READY','DRY_RUN_OK'].indexOf(String(q.status)) >= 0) {
        deps.store.update('EmailQueue', q._row, { approved_hash: core.contentHash(q.subject, q.body, q.to_email), approved_at: q.approved_at || now }); n++;
        log(deps, 'APPROVAL_RECORDED', q.lead_id, q.queue_id, 'by ' + q.approved_by);
      }
    });
    return n;
  }

  function processQueue(deps) {
    var core = C(), initialSettings = loadSettings(deps);
    var res = {mode:initialSettings.liveSending ? 'LIVE' : 'DRY_RUN',sent:0,dryRunOk:0,blocked:0,failed:0,deferred:0};
    var readyStatuses = ['QUEUED','READY','DRY_RUN_OK',''];
    function snapshot(id) {
      var now = deps.now(), local = deps.localParts(now), queue = deps.store.rows('EmailQueue');
      var matches = queue.filter(function (q) { return q.queue_id === id; });
      if (matches.length !== 1 || queue.some(function (q,i) { return !q.queue_id || queue.some(function (r,j) { return i !== j && r.queue_id === q.queue_id; }); })) throw Error('AMBIGUOUS_QUEUE_ID');
      var leads = deps.store.rows('Leads').filter(function (l) { return l.lead_id === matches[0].lead_id; });
      if (leads.length !== 1) throw Error('AMBIGUOUS_LEAD_ID');
      var sent = queue.filter(function (q) { return q.status === 'SENT' && q.sent_at && deps.localParts(new Date(q.sent_at)).day === local.day; }).length;
      var settings = loadSettings(deps);
      if (settings.liveSending && typeof deps.mail.sentToday === 'function') sent = Math.max(sent,deps.mail.sentToday(now,queue));
      return {item:matches[0],lead:leads[0],settings:settings,sup:core.suppressionSet(deps.store.rows('Suppression')),queue:queue,localNow:local,sentToday:sent,sentThisRun:res.sent,nowMs:now.getTime()};
    }
    function scheduledReady(q,now) { return !q.scheduled_at || isFinite(Date.parse(q.scheduled_at)) && Date.parse(q.scheduled_at) <= now; }
    function hardReasons(ctx) { return core.preSendChecks(ctx).filter(function (r) { return core.TRANSIENT.indexOf(r) < 0; }); }
    function flush() { if (typeof deps.store.flush !== 'function') throw Error('DURABLE_STORE_REQUIRED'); deps.store.flush(); }
    var queue = deps.store.rows('EmailQueue'), halted = false;
    var pending = queue.filter(function (q) { return q.approval_status === 'APPROVED' && readyStatuses.indexOf(String(q.status)) >= 0; });
    if (initialSettings.liveSending && (!deps.safety || deps.safety.isStopped())) { res.stopped = true; return res; }
    if (initialSettings.liveSending && queue.some(function (q) { return ['SENDING','FAILED'].indexOf(q.status) >= 0; })) {
      deps.safety.stop('UNRESOLVED_DELIVERY'); res.stopped = true; return res;
    }
    pending.forEach(function (original) {
      if (halted) { res.deferred++; return; }
      var q, ctx;
      try {
        ctx = snapshot(original.queue_id); q = ctx.item;
        // Each item is reloaded: a prior item's send may have changed approval,
        // suppression, limits or the next recipient. A stale snapshot never sends.
        if (readyStatuses.indexOf(String(q.status)) < 0 || q.sent_at || q.gmail_message_id || q.gmail_thread_id || !scheduledReady(q,ctx.nowMs)) { res.deferred++; return; }
        if (ctx.settings.liveSending && (deps.safety.isStopped() || !deps.safety.isAllowed(q))) { res.deferred++; return; }
        var reasons = core.preSendChecks(ctx), hard = hardReasons(ctx);
        if (hard.length) { deps.store.update('EmailQueue',q._row,{status:'BLOCKED',blocked_reason:hard.join(',')}); res.blocked++; return; }
        if (reasons.length) { res.deferred++; return; }
        if (!ctx.settings.liveSending) { deps.store.update('EmailQueue',q._row,{status:'DRY_RUN_OK',blocked_reason:''}); res.dryRunOk++; return; }
        if (typeof deps.safety.reserveSend !== 'function' || typeof deps.safety.completeSend !== 'function' || typeof deps.mail.sentToday !== 'function' || typeof deps.mail.hasPriorSend !== 'function') throw Error('DURABLE_SEND_CONTROLLER_REQUIRED');
        if (Number(q.step) === 1 && deps.mail.hasPriorSend(q.to_email)) { res.deferred++; return; }
        var approvedHash = core.contentHash(q.subject,q.body,q.to_email), attempt = Number(q.attempts || 0) + 1;
        // ScriptProperties intent is persisted independently of buffered Sheet
        // cells. A crash/unknown result can never turn into an automatic retry.
        deps.safety.reserveSend(q,{day:ctx.localNow.day,dailyLimit:ctx.settings.dailyLimit,sentToday:ctx.sentToday});
        deps.store.update('EmailQueue',q._row,{status:'SENDING',attempts:attempt,blocked_reason:''}); flush();
        ctx = snapshot(q.queue_id); var current = ctx.item;
        if (!scheduledReady(current,ctx.nowMs) || current.status !== 'SENDING' || Number(current.attempts) !== attempt || current.sent_at || current.gmail_message_id || current.gmail_thread_id || core.contentHash(current.subject,current.body,current.to_email) !== approvedHash || !ctx.settings.liveSending || !deps.safety.isAllowed(current) || core.preSendChecks(ctx).length) throw Error('SEND_RESERVATION_READBACK_FAILED');
        var out = deps.mail.send({to:current.to_email,subject:current.subject,body:current.body,name:ctx.settings.senderName,replyTo:ctx.settings.replyTo});
        if (!out || !out.threadId || !out.messageId) throw Error('GMAIL_RECEIPT_MISSING');
        var time = iso(deps.now());
        var receiving=deps.store.rows('EmailQueue').filter(function(r){return r.queue_id===current.queue_id;});
        if(receiving.length!==1||receiving[0].status!=='SENDING'||core.contentHash(receiving[0].subject,receiving[0].body,receiving[0].to_email)!==approvedHash)throw Error('RECEIPT_ROW_CHANGED');
        deps.store.update('EmailQueue',receiving[0]._row,{status:'SENT',sent_at:time,gmail_thread_id:out.threadId,gmail_message_id:out.messageId,error:''}); flush();
        var receipts = deps.store.rows('EmailQueue').filter(function (r) { return r.queue_id === current.queue_id; });
        if (receipts.length !== 1 || receipts[0].status !== 'SENT' || receipts[0].gmail_message_id !== out.messageId || receipts[0].gmail_thread_id !== out.threadId || core.contentHash(receipts[0].subject,receipts[0].body,receipts[0].to_email) !== approvedHash) throw Error('SENT_READBACK_UNCONFIRMED');
        deps.safety.completeSend(current,out); res.sent++;
        var contacted=deps.store.rows('Leads').filter(function(l){return l.lead_id===ctx.lead.lead_id;});
        if(contacted.length!==1)throw Error('CONTACTED_ROW_CHANGED');
        deps.store.update('Leads',contacted[0]._row,{status:'CONTACTED',last_contacted_at:time,updated_at:time});
        log(deps,'SENT',current.lead_id,current.queue_id,'step '+current.step);
      } catch (e) {
        // Do not overwrite a concurrent actor's SENT receipt with FAILED.
        if (q) { try { var rows=deps.store.rows('EmailQueue').filter(function(r){return r.queue_id===q.queue_id;});if(rows.length===1&&!rows[0].sent_at&&!rows[0].gmail_message_id&&rows[0].status==='SENDING'){deps.store.update('EmailQueue',rows[0]._row,{status:'FAILED',error:'DELIVERY_RESULT_REQUIRES_MANUAL_REVIEW'});flush();}}catch(ignore){} }
        halted=true;res.failed++;res.stopped=true;if(deps.safety)deps.safety.stop('SEND_FAILED_OR_UNKNOWN');
      }
    });
    return res;
  }

  function suppress(deps, value, type, reason, source) {
    var exists = deps.store.rows('Suppression').some(function (r) { return String(r.value).toLowerCase() === value.toLowerCase(); });
    if (!exists) deps.store.append('Suppression', { value: value, type: type, reason: reason, added_at: iso(deps.now()), source: source });
  }
  function cancelPending(deps, leadId, why) {
    deps.store.rows('EmailQueue').forEach(function (q) {
      if (q.lead_id === leadId && ['QUEUED', 'DRY_RUN_OK', 'BLOCKED', ''].indexOf(String(q.status)) >= 0) deps.store.update('EmailQueue', q._row, { status: 'CANCELLED', blocked_reason: why });
    });
  }

  function checkReplies(deps) {
    var core = C(), self = core.normalizeEmail(deps.mail.self()), res = { replies: 0, unsubscribes: 0, bounces: 0 }, leads = deps.store.rows('Leads'), nowMs = deps.now().getTime();
    deps.store.rows('EmailQueue').forEach(function (q) {
      if (q.status !== 'SENT' || !q.gmail_thread_id || nowMs - Date.parse(q.sent_at) > 60 * 86400000) return;
      var lead = byId(leads, 'lead_id', q.lead_id); if (!lead) return;
      deps.mail.threadMessages(q.gmail_thread_id).forEach(function (m) {
        var from = core.normalizeEmail((String(m.from).match(/<([^>]+)>/) || [0, m.from])[1]);
        if (from === self || new Date(m.date).getTime() <= Date.parse(q.sent_at)) return;
        var kind = core.classifyReply(m), t = iso(deps.now());
        if (kind === 'AUTO') return;
        if (kind === 'UNSUBSCRIBE' && lead.reply_status !== 'UNSUBSCRIBED') {
          suppress(deps, core.normalizeEmail(q.to_email), 'email', 'unsubscribe_reply', 'reply');
          deps.store.update('Leads', lead._row, { reply_status: 'UNSUBSCRIBED', status: 'UNSUBSCRIBED', updated_at: t }); lead.reply_status = 'UNSUBSCRIBED';
          cancelPending(deps, lead.lead_id, 'UNSUBSCRIBED'); log(deps, 'UNSUBSCRIBED', lead.lead_id, q.queue_id, ''); res.unsubscribes++;
        } else if (kind === 'BOUNCE' && lead.reply_status !== 'BOUNCED') {
          suppress(deps, core.normalizeEmail(q.to_email), 'email', 'bounce', 'mailer-daemon');
          deps.store.update('Leads', lead._row, { reply_status: 'BOUNCED', status: 'BOUNCED', updated_at: t }); lead.reply_status = 'BOUNCED';
          cancelPending(deps, lead.lead_id, 'BOUNCED'); log(deps, 'BOUNCED', lead.lead_id, q.queue_id, ''); res.bounces++;
        } else if (kind === 'REPLY' && !lead.reply_status) {
          deps.store.update('Leads', lead._row, { reply_status: 'REPLIED', status: 'REPLIED', updated_at: t }); lead.reply_status = 'REPLIED';
          cancelPending(deps, lead.lead_id, 'REPLIED'); log(deps, 'REPLIED', lead.lead_id, q.queue_id, 'follow-ups stopped'); res.replies++;
        }
      });
    });
    return res;
  }

  /* Follow-ups: creates DRAFT rows only, only when FOLLOW_UP_ENABLED=TRUE. They still need approval like any other email. */
  function scheduleFollowUps(deps) {
    var core = C(), s = loadSettings(deps); if (!s.followUpEnabled) return { skipped: 'FOLLOW_UP_ENABLED=false', drafts: 0 };
    var queue = deps.store.rows('EmailQueue'), leads = deps.store.rows('Leads'), nowD = deps.now(), made = 0;
    queue.filter(function (q) { return q.status === 'SENT' && Number(q.step) >= 1; }).forEach(function (q) {
      var lead = byId(leads, 'lead_id', q.lead_id); if (!lead || lead.reply_status) return;
      var sentSteps = queue.filter(function (x) { return x.lead_id === q.lead_id; });
      var maxStep = Math.max.apply(null, sentSteps.map(function (x) { return Number(x.step); }));
      if (Number(q.step) !== maxStep || maxStep - 1 >= s.maxFollowUps) return;
      if (nowD.getTime() - Date.parse(q.sent_at) < s.followUpDelayDays * 86400000) return;
      var m = core.buildEmail(lead, s, maxStep + 1), qid = 'Q-' + deps.id();
      deps.store.append('EmailQueue', { queue_id: qid, lead_id: lead.lead_id, step: maxStep + 1, send_key: core.sendKey(lead.lead_id, maxStep + 1), to_email: lead.contact_email, subject: m.subject, body: m.body, content_hash: core.contentHash(m.subject, m.body, lead.contact_email), language: m.language, approval_status: 'DRAFT', status: 'QUEUED', scheduled_at: iso(nowD), attempts: 0 });
      log(deps, 'FOLLOWUP_DRAFT', lead.lead_id, qid, 'step ' + (maxStep + 1)); made++;
    });
    return { drafts: made };
  }

  function importResearchCompanies(deps, candidates) {
    if (!deps.store.headers) throw new Error('ACTUAL_SHEET_HEADERS_REQUIRED');
    var core = C(), before = deps.store.rows('Leads');
    var plan = core.planResearchCompanyImport(before, candidates, deps.store.headers('Leads'), iso(deps.now()));
    plan.appendRows.forEach(function (row) { deps.store.append('Leads', row); });
    if (deps.store.flush) deps.store.flush();
    var after = deps.store.rows('Leads'), counts = {};
    after.forEach(function (row) { var key = core.companyResearchKey(row); if (plan.expectedKeys.indexOf(key) >= 0) counts[key] = (counts[key] || 0) + 1; });
    if (plan.expectedKeys.some(function (key) { return counts[key] !== 1; })) throw new Error('CRM_READBACK_COUNT_OR_DUPLICATE_MISMATCH');
    return {requested:plan.requested,inserted:plan.appendRows.length,skipped:plan.skipped,matchedAfter:plan.expectedKeys.length,totalRowsAfter:after.length,approvedToEmail:false};
  }

  function dailySummary(deps) {
    var day = deps.localParts(deps.now()).day, counts = {};
    deps.store.rows('ActivityLog').forEach(function (row) {
      var date = new Date(row.timestamp);
      if (!isNaN(date.getTime()) && deps.localParts(date).day === day) counts[row.event] = (counts[row.event] || 0) + 1;
    });
    var queue = deps.store.rows('EmailQueue');
    return { day: day, sent: counts.SENT || 0, drafts: counts.DRAFT_CREATED || 0,
      replies: counts.REPLIED || 0, unsubscribes: counts.UNSUBSCRIBED || 0, bounces: counts.BOUNCED || 0,
      failures: counts.SEND_FAILED || 0, blocked: counts.BLOCKED || 0,
      unresolved: queue.filter(function (q) { return ['SENDING','FAILED'].indexOf(q.status) >= 0; }).length,
      awaitingApproval: queue.filter(function (q) { return q.approval_status === 'DRAFT' && q.status === 'QUEUED'; }).length };
  }

  /* Read-only go-live checklist. Never prints secrets. */
  function safetyReport(deps) {
    var s = loadSettings(deps), items = [
      ['LIVE_SENDING', s.liveSending ? 'ON' : 'off'], ['FOLLOW_UP_ENABLED', s.followUpEnabled ? 'ON' : 'off'],
      ['Legal review completed', s.legalReviewCompleted ? 'yes' : 'NO (sending blocked)'], ['Sender identity set', s.senderName && s.senderAddress ? 'yes' : 'NO (sending blocked)'],
      ['Signup journey verified (product link)', s.signupVerified ? 'yes' : 'no (emails omit product link)'], ['Daily limit', String(s.dailyLimit)]];
    return items.map(function (i) { return i[0] + ': ' + i[1]; }).join('\n');
  }
  return { dedupeLeads: dedupeLeads, generateDrafts: generateDrafts, snapshotApprovals: snapshotApprovals, processQueue: processQueue, checkReplies: checkReplies, scheduleFollowUps: scheduleFollowUps, safetyReport: safetyReport, dailySummary: dailySummary, importResearchCompanies: importResearchCompanies, loadSettings: loadSettings };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SalesEngine;
