/* Stockwise Sales CRM - Apps Script entry points (container-bound to the "Stockwise Sales CRM" spreadsheet).
   Defaults are safe: LIVE_SENDING=false and FOLLOW_UP_ENABLED=false. See README.md. */
var DATE_COLS = ['created_at', 'updated_at', 'last_contacted_at', 'approved_at', 'scheduled_at', 'sent_at', 'timestamp', 'added_at'];

function sheetsStore_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function sh(t) { var s = ss.getSheetByName(t); if (!s) throw new Error('Missing sheet: ' + t + ' (run Setup first)'); return s; }
  function headers(s) { return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String); }
  return {
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
      var opts = { name: m.name || undefined }; if (m.replyTo) opts.replyTo = m.replyTo;
      var msg = GmailApp.createDraft(m.to, m.subject, m.body, opts).send(); // returns the sent message, so we keep thread/message IDs
      return { threadId: msg.getThread().getId(), messageId: msg.getId() };
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
    store: sheetsStore_(), mail: gmailAdapter_(),
    now: function () { return new Date(); },
    localParts: function (d) { return { day: Utilities.formatDate(d, tz, 'yyyy-MM-dd'), hour: Number(Utilities.formatDate(d, tz, 'H')), dow: Number(Utilities.formatDate(d, tz, 'u')) % 7 }; },
    id: function () { return Utilities.getUuid().slice(0, 8); }
  };
}
function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Another run is in progress; skipped.'); return { skipped: 'LOCKED' }; }
  try { return fn(); } finally { lock.releaseLock(); }
}
function toast_(msg) { try { SpreadsheetApp.getActiveSpreadsheet().toast(String(msg), 'Stockwise Sales', 8); } catch (e) { Logger.log(msg); } }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Stockwise Sales')
    .addItem('1. Setup sheets (safe, keeps data)', 'setupSheets')
    .addItem('2. Safety report', 'showSafetyReport')
    .addItem('3. Normalize + dedupe leads', 'runDedupe')
    .addItem('4. Generate drafts', 'runGenerateDrafts')
    .addItem('5. Process queue (dry run unless LIVE_SENDING=TRUE)', 'runProcessQueue')
    .addItem('6. Check replies / unsubscribes', 'runCheckReplies')
    .addSeparator().addItem('Send test email to myself only', 'sendTestToOwner')
    .addItem('Install hourly triggers', 'installTriggers').addItem('Remove triggers', 'removeTriggers').addToUi();
}

/* Creates missing sheets/headers/settings. Never deletes or overwrites existing data or setting values. */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), T = SalesCore.TABLES;
  // Existing 2026 CRM uses display-name headers, not this schema. Never append incompatible headers into populated sheets.
  Object.keys(T).forEach(function (name) {
    var old = ss.getSheetByName(name);
    if (old && old.getLastRow() > 1) {
      var existingHeaders = old.getRange(1, 1, 1, old.getLastColumn()).getValues()[0].map(String);
      if (existingHeaders[0] !== T[name][0]) throw new Error('INCOMPATIBLE_EXISTING_CRM_SCHEMA: ' + name + '. Existing data preserved. Run migration before setup.');
    }
    var s = ss.getSheetByName(name) || ss.insertSheet(name), cols = T[name];
    var have = s.getLastColumn() ? s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String) : [];
    cols.forEach(function (c) { if (have.indexOf(c) < 0) { s.getRange(1, have.length + 1).setValue(c); have.push(c); } });
    s.setFrozenRows(1); s.getRange(1, 1, 1, have.length).setFontWeight('bold');
    have.forEach(function (c, i) { if (DATE_COLS.indexOf(c) >= 0) s.getRange(2, i + 1, 2000, 1).setNumberFormat('@'); });
  });
  var st = ss.getSheetByName('Settings'), existing = {};
  st.getDataRange().getValues().slice(1).forEach(function (r) { existing[String(r[0])] = true; });
  Object.keys(SalesCore.DEFAULT_SETTINGS).forEach(function (k) { if (!existing[k]) st.appendRow([k, SalesCore.DEFAULT_SETTINGS[k][0], SalesCore.DEFAULT_SETTINGS[k][1]]); });
  var qs = ss.getSheetByName('EmailQueue'), qh = qs.getRange(1, 1, 1, qs.getLastColumn()).getValues()[0];
  var ac = qh.indexOf('approval_status') + 1; // dropdown so approval is a deliberate choice
  qs.getRange(2, ac, 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['DRAFT', 'APPROVED', 'REJECTED'], true).build());
  buildDashboard_(ss);
  toast_('Setup complete. LIVE_SENDING and FOLLOW_UP_ENABLED remain FALSE.');
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
  d.getRange(1, 1, rows.length, 2).setFormulas(rows.map(function (r) { return [r[0], r[1] === '' ? '' : r[1]]; })); d.getRange(1, 1).setFontWeight('bold'); d.autoResizeColumn(1);
}

function runDedupe() { var r = locked_(function () { return SalesEngine.dedupeLeads(deps_()); }); toast_('Dedupe: ' + JSON.stringify(r)); return r; }
function runGenerateDrafts() { var r = locked_(function () { return SalesEngine.generateDrafts(deps_()); }); toast_('Drafts: ' + JSON.stringify(r)); return r; }
function runProcessQueue() { var r = locked_(function () { return SalesEngine.processQueue(deps_()); }); toast_('Queue: ' + JSON.stringify(r)); return r; }
function runCheckReplies() { var r = locked_(function () { return SalesEngine.checkReplies(deps_()); }); toast_('Replies: ' + JSON.stringify(r)); return r; }
function runFollowUps() { return locked_(function () { return SalesEngine.scheduleFollowUps(deps_()); }); }
function showSafetyReport() { var t = SalesEngine.safetyReport(deps_()); try { SpreadsheetApp.getUi().alert(t); } catch (e) { Logger.log(t); } return t; }

/* Hourly: replies first (so a reply/unsubscribe is always seen before the next send), then queue. */
function hourlyRun() {
  locked_(function () { var d = deps_(); SalesEngine.checkReplies(d); SalesEngine.snapshotApprovals(d); SalesEngine.processQueue(d); });
}
function dailyRun() { locked_(function () { var d = deps_(); SalesEngine.dedupeLeads(d); SalesEngine.generateDrafts(d); SalesEngine.scheduleFollowUps(d); }); }
function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('hourlyRun').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyRun').timeBased().atHour(8).everyDays(1).create();
  toast_('Triggers installed (hourlyRun, dailyRun). Sending still requires LIVE_SENDING=TRUE.');
}
function removeTriggers() { ScriptApp.getProjectTriggers().forEach(function (t) { if (['hourlyRun', 'dailyRun'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); }); }

/* Always allowed, even with LIVE_SENDING=FALSE, because the recipient is hard-wired to the script owner. */
function sendTestToOwner() {
  var me = Session.getEffectiveUser().getEmail(), s = SalesEngine.loadSettings(deps_());
  var sample = SalesCore.buildEmail({ company: 'Sample Co', contact_name: 'Test', country: 'JP', contact_basis: 'PUBLISHED_BUSINESS_CONTACT', source_url: 'https://example.com' }, s, 1);
  GmailApp.sendEmail(me, '[TEST] ' + sample.subject, sample.body, { name: s.senderName || undefined });
  deps_().store.append('ActivityLog', { timestamp: new Date().toISOString(), event: 'TEST_SENT_TO_OWNER', lead_id: '', queue_id: '', detail: 'owner only' });
  toast_('Test sent to ' + me);
}
