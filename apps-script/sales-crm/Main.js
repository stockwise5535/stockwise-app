/* Stockwise Sales CRM - Apps Script entry points (container-bound to the "Stockwise Sales CRM" spreadsheet).
   Defaults are safe: LIVE_SENDING=false and FOLLOW_UP_ENABLED=false. See README.md. */
var SALES_TEST_CRM_ID = '1frj0e0YmGqOlGkEip6QNoTTI3oFHw3Tc_diCdT2j8TY';
var DATE_COLS = ['created_at', 'updated_at', 'last_contacted_at', 'approved_at', 'scheduled_at', 'sent_at', 'timestamp', 'added_at'];
var SALES_ACTIVE_LOCK_ = null; // Invocation-local instance actually acquired by locked_.

function sheetsStore_() {
  // A bound script can use its active spreadsheet; a standalone copy must specify an ID.
  var configuredId = PropertiesService.getScriptProperties().getProperty('STOCKWISE_CRM_ID');
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if(active&&active.getId()===SALES_TEST_CRM_ID&&configuredId&&configuredId!==SALES_TEST_CRM_ID)throw Error('TEST_CRM_ONLY');
  var ss = configuredId ? SpreadsheetApp.openById(configuredId) : active;
  if (!ss) throw new Error('CRM_SPREADSHEET_NOT_CONFIGURED: set STOCKWISE_CRM_ID or bind this script to the intended test spreadsheet');
  function sh(t) { var s = ss.getSheetByName(t); if (!s) throw new Error('Missing sheet: ' + t + ' (run Setup first)'); return s; }
  function headers(s) { return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String); }
  return {
    spreadsheet: ss,
    headers: function (t) { return headers(sh(t)); },
    flush: function () { SpreadsheetApp.flush(); },
    rows: function (t) {
      var s = sh(t), n = s.getLastRow(); if (n < 2) return [];
      var h = headers(s), vals = s.getRange(2, 1, n - 1, h.length).getValues();
      return vals.map(function (r, i) {
        var o = { _row: i + 2 };
        h.forEach(function (k, c) { var v = r[c]; o[k] = v instanceof Date ? v.toISOString() : (v === null ? '' : v); });
        return o;
      }).filter(function (o) { return h.some(function (k) { return o[k] !== ''; }); });
    },
    append: function (t, obj) { var s = sh(t), h = headers(s); s.appendRow(h.map(function (k) { return obj[k] === undefined ? '' : obj[k]; })); },
    update: function (t, row, patch) {
      var s = sh(t), h = headers(s);
      Object.keys(patch).forEach(function (k) { var c = h.indexOf(k); if (c >= 0) s.getRange(row, c + 1).setValue(patch[k]); });
    }
  };
}
function gmailAdapter_() {
  return {
    self: function () { return Session.getEffectiveUser().getEmail(); },
    send: function (m) {
      var configuredName = PropertiesService.getScriptProperties().getProperty('STOCKWISE_SALES_EXPECTED_FROM_NAME');
      var opts = { name: configuredName || m.name || undefined }; if (m.replyTo) opts.replyTo = m.replyTo;
      var msg = GmailApp.createDraft(m.to, m.subject, m.body, opts).send(); // returns the sent message, so we keep thread/message IDs
      var address=function(v){return SalesCore.normalizeEmail((String(v).match(/<([^>]+)>/)||[0,v])[1]);};
      var body=function(v){return String(v).replace(/\r\n/g,'\n').replace(/\n+$/,'');};
      var expected=SalesCore.normalizeEmail(PropertiesService.getScriptProperties().getProperty('STOCKWISE_SALES_EXPECTED_FROM'));
      if(!expected||address(msg.getFrom())!==expected||address(msg.getTo())!==SalesCore.normalizeEmail(m.to)||msg.getSubject()!==m.subject||body(msg.getPlainBody())!==body(m.body))throw Error('GMAIL_SENT_CONTENT_UNCONFIRMED');
      return { threadId: msg.getThread().getId(), messageId: msg.getId() };
    },
    hasPriorSend: function (to) {
      if (!SalesCore.isValidEmail(to)) throw Error('INVALID_SEND_RECIPIENT');
      return GmailApp.search('in:sent {to:'+SalesCore.normalizeEmail(to)+' to:(@'+SalesCore.domainOfEmail(to)+')}',0,1).length > 0;
    },
    sentToday: function (now, queue) {
      var tz=Session.getScriptTimeZone(),day=Utilities.formatDate(now,tz,'yyyy-MM-dd');
      var start=Utilities.parseDate(day+' 00:00:00',tz,'yyyy-MM-dd HH:mm:ss');
      var seen={},count=0,self=SalesCore.normalizeEmail(Session.getEffectiveUser().getEmail());
      // Bounced sends also consumed capacity. Merge receipts by message ID,
      // rather than max(CRM count, Gmail count), which misses disjoint sends.
      (queue||[]).forEach(function(q,i){
        if(!q.sent_at){if(['SENT','BOUNCED'].indexOf(q.status)>=0||q.gmail_message_id||q.gmail_thread_id)throw Error('CRM_SENT_DATE_UNCONFIRMED');return;}
        var date=new Date(q.sent_at);if(!isFinite(date.getTime()))throw Error('CRM_SENT_DATE_UNCONFIRMED');
        if(Utilities.formatDate(date,tz,'yyyy-MM-dd')!==day)return;
        var id=String(q.gmail_message_id||'').trim();if(!id)throw Error('CRM_RECEIPT_UNCONFIRMED');var key='id:'+id;
        if(!seen[key]){seen[key]=true;count++;}
      });
      var query='in:sent after:'+Math.floor(start.getTime()/1000)+' {StockWise "Inventory visibility"}';
      // GmailApp returns threads, including old messages. Continue pagination
      // until exhausted or the ceiling is already reached; never assume one
      // page of threads is a complete current-day message count.
      for(var offset=0;count<100;offset+=100){
        var threads=GmailApp.search(query,offset,100);
        threads.some(function(t){return t.getMessages().some(function(m){
          var from=SalesCore.normalizeEmail((String(m.getFrom()).match(/<([^>]+)>/)||[0,m.getFrom()])[1]);
          var key='id:'+m.getId();
          if(!seen[key]&&from===self&&Utilities.formatDate(m.getDate(),tz,'yyyy-MM-dd')===day&&
            (/stockwise|inventory visibility/i.test(m.getSubject())||/stockwise|inventory visibility/i.test(m.getPlainBody()))){seen[key]=true;count++;}
          return count>=100;
        });});
        if(threads.length<100)break;
      }
      return count;
    },
    threadMessages: function (id) {
      var th = GmailApp.getThreadById(id); if (!th) return [];
      return th.getMessages().map(function (x) { return { id: x.getId(), from: x.getFrom(), date: x.getDate().toISOString(), subject: x.getSubject(), body: x.getPlainBody() }; });
    }
  };
}
function deps_() {
  var tz = Session.getScriptTimeZone();
  return {
    store: sheetsStore_(), mail: gmailAdapter_(), safety: sendController_(),
    now: function () { return new Date(); },
    localParts: function (d) { return { day: Utilities.formatDate(d, tz, 'yyyy-MM-dd'), hour: Number(Utilities.formatDate(d, tz, 'H')), dow: Number(Utilities.formatDate(d, tz, 'u')) % 7 }; },
    id: function () { return Utilities.getUuid().slice(0, 8); }
  };
}
var SALES_CRM_VERSION = '2026-11-08-clasp';
function ensureLoaded_() {
  if (typeof SalesCore === 'undefined' || typeof SalesCore.buildEmail !== 'function' ||
      typeof SalesEngine === 'undefined' || typeof SalesEngine.processQueue !== 'function') {
    throw new Error('INCOMPLETE_SALES_CRM: Core.js, Engine.js and Main.js must all be loaded. Use the reviewed clasp deployment; do not combine old bundles with these files.');
  }
}
function compatibleHeaders_(name, headers) {
  var required = SalesCore.TABLES[name];
  // Only these two newly optional trailing columns may be absent in an existing CRM.
  var minimum = name === 'Leads' ? required.length - 2 : required.length;
  return headers.length >= minimum && required.every(function (col, i) {
    return i >= headers.length || headers[i] === col;
  });
}
function locked_(fn) {
  ensureLoaded_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Another run is in progress; skipped.'); return { skipped: 'LOCKED' }; }
  var previous=SALES_ACTIVE_LOCK_;SALES_ACTIVE_LOCK_=lock;
  try { return fn(); } finally { SALES_ACTIVE_LOCK_=previous;lock.releaseLock(); }
}
function toast_(msg) { try { SpreadsheetApp.getActiveSpreadsheet().toast(String(msg), 'Stockwise Sales', 8); } catch (e) { Logger.log(msg); } }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Stockwise Sales')
    .addItem('1. Setup sheets (safe, keeps data)', 'setupSheets')
    .addItem('TEST CRM: fill empty sender defaults', 'applyNexOpsSenderDefaultsToTestCrm')
    .addItem('TEST: import 20 research companies', 'openTestResearchImport')
    .addItem('2. Safety report', 'showSafetyReport')
    .addItem('STOP prospect sending', 'stopSalesSending')
    .addItem('Arm reviewed pilot (max 3)', 'armReviewedSalesPilot')
    .addItem('Approve recurring after pilot', 'armReviewedRecurringSales')
    .addItem('Daily sales summary', 'runDailySalesReport')
    .addItem('3. Normalize + dedupe leads', 'runDedupe')
    .addItem('4. Generate drafts', 'runGenerateDrafts')
    .addItem('5. Record reviewed approvals', 'recordReviewedApprovals')
    .addItem('6. Process queue (dry run unless LIVE_SENDING=TRUE)', 'runProcessQueue')
    .addItem('6. Check replies / unsubscribes', 'runCheckReplies')
    .addSeparator().addItem('Send test email to myself only', 'sendTestToOwner')
    .addItem('Install hourly triggers', 'installTriggers').addItem('Remove triggers', 'removeTriggers').addToUi();
}

