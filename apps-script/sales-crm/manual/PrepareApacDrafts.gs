/* Append-only, research-only draft preparation. No sends, approvals or triggers. */
function addApacDraftsOnly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== '12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk') throw Error('WRONG_CRM');
  ensureLoaded_();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var settings = ss.getSheetByName('Settings').getDataRange().getValues();
    ['LIVE_SENDING','FOLLOW_UP_ENABLED','LEGAL_REVIEW_COMPLETED'].forEach(function(key) {
      var found = settings.slice(1).filter(function(r){return String(r[0]).trim() === key;});
      if (found.length !== 1 || String(found[0][1]).trim().toUpperCase() !== 'FALSE') throw Error('SENDING_GATES_MUST_BE_OFF');
    });
    var store = sheetsStore_(), leads = store.rows('Leads'), queue = store.rows('EmailQueue');
    var headers = store.headers('EmailQueue');
    if (JSON.stringify(headers) !== JSON.stringify(SalesCore.TABLES.EmailQueue)) throw Error('QUEUE_HEADERS_REQUIRE_REVIEW');
    var hooks = ["How do you decide which products need another order first?", "When a delivery date changes, how do you check which orders need attention?", "How do you keep current stock and incoming quantities in the same view?", "Which part of reviewing stock before placing an order takes the most time?", "How do you check whether an item needs replenishment before placing an order?", "When stock builds up, how do you decide which items to review first?", "How do you compare stock on hand with the next expected delivery?", "Is there a simple way your team keeps track of items waiting for a stock check?", "How do you identify the items that need a purchasing decision this week?", "When an order is delayed, how do you review the affected stock?", "How do you keep stock checks consistent when several people are involved?", "Which information do you bring together before deciding on an order quantity?", "How do you keep an eye on items that are getting close to running out?", "How do you review incoming stock alongside what is already available?", "How do you separate items needing action from items that can wait?", "When plans change, how do you revisit the stock checks already in progress?", "What does your team check first when reviewing a possible stock shortage?", "How do you keep a shared list of stock issues that still need attention?", "How do you review items with plenty of stock before placing another order?", "How do you hand over outstanding inventory checks between team members?"];
    var targets = leads.filter(function(l) {return ['SG','AU'].indexOf(String(l.country).trim().toUpperCase()) >= 0;});
    if (targets.length !== 20) throw Error('EXPECTED_20_APAC_COMPANIES');
    var drafts = targets.map(function(l,i) {return {company:l.company,country:String(l.country).trim().toUpperCase(),subject:'Stock and reorder checks',
      body:'Hello,\n\n'+hooks[i]+'\n\nStockwise brings stock issues and the items to check next into one view. If useful, we can send a short example.\n\nIf you would prefer no more messages, just reply and we will stop.\n\nNexOps. Inc\nhttps://www.linkedin.com/company/nexops2026/'};});
    var plans = [], skipped = 0, keys = {};
    drafts.forEach(function(draft) {
      var key = SalesCore.companyResearchKey(draft);
      if (keys[key]) throw Error('DUPLICATE_INPUT_COMPANY'); keys[key] = true;
      var matched = leads.filter(function(l){return SalesCore.companyResearchKey(l) === key;});
      if (matched.length !== 1) throw Error('MISSING_OR_DUPLICATE_LEAD');
      var lead = matched[0], sendKey = SalesCore.sendKey(lead.lead_id,1), id = 'Q-APAC-' + lead.lead_id;
      var existing = queue.filter(function(q){return q.queue_id === id || q.send_key === sendKey || q.lead_id === lead.lead_id && Number(q.step) === 1;});
      if (existing.length > 1) throw Error('DUPLICATE_EXISTING_QUEUE');
      if (existing.length === 1) { skipped++; return; }
      if (lead.status !== 'RESEARCH' || String(lead.contact_email || '').trim() || String(lead.contact_basis || '').trim()) throw Error('LEAD_STATE_CHANGED_REQUIRES_REVIEW');
      var record = {queue_id:id,lead_id:lead.lead_id,step:1,send_key:sendKey,to_email:'',subject:draft.subject,body:draft.body,
        content_hash:SalesCore.contentHash(draft.subject,draft.body,''),language:'en',approval_status:'DRAFT',status:'BLOCKED',
        blocked_reason:'DRAFT_NOT_APPROVED;NO_VERIFIED_EMAIL;CONTACT_BASIS_UNVERIFIED;CONTACT_PURPOSE_REVIEW_REQUIRED;SENDER_IDENTITY_SETTINGS_INCOMPLETE;TEST_SEND_AND_UNSUBSCRIBE_NOT_VERIFIED',attempts:0};
      var row = {}; headers.forEach(function(h){row[h] = record[h] === undefined ? '' : record[h];}); plans.push(row);
    });
    if (drafts.length !== 20) throw Error('EXPECTED_20_APAC_DRAFTS');
    if (plans.length) {
      var backup = ss.getSheetByName('EmailQueue').copyTo(ss); backup.setName('ApacDraftBackup_' + new Date().getTime()); backup.hideSheet();
      plans.forEach(function(row){store.append('EmailQueue',row);});store.flush();
    }
    var after = store.rows('EmailQueue');
    plans.forEach(function(p){var found = after.filter(function(q){return q.queue_id === p.queue_id;});if(found.length !== 1 || found[0].body !== p.body || found[0].content_hash !== p.content_hash || found[0].status !== 'BLOCKED') throw Error('DRAFT_READBACK_FAILED_NO_AUTO_RETRY');});
    var result = {added:plans.length,skipped:skipped,totalDraftRows:after.length,mailSent:0,sendingSettingsChanged:false};
    Logger.log(JSON.stringify(result));return result;
  } finally {lock.releaseLock();}
}
