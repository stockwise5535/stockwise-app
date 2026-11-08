/* Stockwise Sales CRM - pure logic. No Google APIs here, so it is unit-testable in Node. */
var SalesCore = (function () {
  var TABLES = {
    Leads: ['lead_id','company','domain','website','contact_name','contact_email','country','language','segment','source_url','contact_basis','status','eligibility_note','duplicate_of','reply_status','created_at','updated_at','last_contacted_at','owner_notes'],
    EmailQueue: ['queue_id','lead_id','step','send_key','to_email','subject','body','content_hash','language','approval_status','approved_by','approved_at','approved_hash','status','blocked_reason','scheduled_at','sent_at','gmail_thread_id','gmail_message_id','attempts','error'],
    ActivityLog: ['timestamp','event','lead_id','queue_id','detail'],
    Suppression: ['value','type','reason','added_at','source'],
    Settings: ['key','value','description']
  };
  var DEFAULT_SETTINGS = {
    LIVE_SENDING: ['false', 'Master switch. Must be TRUE to send to prospects. Keep FALSE until the go-live checklist is complete.'],
    FOLLOW_UP_ENABLED: ['false', 'Keep FALSE. Follow-up drafts are created only when TRUE, and still need approval.'],
    LEGAL_REVIEW_COMPLETED: ['false', 'Set TRUE only after the owner (and counsel if needed) reviewed JP/SG/AU email rules.'],
    SIGNUP_JOURNEY_VERIFIED: ['false', 'TRUE adds the product link and trial sentence. Keep FALSE until the hosted signup journey is browser-verified.'],
    DAILY_SEND_LIMIT: ['10', 'Max prospect emails per day (script time zone).'],
    RUN_SEND_LIMIT: ['5', 'Max prospect emails per trigger run.'],
    SEND_WINDOW_START: ['9', 'Earliest send hour (script time zone, 0-23).'],
    SEND_WINDOW_END: ['17', 'Latest send hour, exclusive.'],
    ALLOWED_COUNTRIES: ['JP,SG,AU', 'Comma-separated country codes eligible for outreach.'],
    ALLOW_FREEMAIL: ['false', 'FALSE blocks gmail.com, yahoo.co.jp etc. (B2B only).'],
    DOMAIN_COOLDOWN_DAYS: ['90', 'No second outreach to the same company domain within this many days.'],
    FOLLOW_UP_DELAY_DAYS: ['5', 'Days after step 1 before a follow-up draft may be created.'],
    MAX_FOLLOW_UPS: ['1', 'Maximum follow-ups per lead.'],
    SENDER_NAME: ['', 'Real sender name shown in the email.'],
    SENDER_COMPANY: ['', 'Legal/trading name of the sender.'],
    SENDER_ADDRESS: ['', 'Postal address or contact details required in the footer.'],
    REPLY_TO: ['', 'Optional reply-to address. Blank = the sending Gmail account.'],
    PRODUCT_URL: ['', 'Landing/demo URL. Used only when SIGNUP_JOURNEY_VERIFIED=TRUE.']
  };
  var CONTACT_BASES = ['PUBLISHED_BUSINESS_CONTACT','EXPRESS_CONSENT','EXISTING_RELATIONSHIP','INBOUND_REQUEST'];
  var FREEMAIL = ['gmail.com','googlemail.com','yahoo.com','yahoo.co.jp','ymail.com','outlook.com','hotmail.com','hotmail.co.jp','live.com','icloud.com','me.com','aol.com','proton.me','protonmail.com','docomo.ne.jp','ezweb.ne.jp','softbank.ne.jp','au.com','nifty.com','biglobe.ne.jp'];
  var TRANSIENT = ['OUTSIDE_SEND_WINDOW','DAILY_LIMIT_REACHED','RUN_LIMIT_REACHED'];
  var BANNED = ['永久無料','無料で使い放題','使い放題','必ず','絶対','100%','クレジットカード不要','いつでも解約','日本語対応','日本語完全対応','free forever','guarantee','no credit card','cancel anytime','fully localized','risk-free'];
  var UNSUB = ['unsubscribe','opt out','opt-out','remove me','remove my','stop emailing','stop sending','do not contact',"don't contact",'do not email','no more emails','配信停止','配信を停止','配信解除','配信をやめ','送らないで','送信しないで','連絡不要','連絡は不要','メール不要','メールは不要','不要です','お断り','迷惑'];
  var AUTO = ['out of office','automatic reply','auto-reply','autoreply','自動返信','不在','vacation'];

  function isTrue(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
  function isValidEmail(e) { return /^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)+$/.test(normalizeEmail(e)) && normalizeEmail(e).length <= 254; }
  function domainOfEmail(e) { var s = normalizeEmail(e); var i = s.lastIndexOf('@'); return i < 0 ? '' : s.slice(i + 1); }
  function normalizeDomain(v) {
    var s = String(v || '').trim().toLowerCase();
    if (s.indexOf('@') >= 0) s = domainOfEmail(s);
    s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[\/?#:]/)[0];
    return s;
  }
  function isFreemail(domain) { return FREEMAIL.indexOf(normalizeDomain(domain)) >= 0; }
  function fnv(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
  function hash(str) { return fnv(str) + fnv(str.split('').reverse().join('')); }
  function leadId(lead) { return 'L-' + hash(normalizeEmail(lead.contact_email) || normalizeDomain(lead.domain || lead.website)); }
  function settingsFrom(rows) {
    var map = {}; (rows || []).forEach(function (r) { if (r.key) map[String(r.key).trim()] = r.value; });
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (map[k] === undefined || map[k] === '') map[k] = DEFAULT_SETTINGS[k][0]; });
    return {
      raw: map, liveSending: isTrue(map.LIVE_SENDING), followUpEnabled: isTrue(map.FOLLOW_UP_ENABLED),
      legalReviewCompleted: isTrue(map.LEGAL_REVIEW_COMPLETED), signupVerified: isTrue(map.SIGNUP_JOURNEY_VERIFIED),
      dailyLimit: num(map.DAILY_SEND_LIMIT, 10), runLimit: num(map.RUN_SEND_LIMIT, 5),
      windowStart: num(map.SEND_WINDOW_START, 9), windowEnd: num(map.SEND_WINDOW_END, 17),
      allowedCountries: String(map.ALLOWED_COUNTRIES).split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean),
      allowFreemail: isTrue(map.ALLOW_FREEMAIL), cooldownDays: num(map.DOMAIN_COOLDOWN_DAYS, 90),
      followUpDelayDays: num(map.FOLLOW_UP_DELAY_DAYS, 5), maxFollowUps: num(map.MAX_FOLLOW_UPS, 1),
      senderName: String(map.SENDER_NAME || '').trim(), senderCompany: String(map.SENDER_COMPANY || '').trim(),
      senderAddress: String(map.SENDER_ADDRESS || '').trim(), replyTo: String(map.REPLY_TO || '').trim(), productUrl: String(map.PRODUCT_URL || '').trim()
    };
  }
  function suppressionSet(rows) {
    var s = { emails: {}, domains: {} };
    (rows || []).forEach(function (r) {
      var v = String(r.value || '').trim().toLowerCase(); if (!v) return;
      if (String(r.type).toLowerCase() === 'domain') s.domains[normalizeDomain(v)] = true; else s.emails[v] = true;
    });
    return s;
  }
  function isSuppressed(email, sup) { var e = normalizeEmail(email); return !!(sup.emails[e] || sup.domains[domainOfEmail(e)]); }

  /* Is this lead allowed to receive a DRAFT at all? Returns reason codes (empty = eligible). */
  function leadEligibility(lead, settings, sup) {
    var r = [];
    if (!isValidEmail(lead.contact_email)) r.push('INVALID_EMAIL');
    if (settings.allowedCountries.indexOf(String(lead.country || '').trim().toUpperCase()) < 0) r.push('COUNTRY_NOT_ALLOWED');
    if (CONTACT_BASES.indexOf(String(lead.contact_basis || '').trim()) < 0) r.push('NO_CONTACT_BASIS');
    if (String(lead.contact_basis).trim() === 'PUBLISHED_BUSINESS_CONTACT' && !/^https?:\/\//i.test(String(lead.source_url || '').trim())) r.push('NO_SOURCE_URL');
    if (!settings.allowFreemail && isFreemail(domainOfEmail(lead.contact_email))) r.push('FREEMAIL_BLOCKED');
    if (isSuppressed(lead.contact_email, sup)) r.push('SUPPRESSED');
    if (!String(lead.company || '').trim()) r.push('NO_COMPANY');
    if (['DUPLICATE','UNSUBSCRIBED','BOUNCED','REPLIED','DO_NOT_CONTACT'].indexOf(String(lead.status || '').trim()) >= 0) r.push('LEAD_STATUS_' + String(lead.status).trim());
    return r;
  }

  /* Mark duplicates. Rows must be ordered oldest first. Returns [{index, duplicate_of, reason}] for rows to flag. */
  function findDuplicates(leads) {
    var byEmail = {}, byDomain = {}, out = [];
    leads.forEach(function (l, i) {
      if (String(l.status).trim() === 'DUPLICATE') return;
      var e = normalizeEmail(l.contact_email), d = normalizeDomain(l.domain || l.website || e);
      var first = (e && byEmail[e] !== undefined) ? byEmail[e] : ((d && !isFreemail(d) && byDomain[d] !== undefined) ? byDomain[d] : undefined);
      if (first !== undefined) { out.push({ index: i, duplicate_of: leads[first].lead_id || leadId(leads[first]), reason: byEmail[e] !== undefined && e ? 'SAME_EMAIL' : 'SAME_DOMAIN' }); return; }
      if (e) byEmail[e] = i; if (d && !isFreemail(d)) byDomain[d] = i;
    });
    return out;
  }

  function localizedLang(lead) { var l = String(lead.language || '').toLowerCase(); if (l === 'ja' || l === 'en') return l; return String(lead.country).toUpperCase() === 'JP' ? 'ja' : 'en'; }

  function buildEmail(lead, settings, step) {
    var lang = localizedLang(lead), name = String(lead.contact_name || '').trim(), company = String(lead.company).trim();
    var showProduct = settings.signupVerified && /^https:\/\//.test(settings.productUrl);
    var sender = settings.senderName + (settings.senderCompany ? ' / ' + settings.senderCompany : '');
    var basis = { PUBLISHED_BUSINESS_CONTACT: ['貴社の公開ウェブサイトに掲載されている連絡先を拝見し、ご連絡しました。', 'I found this contact on your company\'s public website: ' + (lead.source_url || '')],
      EXPRESS_CONSENT: ['ご連絡をご希望いただいたため、ご連絡しました。', 'You asked to hear from us, so I am writing.'],
      EXISTING_RELATIONSHIP: ['これまでのお取引・やり取りに基づきご連絡しました。', 'I am writing based on our previous contact.'],
      INBOUND_REQUEST: ['お問い合わせをいただいたため、ご連絡しました。', 'I am following up on your enquiry.'] }[lead.contact_basis] || ['', ''];
    var subject, body;
    if (lang === 'ja') {
      subject = step > 1 ? 'Re: 在庫管理のご案内(' + company + '様)' : '在庫管理のご案内(' + company + '様)';
      body = (name ? name + ' 様' : company + ' ご担当者様') + '\n\n' + basis[0] + '\n\n' +
        (step > 1 ? '先日お送りしたメールのご確認です。' : '在庫や仕入れの管理で「今日どれを確認すべきか」を整理するツール「Stockwise」を開発しています。') + '\n' +
        (showProduct ? 'デモワークスペースで、確認すべき例外と推奨アクションを試せます(30日間の無料トライアル。現在、登録画面は英語です)。\n' + settings.productUrl + '\n' : '興味をお持ちであれば、このメールにご返信いただければ詳細をご案内します。\n') +
        '\nご不要でしたら、このメールに「配信停止」とご返信ください。以後ご連絡しません。\n\n' + sender + '\n' + settings.senderAddress;
    } else {
      subject = (step > 1 ? 'Re: ' : '') + 'Inventory visibility for ' + company;
      body = (name ? 'Hi ' + name : 'Hello') + ',\n\n' + basis[1] + '\n\n' +
        (step > 1 ? 'Following up on my earlier note.' : 'I am building Stockwise, a tool that helps small businesses see which inventory exceptions need attention today.') + '\n' +
        (showProduct ? 'You can try a demo workspace (30-day free trial; the signup screens are currently in English):\n' + settings.productUrl + '\n' : 'If this is relevant, reply and I will send details.\n') +
        '\nIf you do not want to hear from me, reply "unsubscribe" and I will not contact you again.\n\n' + sender + '\n' + settings.senderAddress;
    }
    return { subject: subject, body: body, language: lang };
  }
  function bannedPhrases(text) { var t = String(text).toLowerCase(); return BANNED.filter(function (b) { return t.indexOf(b.toLowerCase()) >= 0; }); }
  function contentHash(subject, body, to) { return hash(normalizeEmail(to) + '\n' + subject + '\n' + body); }
  function sendKey(leadId_, step) { return leadId_ + '#' + step; }

  /* Pre-send gate. Returns reason codes; empty array = allowed. ctx: {item, lead, settings, sup, queue, localNow, sentToday, sentThisRun, nowMs, senderEmail} */
  function preSendChecks(ctx) {
    var r = [], it = ctx.item, lead = ctx.lead, s = ctx.settings;
    if (!lead) return ['LEAD_NOT_FOUND'];
    if (it.approval_status !== 'APPROVED' || !String(it.approved_by || '').trim()) r.push('NOT_APPROVED');
    else if (!it.approved_hash || it.approved_hash !== contentHash(it.subject, it.body, it.to_email)) r.push('EDITED_AFTER_APPROVAL');
    if (normalizeEmail(it.to_email) !== normalizeEmail(lead.contact_email)) r.push('RECIPIENT_MISMATCH');
    if (!s.legalReviewCompleted) r.push('LEGAL_REVIEW_PENDING');
    if (!s.senderName || !s.senderAddress) r.push('SENDER_IDENTITY_MISSING');
    if (!/配信停止|unsubscribe/i.test(it.body)) r.push('NO_OPT_OUT_LINE');
    if (bannedPhrases(it.subject + ' ' + it.body).length) r.push('BANNED_CLAIM');
    var el = leadEligibility(lead, s, ctx.sup).filter(function (x) { return x.indexOf('LEAD_STATUS_') !== 0 || x === 'LEAD_STATUS_DUPLICATE' || x === 'LEAD_STATUS_UNSUBSCRIBED' || x === 'LEAD_STATUS_BOUNCED' || x === 'LEAD_STATUS_REPLIED' || x === 'LEAD_STATUS_DO_NOT_CONTACT'; });
    r = r.concat(el);
    if (['REPLIED','UNSUBSCRIBED','BOUNCED'].indexOf(String(lead.reply_status)) >= 0 && Number(it.step) > 1) r.push('LEAD_CLOSED');
    var key = it.send_key;
    var dupe = (ctx.queue || []).some(function (q) { return q !== it && q.queue_id !== it.queue_id && q.send_key === key && (q.status === 'SENT' || q.status === 'SENDING'); });
    if (dupe) r.push('DUPLICATE_SEND_KEY');
    var d = normalizeDomain(domainOfEmail(it.to_email)), cd = s.cooldownDays * 86400000;
    var recent = !isFreemail(d) && (ctx.queue || []).some(function (q) { return q.queue_id !== it.queue_id && q.lead_id !== it.lead_id && normalizeDomain(domainOfEmail(q.to_email)) === d && (q.status === 'SENT' || q.status === 'SENDING') && ctx.nowMs - Date.parse(q.sent_at || 0) < cd; });
    if (recent) r.push('DOMAIN_COOLDOWN');
    var lp = ctx.localNow; // {day, hour, dow}
    if (lp.dow === 0 || lp.dow === 6 || lp.hour < s.windowStart || lp.hour >= s.windowEnd) r.push('OUTSIDE_SEND_WINDOW');
    if (ctx.sentToday >= s.dailyLimit) r.push('DAILY_LIMIT_REACHED');
    if (ctx.sentThisRun >= s.runLimit) r.push('RUN_LIMIT_REACHED');
    return r;
  }
  function stripQuoted(body) {
    var out = [], lines = String(body || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^\s*(On .{5,200} wrote:|.{0,200}wrote:\s*$|-{2,}\s*Original Message|_{5,}|From:\s)/i.test(l) || /^\d{4}年.*(書きました|記載)/.test(l)) break;
      if (/^\s*>/.test(l)) continue;
      out.push(l);
    }
    return out.join('\n');
  }
  function classifyReply(msg) {
    var from = String(msg.from || '').toLowerCase(), subj = String(msg.subject || '').toLowerCase(), body = stripQuoted(msg.body).toLowerCase();
    if (/mailer-daemon|postmaster/.test(from) || /undeliver|delivery status|returned mail|配信不能|配信エラー/.test(subj)) return 'BOUNCE';
    if (UNSUB.some(function (k) { return body.indexOf(k) >= 0 || subj.indexOf(k) >= 0; })) return 'UNSUBSCRIBE';
    if (AUTO.some(function (k) { return body.indexOf(k) >= 0 || subj.indexOf(k) >= 0; })) return 'AUTO';
    return 'REPLY';
  }
  return { TABLES: TABLES, DEFAULT_SETTINGS: DEFAULT_SETTINGS, CONTACT_BASES: CONTACT_BASES, TRANSIENT: TRANSIENT, isTrue: isTrue, normalizeEmail: normalizeEmail, isValidEmail: isValidEmail, domainOfEmail: domainOfEmail, normalizeDomain: normalizeDomain, isFreemail: isFreemail, hash: hash, leadId: leadId, settingsFrom: settingsFrom, suppressionSet: suppressionSet, isSuppressed: isSuppressed, leadEligibility: leadEligibility, findDuplicates: findDuplicates, buildEmail: buildEmail, bannedPhrases: bannedPhrases, contentHash: contentHash, sendKey: sendKey, preSendChecks: preSendChecks, stripQuoted: stripQuoted, classifyReply: classifyReply };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SalesCore;