/* Creates missing sheets/headers/settings. Never deletes or overwrites existing data or setting values. */
function setupSheets(options) {
  return locked_(function () {
    var ss = sheetsStore_().spreadsheet, T = {};
    Object.keys(SalesCore.TABLES).forEach(function (name) { T[name] = SalesCore.TABLES[name]; });
    if (options && options.testLeads19) T.Leads = SalesCore.TABLES.Leads.slice(0,19);
    // Existing 2026 CRM uses display-name headers, not this schema. Never append incompatible headers into populated sheets.
    Object.keys(T).forEach(function (name) {
      var old = ss.getSheetByName(name);
      if (old && old.getLastRow() >= 1) {
        var existingHeaders = old.getRange(1, 1, 1, old.getLastColumn()).getValues()[0].map(String);
        if (existingHeaders.some(function (h) { return h.trim() !== ''; }) && !compatibleHeaders_(name, existingHeaders)) throw new Error('INCOMPATIBLE_EXISTING_CRM_SCHEMA: ' + name + '. Existing data preserved. Use a blank test spreadsheet or reviewed migration.');
      }
    });
    var dashboard = ss.getSheetByName('Dashboard');
    if (dashboard && dashboard.getLastRow() > 0 && String(dashboard.getRange(1, 1).getValue()) !== 'Stockwise Sales CRM') throw new Error('INCOMPATIBLE_DASHBOARD: existing dashboard preserved');
    // Validate every existing table and dashboard before creating or changing any sheet.
    Object.keys(T).forEach(function (name) {
      var s = ss.getSheetByName(name) || ss.insertSheet(name), cols = T[name];
      var have = s.getLastColumn() ? s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String) : [];
      cols.forEach(function (c) { if (have.indexOf(c) < 0) { s.getRange(1, have.length + 1).setValue(c); have.push(c); } });
      s.setFrozenRows(1); s.getRange(1, 1, 1, have.length).setFontWeight('bold');
      have.forEach(function (c, i) { if (DATE_COLS.indexOf(c) >= 0) s.getRange(2, i + 1, 2000, 1).setNumberFormat('@'); });
    });
    var st = ss.getSheetByName('Settings'), existing = {};
    st.getDataRange().getValues().slice(1).forEach(function (r) { existing[String(r[0]).trim()] = true; });
    Object.keys(SalesCore.DEFAULT_SETTINGS).forEach(function (k) { if (!existing[k]) st.appendRow([k, SalesCore.DEFAULT_SETTINGS[k][0], SalesCore.DEFAULT_SETTINGS[k][1]]); });
    fillMissingSenderDefaults_(st);
    var qs = ss.getSheetByName('EmailQueue'), qh = qs.getRange(1, 1, 1, qs.getLastColumn()).getValues()[0];
    var ac = qh.indexOf('approval_status') + 1; // dropdown so approval is a deliberate choice
    qs.getRange(2, ac, 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['DRAFT', 'APPROVED', 'REJECTED'], true).build());
    buildDashboard_(ss);
    toast_('Setup complete. Existing values and sending/follow-up switches were preserved.');
  });
}

