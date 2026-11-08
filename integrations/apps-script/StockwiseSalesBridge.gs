/**
 * Stockwise Sales CRM - Google Apps Script mail bridge.
 * Standalone, zero-paid-API sender. Does NOT connect to Supabase yet.
 * Uses the six-tab CRM created by setupStockwiseSalesCRM().
 * Default: DRY RUN. Only verified opt-in recipients may be sent.
 * Never paste passwords or OAuth tokens into Sheets.
 */
const SW = Object.freeze({
  LEADS: 'Leads', QUEUE: 'EmailQueue', LOG: 'ActivityLog',
  SUPPRESSION: 'Suppression', SETTINGS: 'Settings',
  HEADERS: { leadId:0, email:6, basis:9, status:10, approved:11, reply:14, optout:15 }
});

function swSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('STOCKWISE_CRM_ID');
  if (!id) throw new Error('STOCKWISE_CRM_ID missing. Run setupStockwiseSalesCRM once in this Apps Script project.');
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}
function swRows_(name) {
  const sheet = swSheet_(name);
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
}
function swSettings_() {
  const out = {};
  for (const row of swRows_(SW.SETTINGS)) if (row[0]) out[String(row[0]).trim()] = String(row[1]).trim();
  return out;
}
function swEmail_(value) { return String(value || '').trim().toLowerCase(); }
function swYes_(value) { return value === true || ['true','yes','approved'].includes(String(value).trim().toLowerCase()); }
function swLog_(leadId,action,result,details) {
  swSheet_(SW.LOG).appendRow([new Date(),String(leadId),action,result,String(details).slice(0,400)]);
}
function swPreflight_(queueRow,leadRows,suppressed,settings,sentKeys) {
  const [id,to,subject,body,status,approved,scheduled] = queueRow;
  const email = swEmail_(to);
  if (!id || !email || !subject || !body) return 'missing_fields';
  if (String(status).toUpperCase() !== 'QUEUED') return 'not_queued';
  if (!swYes_(approved)) return 'queue_not_approved';
  if (scheduled && new Date(scheduled).getTime() > Date.now()) return 'not_due';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'invalid_email';
  if (suppressed.has(email)) return 'suppressed';
  const matching = leadRows.filter(r => String(r[0]) === String(id) && swEmail_(r[SW.HEADERS.email]) === email);
  if (matching.length !== 1) return 'lead_missing_or_duplicate';
  const lead = matching[0];
  if (!swYes_(lead[SW.HEADERS.approved])) return 'lead_not_approved';
  // Strict opt-in only. A public email address is NOT proof of permission.
  if (String(lead[SW.HEADERS.basis]).trim().toLowerCase() !== 'opt_in') return 'no_verified_opt_in';
  if (swYes_(lead[SW.HEADERS.optout])) return 'lead_opted_out';
  if (['REPLIED','BOUNCED','UNSUBSCRIBED'].includes(String(lead[SW.HEADERS.reply]).toUpperCase())) return 'reply_or_bounce';
  if (sentKeys.has(String(id) + '|' + email)) return 'already_sent';
  if (!settings.SENDER_NAME || !settings.POSTAL_ADDRESS || !settings.UNSUBSCRIBE_EMAIL) return 'sender_disclosures_missing';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.UNSUBSCRIBE_EMAIL)) return 'invalid_unsubscribe_email';
  return '';
}
function swRunSalesQueue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another queue run is active');
  try {
    const settings = swSettings_();
    const live = settings.LIVE_SENDING === 'true';
    const limit = Math.max(0, Math.min(5,Number(settings.DAILY_SEND_LIMIT || 0)));
    const leads = swRows_(SW.LEADS);
    const suppressed = new Set(swRows_(SW.SUPPRESSION).map(r=>swEmail_(r[0])).filter(Boolean));
    const queueSheet = swSheet_(SW.QUEUE);
    const queue = swRows_(SW.QUEUE);
    const sentKeys = new Set(queue.filter(r=>String(r[4]).toUpperCase()==='SENT')
      .map(r=>String(r[0])+'|'+swEmail_(r[1])));
    const today = Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
    let sentToday = queue.filter(r=>String(r[4]).toUpperCase()==='SENT' && r[7] instanceof Date &&
      Utilities.formatDate(r[7],Session.getScriptTimeZone(),'yyyy-MM-dd')===today).length;
    const preview = [];
    for (let i=0;i<queue.length;i++) {
      const row = queue[i], reason = swPreflight_(row,leads,suppressed,settings,sentKeys);
      if (String(row[4]).toUpperCase() !== 'QUEUED') continue;
      if (reason) { preview.push({row:i+2,decision:'SKIP',reason}); continue; }
      if (!live) { preview.push({row:i+2,decision:'DRY_RUN',reason:'LIVE_SENDING=false'}); continue; }
      if (sentToday>=limit || MailApp.getRemainingDailyQuota()<=0) {
        preview.push({row:i+2,decision:'SKIP',reason:'daily_limit'}); continue;
      }
      // Claim row BEFORE send. Uncertain outcomes require manual reconciliation, never automatic retry.
      queueSheet.getRange(i+2,5).setValue('SENDING_REVIEW');
      SpreadsheetApp.flush();
      const email=swEmail_(row[1]);
      const footer='\n\n'+settings.SENDER_NAME+'\n'+settings.POSTAL_ADDRESS+
        '\nTo stop these emails, reply to '+settings.UNSUBSCRIBE_EMAIL+' with UNSUBSCRIBE.';
      try {
        GmailApp.sendEmail(email,String(row[2]),String(row[3])+footer,
          {name:settings.SENDER_NAME,replyTo:settings.UNSUBSCRIBE_EMAIL});
        queueSheet.getRange(i+2,5).setValue('SENT');
        queueSheet.getRange(i+2,8).setValue(new Date());
        swLog_(row[0],'SEND','SENT','Gmail accepted send request');
        sentKeys.add(String(row[0])+'|'+email); sentToday++;
        preview.push({row:i+2,decision:'SENT'});
      } catch(e) {
        queueSheet.getRange(i+2,9).setValue(String(e).slice(0,250));
        swLog_(row[0],'SEND','SENDING_REVIEW','Uncertain delivery; manual reconciliation required');
        preview.push({row:i+2,decision:'SENDING_REVIEW'});
      }
    }
    Logger.log(JSON.stringify({live,remainingQuota:MailApp.getRemainingDailyQuota(),results:preview}));
    return preview;
  } finally { lock.releaseLock(); }
}
/** Safely demonstrate the gate logic without contacting any external recipient. */
function swDryRun() {
  const s=swSettings_();
  if(s.LIVE_SENDING==='true') throw new Error('Set LIVE_SENDING=false before dry run.');
  return swRunSalesQueue();
}
/** Manual suppression: call after recording a verified opt-out in Suppression sheet. */
function swSuppressEmail(email,reason) {
  const normalized=swEmail_(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Invalid email');
  const existing=new Set(swRows_(SW.SUPPRESSION).map(r=>swEmail_(r[0])));
  if (!existing.has(normalized)) swSheet_(SW.SUPPRESSION).appendRow([normalized,reason||'opt_out',new Date()]);
  swLog_('','SUPPRESS','OK','Suppression recorded');
}