/* Only sender name/company are eligible. Empty formula results are existing values.
   Build and validate the full plan before any write; ambiguous duplicates fail closed. */
function fillMissingSenderDefaults_(sheet) {
  if (!sheet) throw new Error('SETTINGS_SHEET_MISSING: run Setup on the TEST CRM first');
  var data = sheet.getDataRange(), values = data.getValues(), formulas = data.getFormulas();
  var header = values[0] || [], required = SalesCore.TABLES.Settings;
  if (required.some(function (name, i) { return String(header[i] || '') !== name; })) throw new Error('INCOMPATIBLE_SETTINGS_SCHEMA: existing data preserved');
  var keys = ['SENDER_NAME', 'SENDER_COMPANY'], rows = { SENDER_NAME: [], SENDER_COMPANY: [] }, plan = [];
  values.slice(1).forEach(function (r, i) { var k = String(r[0]).trim(); if (keys.indexOf(k) >= 0) rows[k].push(i + 1); });
  keys.forEach(function (key) {
    if (rows[key].length > 1) throw new Error('DUPLICATE_SENDER_SETTING: ' + key + '. Existing data preserved');
    if (!rows[key].length) { plan.push({ key: key, row: null }); return; }
    var i = rows[key][0], value = values[i][1], formula = formulas[i] && formulas[i][1];
    if ((value === '' || value === null || value === undefined) && !formula) plan.push({ key: key, row: i + 1 });
  });
  var result = { added: [], filled: [] };
  plan.forEach(function (p) {
    if (p.row === null) { sheet.appendRow([p.key, SalesCore.DEFAULT_SETTINGS[p.key][0], SalesCore.DEFAULT_SETTINGS[p.key][1]]); result.added.push(p.key); }
    else { sheet.getRange(p.row, 2).setValue(SalesCore.DEFAULT_SETTINGS[p.key][0]); result.filled.push(p.key); }
  });
  return result;
}

/* Run from the script bound to the exact TEST CRM. Never opens another file,
   creates triggers, processes queues, or calls Gmail. Production IDs are refused. */
function applyNexOpsSenderDefaultsToTestCrm() {
  return locked_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss || ss.getId() !== SALES_TEST_CRM_ID) throw new Error('TEST_CRM_ONLY: open Apps Script from the specified TEST CRM');
    var configuredId = PropertiesService.getScriptProperties().getProperty('STOCKWISE_CRM_ID');
    if (configuredId && configuredId !== SALES_TEST_CRM_ID) throw new Error('TEST_CRM_ONLY: STOCKWISE_CRM_ID points elsewhere; no changes made');
    var result = fillMissingSenderDefaults_(ss.getSheetByName('Settings'));
    ss.toast('Missing sender defaults updated. Address and sending/follow-up switches were not changed.', 'Stockwise Sales TEST', 8);
    return result;
  });
}

function col_(name, field) { var i = SalesCore.TABLES[name].indexOf(field); var n = i + 1, s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function buildDashboard_(ss) {
  var d = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard');
  if (d.getLastRow() > 0 && String(d.getRange(1,1).getValue()) !== 'Stockwise Sales CRM') throw new Error('INCOMPATIBLE_DASHBOARD: existing dashboard preserved');
  d.clear();
  var L = col_('Leads', 'status'), Q = col_('EmailQueue', 'status'), QA = col_('EmailQueue', 'approval_status'), QS = col_('EmailQueue', 'sent_at');
  var rows = [['Stockwise Sales CRM', ''], ['Leads: total', '=COUNTA(Leads!' + L + '2:' + L + ')'], ['Leads: NEW', '=COUNTIF(Leads!' + L + ':' + L + ',"NEW")'],
    ['Leads: REVIEW_NEEDED', '=COUNTIF(Leads!' + L + ':' + L + ',"REVIEW_NEEDED")'], ['Leads: DUPLICATE', '=COUNTIF(Leads!' + L + ':' + L + ',"DUPLICATE")'],
    ['Leads: REPLIED', '=COUNTIF(Leads!' + L + ':' + L + ',"REPLIED")'], ['Leads: UNSUBSCRIBED', '=COUNTIF(Leads!' + L + ':' + L + ',"UNSUBSCRIBED")'],
    ['Queue: awaiting approval', '=COUNTIFS(EmailQueue!' + QA + ':' + QA + ',"DRAFT",EmailQueue!' + Q + ':' + Q + ',"QUEUED")'],
    ['Queue: approved, dry-run OK', '=COUNTIF(EmailQueue!' + Q + ':' + Q + ',"DRY_RUN_OK")'], ['Queue: BLOCKED', '=COUNTIF(EmailQueue!' + Q + ':' + Q + ',"BLOCKED")'],
    ['Queue: FAILED (manual review)', '=COUNTIF(EmailQueue!' + Q + ':' + Q + ',"FAILED")'], ['Queue: SENDING (manual review if stuck)', '=COUNTIF(EmailQueue!' + Q + ':' + Q + ',"SENDING")'],
    ['Sent: total', '=COUNTIF(EmailQueue!' + Q + ':' + Q + ',"SENT")'], ['Sent: today', '=SUMPRODUCT((EmailQueue!' + Q + '2:' + Q + '2000="SENT")*(LEFT(EmailQueue!' + QS + '2:' + QS + '2000,10)=TEXT(TODAY(),"yyyy-MM-dd")))'],
    ['Suppression entries', '=COUNTA(Suppression!A2:A)']];
  d.getRange(1, 1, rows.length, 1).setValues(rows.map(function (r) { return [r[0]]; }));
  d.getRange(1, 2, rows.length, 1).setFormulas(rows.map(function (r) { return [r[1]]; }));
  d.getRange(1, 1).setFontWeight('bold'); d.autoResizeColumn(1);
}

function runDedupe() { var r = locked_(function () { return SalesEngine.dedupeLeads(deps_()); }); toast_('Dedupe: ' + JSON.stringify(r)); return r; }
function runGenerateDrafts() { var r = locked_(function () { return SalesEngine.generateDrafts(deps_()); }); toast_('Drafts: ' + JSON.stringify(r)); return r; }
function recordReviewedApprovals() { var r = locked_(function () { return SalesEngine.snapshotApprovals(deps_()); }); toast_('Approvals recorded: ' + r); return r; }
function runProcessQueue() { var r = locked_(function () { return SalesEngine.processQueue(deps_()); }); toast_('Queue: ' + JSON.stringify(r)); return r; }
function runCheckReplies() { var r = locked_(function () { return SalesEngine.checkReplies(deps_()); }); toast_('Replies: ' + JSON.stringify(r)); return r; }
function runFollowUps() { return locked_(function () { return SalesEngine.scheduleFollowUps(deps_()); }); }
function showSafetyReport() { ensureLoaded_(); var t = SalesEngine.safetyReport(deps_()); try { SpreadsheetApp.getUi().alert(t); } catch (e) { Logger.log(t); } return t; }

/* Hourly: replies first (so a reply/unsubscribe is always seen before the next send), then queue. */
function hourlyRun() {
  return locked_(function () { var d = deps_(); try { SalesEngine.checkReplies(d); if (PropertiesService.getScriptProperties().getProperty('STOCKWISE_SALES_RECURRING_ENABLED') !== 'true' || salesPropertyJson_('STOCKWISE_SALES_SEND_GRANT').mode !== 'recurring') return {stopped:true,recurringNotEnabled:true}; return SalesEngine.processQueue(d); } catch (e) { d.safety.stop('MAINTENANCE_FAILED'); throw new Error('SALES_MAINTENANCE_FAILED_CHECK_EXECUTIONS'); } });
}
function dailyRun() { return locked_(function () { var d = deps_(); SalesEngine.dedupeLeads(d); SalesEngine.generateDrafts(d); SalesEngine.scheduleFollowUps(d); return dailySalesReport_(d); }); }
function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('hourlyRun').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyRun').timeBased().atHour(8).everyDays(1).create();
  toast_('Triggers installed (hourlyRun, dailyRun). Sending still requires LIVE_SENDING=TRUE.');
}
function removeTriggers() { ScriptApp.getProjectTriggers().forEach(function (t) { if (['hourlyRun', 'dailyRun'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); }); }

/* Always allowed, even with LIVE_SENDING=FALSE, because the recipient is hard-wired to the script owner. */
function sendTestToOwner() {
  ensureLoaded_();
  var me = Session.getEffectiveUser().getEmail(), s = SalesEngine.loadSettings(deps_());
  var sample = SalesCore.buildEmail({ company: 'Sample Co', contact_name: 'Test', country: 'JP', contact_basis: 'PUBLISHED_BUSINESS_CONTACT', source_url: 'https://example.com' }, s, 1);
  GmailApp.sendEmail(me, '[TEST] ' + sample.subject, sample.body, { name: s.senderName || undefined });
  deps_().store.append('ActivityLog', { timestamp: new Date().toISOString(), event: 'TEST_SENT_TO_OWNER', lead_id: '', queue_id: '', detail: 'owner only' });
  toast_('Test sent to ' + me);
}

/* Compatibility with the launch-prep patch; retains ed33fdc's TEST-only, empty-only guard. */
function setSenderIdentityNexOps() { return applyNexOpsSenderDefaultsToTestCrm(); }

/* Read-only post-deployment check. Does not initialize sheets, send mail or install triggers. */
function verifyTestCrmDeployment() {
  ensureLoaded_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configured = PropertiesService.getScriptProperties().getProperty('STOCKWISE_CRM_ID');
  var testConfigured = PropertiesService.getScriptProperties().getProperty('STOCKWISE_TEST_CRM_ID');
  if (!ss || ss.getId() !== SALES_TEST_CRM_ID || (configured && configured !== SALES_TEST_CRM_ID) ||
      (testConfigured && testConfigured !== SALES_TEST_CRM_ID)) throw new Error('TEST_CRM_ONLY');
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) throw new Error('SETTINGS_SHEET_MISSING');
  var rows = sheet.getDataRange().getValues();
  if (!compatibleHeaders_('Settings', rows[0].map(String))) throw new Error('INCOMPATIBLE_SETTINGS_SCHEMA');
  function explicitlyOff(key) {
    var found = rows.slice(1).filter(function (r) { return String(r[0]).trim() === key; });
    return found.length === 1 && (found[0][1] === false || String(found[0][1]).trim().toUpperCase() === 'FALSE');
  }
  var result = { version: SALES_CRM_VERSION, modulesLoaded: true, testCrm: true,
    liveSendingOff: explicitlyOff('LIVE_SENDING'), followUpOff: explicitlyOff('FOLLOW_UP_ENABLED'), legalReviewOff: explicitlyOff('LEGAL_REVIEW_COMPLETED') };
  Logger.log(JSON.stringify(result));
  return result;
}

/* Sending authorization is independent from code delivery and the legacy Settings switches.
   No deployment or scheduled function arms sending or changes any legacy switch. */
function salesPropertyJson_(key) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '{}'); }
  catch (e) { return {}; }
}
function legalLaunchReviewed_(lead) {
  var review = salesPropertyJson_('STOCKWISE_SALES_LAUNCH_REVIEW');
  return SalesCore.countryLegalReasons(lead, {to_email:lead.contact_email,subject:String(lead.country)==='SG'?'<ADV> reviewed':''}, review, Date.now()).length===0;
}
function notifySalesOwner_(code) {
  var props = PropertiesService.getScriptProperties();
  Logger.log('SALES_ALERT: ' + code);
  if (props.getProperty('STOCKWISE_SALES_ALERTS_ENABLED') !== 'true') return;
  // Record the attempt before sending; an unknown mail result is never retried automatically.
  var key = 'STOCKWISE_SALES_ALERT_ATTEMPT_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (props.getProperty(key)) return;
  props.setProperty(key, 'ATTEMPTED');
  try { GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[Stockwise] Sales automation stopped',
    'Prospect sending is stopped. Code: ' + code + '. Review Apps Script executions and unresolved queue rows. No automatic resend.'); }
  catch (e) { Logger.log('SALES_ALERT_EMAIL_RESULT_UNCONFIRMED'); }
}
function sendController_() {
  var props=PropertiesService.getScriptProperties(),prefix='STOCKWISE_SALES_SEND_ATTEMPT_';
  function sender() {
    var expected=SalesCore.normalizeEmail(props.getProperty('STOCKWISE_SALES_EXPECTED_FROM'));
    var actual=SalesCore.normalizeEmail(Session.getEffectiveUser().getEmail());
    return expected==='nexops2026test@gmail.com'&&expected===actual ? expected : '';
  }
  function attemptKey(q) { return prefix+SalesCore.hash(SalesCore.normalizeEmail(q.to_email)+'#'+String(q.step)); }
  function pendingAttempt() {
    var all=props.getProperties();return Object.keys(all).some(function(k){if(k.indexOf(prefix)!==0)return false;try{return JSON.parse(all[k]).phase!=='SENT';}catch(e){return true;}});
  }
  function allowed(queue) {
    var grant=salesPropertyJson_('STOCKWISE_SALES_SEND_GRANT'),identity=sender();
    if(props.getProperty('STOCKWISE_SALES_SHARED_BUDGET_REVIEWED')!=='true'||!identity||grant.senderEmail!==identity||grant.senderName!==(props.getProperty('STOCKWISE_SALES_EXPECTED_FROM_NAME')||'')||props.getProperty('STOCKWISE_SALES_EMERGENCY_STOP')!=='false')return false;
    var lead=sheetsStore_().rows('Leads').filter(function(l){return l.lead_id===queue.lead_id;});
    if(lead.length!==1||!legalLaunchReviewed_(lead[0])||SalesCore.countryLegalReasons(lead[0],queue,salesPropertyJson_('STOCKWISE_SALES_LAUNCH_REVIEW'),Date.now()).length)return false;
    return grant.mode==='recurring' || grant.mode==='pilot'&&grant.queue&&Object.keys(grant.queue).length<=3&&grant.queue[queue.queue_id]===SalesCore.contentHash(queue.subject,queue.body,queue.to_email);
  }
  return {
    isStopped:function(){var grant=salesPropertyJson_('STOCKWISE_SALES_SEND_GRANT');return !sharedRouteReview_()||props.getProperty('STOCKWISE_SALES_SHARED_BUDGET_REVIEWED')!=='true'||!sender()||grant.senderEmail!==sender()||props.getProperty('STOCKWISE_SALES_EMERGENCY_STOP')!=='false'||['pilot','recurring'].indexOf(grant.mode)<0||pendingAttempt();},
    isAllowed:allowed,
    hasUnresolvedAttempts:pendingAttempt,
    reserveSend:function(q,budget){
      if(!SALES_ACTIVE_LOCK_||!SALES_ACTIVE_LOCK_.hasLock())throw Error('SHARED_SEND_LOCK_REQUIRED');
      if(!sharedRouteReview_()||!allowed(q)||pendingAttempt())throw Error('SEND_AUTHORIZATION_CHANGED');
      var key=attemptKey(q);if(props.getProperty(key))throw Error('PREVIOUS_SEND_ATTEMPT_NO_RETRY');
      var today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
      if(!budget||budget.day!==today||!Number.isSafeInteger(budget.dailyLimit)||budget.dailyLimit<1||budget.dailyLimit>100||!Number.isSafeInteger(budget.sentToday)||budget.sentToday<0)throw Error('SHARED_DAILY_BUDGET_REQUIRED');
      var raw=props.getProperty('STOCKWISE_SALES_SHARED_DAY_BUDGET'),daily={};
      if(raw!==null){try{daily=JSON.parse(raw);}catch(e){throw Error('SHARED_DAILY_BUDGET_INVALID');}
        if(!daily||!/^\d{4}-\d{2}-\d{2}$/.test(daily.day||'')||!isFinite(Date.parse(daily.day+'T00:00:00Z'))||new Date(daily.day+'T00:00:00Z').toISOString().slice(0,10)!==daily.day||daily.day>today||!Number.isSafeInteger(daily.used)||daily.used<0||daily.used>100||daily.ceiling!==100)throw Error('SHARED_DAILY_BUDGET_INVALID');}
      var used=Math.max(daily.day===today?daily.used:0,budget.sentToday);
      if(used>=budget.dailyLimit)throw Error('SHARED_DAILY_LIMIT_REACHED');
      // All participating routes must enter this same ScriptLock coordinator.
      // Reserve capacity before intent; a crash may consume a slot, never reuse it.
      var capacity=JSON.stringify({day:today,used:used+1,ceiling:100});
      props.setProperty('STOCKWISE_SALES_SHARED_DAY_BUDGET',capacity);
      if(props.getProperty('STOCKWISE_SALES_SHARED_DAY_BUDGET')!==capacity)throw Error('SHARED_DAILY_BUDGET_UNCONFIRMED');
      var value=JSON.stringify({phase:'SENDING',queueId:q.queue_id,hash:SalesCore.contentHash(q.subject,q.body,q.to_email),senderEmail:sender()});
      props.setProperty(key,value);if(props.getProperty(key)!==value)throw Error('SEND_INTENT_NOT_PERSISTED');
    },
    completeSend:function(q,out){
      if(!SALES_ACTIVE_LOCK_||!SALES_ACTIVE_LOCK_.hasLock())throw Error('SHARED_SEND_LOCK_REQUIRED');
      var key=attemptKey(q),record=salesPropertyJson_(key);
      if(record.phase!=='SENDING'||record.queueId!==q.queue_id||record.hash!==SalesCore.contentHash(q.subject,q.body,q.to_email)||!out.messageId||!out.threadId)throw Error('SEND_RECEIPT_UNCONFIRMED');
      var value=JSON.stringify({phase:'SENT',queueId:q.queue_id,hash:record.hash,senderEmail:record.senderEmail,messageId:out.messageId,threadId:out.threadId});
      props.setProperty(key,value);if(props.getProperty(key)!==value)throw Error('SEND_RECEIPT_NOT_PERSISTED');
    },
    stop:function(code){props.setProperty('STOCKWISE_SALES_EMERGENCY_STOP','true');notifySalesOwner_(code);}
  };
}

function stopSalesSending() { PropertiesService.getScriptProperties().setProperty('STOCKWISE_SALES_RECURRING_ENABLED','false'); PropertiesService.getScriptProperties().setProperty('STOCKWISE_SALES_EMERGENCY_STOP', 'true'); Logger.log('SALES_SENDING_STOPPED'); }
function confirmedSalesOperation_(message) {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Stockwise sales approval', message, ui.ButtonSet.YES_NO) !== ui.Button.YES) throw new Error('OWNER_CONFIRMATION_REQUIRED');
}
function armReviewedSalesPilot() {
  return locked_(function () {
    var d = deps_(), s = SalesEngine.loadSettings(d), ids = salesPropertyJson_('STOCKWISE_SALES_PILOT_QUEUE_IDS');
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || ids.some(function (id, i) { return typeof id !== 'string' || ids.indexOf(id) !== i; })) throw new Error('PILOT_REQUIRES_1_TO_3_UNIQUE_QUEUE_IDS');
    if(!sharedRouteReview_()||PropertiesService.getScriptProperties().getProperty('STOCKWISE_SALES_SHARED_BUDGET_REVIEWED')!=='true')throw Error('ALL_SENDING_ROUTES_MUST_SHARE_BUDGET');
    var identity=SalesCore.normalizeEmail(PropertiesService.getScriptProperties().getProperty('STOCKWISE_SALES_EXPECTED_FROM'));
    if(!SalesCore.isValidEmail(identity)||identity!==SalesCore.normalizeEmail(Session.getEffectiveUser().getEmail()))throw Error('EXPECTED_SENDER_REQUIRED');
    var queue = d.store.rows('EmailQueue'), leads = d.store.rows('Leads'), grant = { mode: 'pilot', senderEmail:identity, senderName:PropertiesService.getScriptProperties().getProperty('STOCKWISE_SALES_EXPECTED_FROM_NAME')||'', queue: {} };
    if (queue.some(function (q) { return ['FAILED','SENDING'].indexOf(q.status) >= 0; }) || d.safety.hasUnresolvedAttempts()) throw new Error('UNRESOLVED_DELIVERY');
    ids.forEach(function (id) {
      var matches = queue.filter(function (q) { return q.queue_id === id; });
      if (matches.length !== 1 || ['QUEUED','READY','DRY_RUN_OK'].indexOf(matches[0].status) < 0) throw new Error('PILOT_QUEUE_NOT_READY');
      var q = matches[0], lead = leads.filter(function (l) { return l.lead_id === q.lead_id; })[0];
      if (!lead || !legalLaunchReviewed_(lead)) throw new Error('COUNTRY_AND_LAUNCH_REVIEW_REQUIRED');
      var reasons = SalesCore.preSendChecks({item:q, lead:lead, settings:s, sup:SalesCore.suppressionSet(d.store.rows('Suppression')), queue:queue,
        localNow:d.localParts(d.now()),sentToday:0,sentThisRun:0,nowMs:d.now().getTime()});
      if (reasons.some(function (r) { return SalesCore.TRANSIENT.indexOf(r) < 0; })) throw new Error('PILOT_PRE_SEND_CHECK_FAILED');
      grant.queue[id] = SalesCore.contentHash(q.subject,q.body,q.to_email);
    });
    confirmedSalesOperation_('Arm only the selected 1–3 reviewed messages? This does not enable LIVE_SENDING, FOLLOW_UP_ENABLED or LEGAL_REVIEW_COMPLETED.');
    var props = PropertiesService.getScriptProperties();
    props.setProperty('STOCKWISE_SALES_SEND_GRANT', JSON.stringify(grant));
    props.setProperty('STOCKWISE_SALES_EMERGENCY_STOP', 'false');
    return { mode:'pilot', count:ids.length };
  });
}
function armReviewedRecurringSales() {
  return locked_(function () {
    var props = PropertiesService.getScriptProperties(), grant = salesPropertyJson_('STOCKWISE_SALES_SEND_GRANT');
    var ids = grant.queue && Object.keys(grant.queue), queue = sheetsStore_().rows('EmailQueue');
    if (grant.mode !== 'pilot' || !ids || ids.length < 1 || ids.length > 3 || props.getProperty('STOCKWISE_SALES_PILOT_DELIVERY_VERIFIED') !== 'true' ||
      queue.some(function (q) { return ['FAILED','SENDING'].indexOf(q.status) >= 0; }) || ids.some(function (id) {
        var rows = queue.filter(function (q) { return q.queue_id === id; });
        return rows.length !== 1 || rows[0].status !== 'SENT' || !rows[0].gmail_message_id || !rows[0].gmail_thread_id ||
          grant.queue[id] !== SalesCore.contentHash(rows[0].subject,rows[0].body,rows[0].to_email);
      })) throw new Error('PILOT_DELIVERY_VERIFICATION_REQUIRED');
    confirmedSalesOperation_('Confirm actual pilot delivery and unsubscribe handling were checked. Arm recurring processing of approved messages only? Sending switches stay unchanged.');
    if(sendController_().isStopped())throw Error('SEND_CONTROLLER_STOPPED');
    var settings=SalesEngine.loadSettings(deps_());
    if(settings.dailyLimit!==100||settings.runLimit<1||settings.runLimit>10)throw Error('DAILY_HUNDRED_CONFIGURATION_REQUIRED');
    grant.mode = 'recurring'; props.setProperty('STOCKWISE_SALES_SEND_GRANT', JSON.stringify(grant));
    props.setProperty('STOCKWISE_SALES_RECURRING_ENABLED','true');
    props.setProperty('STOCKWISE_SALES_EMERGENCY_STOP', 'false');
    return {mode:'recurring'};
  });
}
function dailySalesReport_(d) {
  var report = SalesEngine.dailySummary(d), props = PropertiesService.getScriptProperties();
  var key = 'STOCKWISE_SALES_REPORT_' + report.day;
  if (props.getProperty(key)) return {day:report.day,skipped:'ALREADY_REPORTED_OR_ATTEMPTED'};
  props.setProperty(key,'ATTEMPTED');
  d.store.append('ActivityLog',{timestamp:new Date().toISOString(),event:'DAILY_SUMMARY',lead_id:'',queue_id:'',detail:JSON.stringify(report)});
  if (props.getProperty('STOCKWISE_SALES_REPORT_EMAIL_ENABLED') === 'true') {
    try { GmailApp.sendEmail(Session.getEffectiveUser().getEmail(),'[Stockwise] Daily sales summary '+report.day,JSON.stringify(report,null,2)); }
    catch (e) { Logger.log('DAILY_REPORT_EMAIL_RESULT_UNCONFIRMED'); }
  }
  Logger.log(JSON.stringify(report)); return report;
}
function runDailySalesReport() { return locked_(function () { return dailySalesReport_(deps_()); }); }

/* Initial setup is explicitly restricted to the known TEST spreadsheet.
   It never sends mail, processes a queue, or creates triggers. */
function initializeAndVerifyTestCrm() {
  ensureLoaded_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var configured = props.getProperty('STOCKWISE_CRM_ID'), testConfigured = props.getProperty('STOCKWISE_TEST_CRM_ID');
  if (!ss || ss.getId() !== SALES_TEST_CRM_ID || (configured && configured !== SALES_TEST_CRM_ID) ||
      (testConfigured && testConfigured !== SALES_TEST_CRM_ID)) throw new Error('TEST_CRM_ONLY');
  var result = setupSheets({testLeads19:true});
  if (result && result.skipped) return result;
  return verifyTestCrmDeployment();
}

/* TEST only: creates missing safe sheets, imports research rows, repeats, and reads back counts.
   No email, trigger, sender-address fill or sending approval is performed. */
function verifyTestTwentyCompanyImport(csvText) {
  if (typeof csvText !== 'string' || csvText.length > 60000) throw new Error('PRIVATE_CSV_FILE_REQUIRED');
  var rows = Utilities.parseCsv(csvText.replace(/^\uFEFF/, '')), inputHeaders = rows.shift();
  if (!inputHeaders || ['company','country','source_url'].some(function (key) { return inputHeaders.indexOf(key) < 0; }) ||
      inputHeaders.some(function (key, i) { return inputHeaders.indexOf(key) !== i || SalesCore.TABLES.Leads.indexOf(key) < 0; })) throw new Error('UNSUPPORTED_IMPORT_CSV_HEADERS');
  var fields = ['company','country','source_url','domain','website','segment','industry'];
  var candidates = rows.filter(function (row) { return row.some(function (v) { return String(v).trim() !== ''; }); }).map(function (row) {
    if (row.length !== inputHeaders.length) throw new Error('IMPORT_CSV_ROW_LENGTH_MISMATCH');
    var candidate = {};fields.forEach(function (key) { var i = inputHeaders.indexOf(key); candidate[key] = i < 0 ? '' : String(row[i] || ''); });return candidate;
  });
  if (candidates.length !== 20) throw new Error('TEST_REQUIRES_EXACTLY_20_COMPANIES');
  var keys = candidates.map(SalesCore.companyResearchKey);
  if (keys.some(function (key, i) { return keys.indexOf(key) !== i; })) throw new Error('TEST_REQUIRES_20_DISTINCT_COMPANIES');
  var setup = initializeAndVerifyTestCrm();
  if (setup.skipped) return setup;
  if (!setup.liveSendingOff || !setup.followUpOff || !setup.legalReviewOff) throw new Error('TEST_SENDING_GATES_MUST_BE_OFF');
  return locked_(function () {
    var d = deps_(), headers = d.store.headers('Leads');
    if (headers.length !== 19) throw new Error('EXPECTED_TEST_LEADS_19_COLUMNS');
    var first = SalesEngine.importResearchCompanies(d, candidates);
    var second = SalesEngine.importResearchCompanies(d, candidates);
    if (first.matchedAfter !== 20 || second.matchedAfter !== 20 || second.inserted !== 0) throw new Error('TEST_IMPORT_REPLAY_VERIFICATION_FAILED');
    var result = {testCrm:true,columns:headers.length,first:first,rerun:second,gates:verifyTestCrmDeployment(),mailSent:0};
    Logger.log(JSON.stringify(result));return result;
  });
}

/* The prospect CSV stays in the owner's browser and private Google execution.
   It is never stored in Git, placed in HTML, or emitted to logs. */
function openTestResearchImport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== SALES_TEST_CRM_ID) throw new Error('TEST_CRM_ONLY');
  var html = '<!doctype html><html><body><p>TEST CRM: select the 20-company research CSV. No email will be sent.</p>' +
    '<input id="file" type="file" accept=".csv"><button id="run">Import and verify</button><pre id="result"></pre>' +
    '<script>document.getElementById("run").onclick=function(){var f=document.getElementById("file").files[0];if(!f)return;' +
    'if(f.size>120000){document.getElementById("result").textContent="CSV too large";return;}' +
    'var b=document.getElementById("run");b.disabled=true;var r=new FileReader();r.onload=function(){' +
    'google.script.run.withSuccessHandler(function(v){document.getElementById("result").textContent=JSON.stringify(v,null,2);b.disabled=false;})' +
    '.withFailureHandler(function(e){document.getElementById("result").textContent=e.message;b.disabled=false;})' +
    '.verifyTestTwentyCompanyImport(String(r.result));};r.onerror=function(){b.disabled=false;};r.readAsText(f);};</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(500),'Stockwise TEST research import');
}

/* Explicit, confirmed content migration only. Never runs from a trigger/send loop. */
function prepareSelectedSalesReapproval() {
 return locked_(function(){var ids=salesPropertyJson_('STOCKWISE_SALES_PILOT_QUEUE_IDS');
  if(!Array.isArray(ids)||ids.length<1||ids.length>3||ids.some(function(x,i){return typeof x!=='string'||ids.indexOf(x)!==i;}))throw Error('PILOT_REQUIRES_1_TO_3_UNIQUE_QUEUE_IDS');
  var store=sheetsStore_(),queue=store.rows('EmailQueue'),plans=ids.map(function(id){var found=queue.filter(function(q){return q.queue_id===id;});if(found.length!==1)throw Error('QUEUE_ID_NOT_UNIQUE');return {row:found[0]._row,patch:SalesCore.reReviewPatch(found[0])};});
  confirmedSalesOperation_('Replace only the selected copy and invalidate ALL its previous approvals? No sending or switches will be enabled.');
  plans.forEach(function(p){store.update('EmailQueue',p.row,p.patch);});if(store.flush)store.flush();return {changed:plans.length,approvalStatus:'DRAFT',sendingEnabled:false};
 });
}

function sharedRouteReview_(){
 var r=salesPropertyJson_('STOCKWISE_SALES_ROUTE_REVIEW'),at=Date.parse(r.reviewedAt||'');
 return r.mode==='APPS_SCRIPT_SINGLE_WRITER_V1'&&r.taskId==='Automation_7a12ae0699908191845ffd320d9b3358'&&r.chatgptDirectGmailDisabled===true&&r.otherDirectWritersDisabled===true&&typeof r.reviewedBy==='string'&&r.reviewedBy.trim()!==''&&typeof r.evidenceReference==='string'&&r.evidenceReference.trim()!==''&&isFinite(at)&&at<=Date.now()&&Session.getScriptTimeZone()==='America/Los_Angeles';
}
