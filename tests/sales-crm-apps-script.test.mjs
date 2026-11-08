import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Core=require('../apps-script/sales-crm/Core.js');
const Engine=require('../apps-script/sales-crm/Engine.js');

const WED_10JST='2026-11-11T01:00:00Z';
function world(over={}, opts={}){
 const tables={Leads:[],EmailQueue:[],ActivityLog:[],Suppression:[],Settings:[]};
 const settings={SENDER_NAME:'Taro Test',SENDER_ADDRESS:'1-1 Test St, Tokyo',...over};
 for(const [key,value] of Object.entries(settings))tables.Settings.push({key,value});
 let clock=new Date(opts.now||WED_10JST), seq=0, sent=[], threads={};
 const store={
  rows:t=>tables[t].map((r,i)=>({...r,_row:i+2})), // copies, like real Sheets reads
  append:(t,o)=>{tables[t].push({...o});},
  update:(t,row,p)=>{Object.assign(tables[t][row-2],p);}
 };
 const mail={self:()=>'owner@stockwise.test',
  send:m=>{ if(opts.failSend)throw new Error('Gmail quota exceeded'); sent.push(m); const id='T'+sent.length; threads[id]=[{id:'M'+sent.length,from:'Owner <owner@stockwise.test>',date:clock.toISOString(),subject:m.subject,body:m.body}]; return {threadId:id,messageId:'M'+sent.length}; },
  threadMessages:id=>threads[id]||[]};
 const deps={store,mail,now:()=>clock,id:()=>String(++seq),
  localParts:d=>{const j=new Date(d.getTime()+9*3600e3);return {day:j.toISOString().slice(0,10),hour:j.getUTCHours(),dow:j.getUTCDay()};}};
 return {tables,deps,sent,threads,setNow:s=>{clock=new Date(s);},reply:(id,from,subject,body,date)=>threads[id].push({id:'R'+Math.random(),from,subject,body,date:date||new Date(clock.getTime()+1000).toISOString()})};
}
const lead=(o={})=>({company:'Acme Trading',domain:'',contact_name:'Sato',contact_email:'sato@acme.example',country:'JP',source_url:'https://acme.example/contact',contact_basis:'PUBLISHED_BUSINESS_CONTACT',status:'NEW',...o});
const LIVE={LIVE_SENDING:'TRUE',LEGAL_REVIEW_COMPLETED:'TRUE'};
function approveAll(w,who='owner'){for(const q of w.tables.EmailQueue){q.approval_status='APPROVED';q.approved_by=who;}Engine.snapshotApprovals(w.deps);}
function ready(w,leads=[lead()]){leads.forEach(l=>w.tables.Leads.push(l));Engine.dedupeLeads(w.deps);Engine.generateDrafts(w.deps);}

test('safe defaults: nothing is live, follow-ups off, legal review pending',()=>{
 const s=Core.settingsFrom([]);
 assert.equal(s.liveSending,false);assert.equal(s.followUpEnabled,false);assert.equal(s.legalReviewCompleted,false);assert.equal(s.signupVerified,false);
 assert.equal(Core.DEFAULT_SETTINGS.LIVE_SENDING[0],'false');assert.equal(Core.DEFAULT_SETTINGS.FOLLOW_UP_ENABLED[0],'false');
});
test('only the exact value TRUE enables a switch',()=>{
 for(const v of ['yes','1','on','truee',' ']) assert.equal(Core.settingsFrom([{key:'LIVE_SENDING',value:v}]).liveSending,false);
 assert.equal(Core.settingsFrom([{key:'LIVE_SENDING',value:true}]).liveSending,true);
 assert.equal(Core.settingsFrom([{key:'LIVE_SENDING',value:' TRUE '}]).liveSending,true);
});
test('dedupe: same email or same company domain flagged, freemail domains not merged',()=>{
 const w=world();
 [lead(),lead({contact_email:'SATO@acme.example '}),lead({contact_name:'Kato',contact_email:'kato@acme.example'}),
  lead({company:'A',contact_email:'a@gmail.com'}),lead({company:'B',contact_email:'b@gmail.com'})].forEach(l=>w.tables.Leads.push(l));
 const r=Engine.dedupeLeads(w.deps);
 const st=w.tables.Leads.map(l=>l.status);
 assert.deepEqual(st,['NEW','DUPLICATE','DUPLICATE','NEW','NEW']);assert.equal(r.duplicates,2);
 assert.equal(w.tables.Leads[1].contact_email,'sato@acme.example');
 assert.equal(w.tables.Leads[1].duplicate_of,w.tables.Leads[0].lead_id);
 assert.equal(Engine.dedupeLeads(w.deps).duplicates,0);
});
test('eligibility: invalid email, no basis, missing source, wrong country, freemail, suppressed are held',()=>{
 const w=world();
 w.tables.Suppression.push({value:'blocked.example',type:'domain'});
 [lead({contact_email:'bad'}),lead({contact_email:'b@b.example',contact_basis:''}),lead({contact_email:'c@c.example',source_url:''}),
  lead({contact_email:'d@d.example',country:'US'}),lead({contact_email:'e@gmail.com'}),lead({contact_email:'f@blocked.example'})].forEach(l=>w.tables.Leads.push(l));
 Engine.dedupeLeads(w.deps);const r=Engine.generateDrafts(w.deps);
 assert.equal(r.drafts,0);assert.equal(r.held,6);
 const notes=w.tables.Leads.map(l=>l.eligibility_note);
 assert.match(notes[0],/INVALID_EMAIL/);assert.match(notes[1],/NO_CONTACT_BASIS/);assert.match(notes[2],/NO_SOURCE_URL/);
 assert.match(notes[3],/COUNTRY_NOT_ALLOWED/);assert.match(notes[4],/FREEMAIL_BLOCKED/);assert.match(notes[5],/SUPPRESSED/);
});
test('drafts need sender identity and are created once per lead',()=>{
 const w=world({SENDER_NAME:'',SENDER_ADDRESS:''});ready(w);
 assert.equal(w.tables.EmailQueue.length,0);assert.match(w.tables.Leads[0].eligibility_note,/SENDER_IDENTITY_MISSING/);
 const w2=world();ready(w2);Engine.generateDrafts(w2.deps);
 assert.equal(w2.tables.EmailQueue.length,1);assert.equal(w2.tables.EmailQueue[0].approval_status,'DRAFT');
});
test('email copy: no product link or trial claim until signup journey verified; opt-out and sender always present',()=>{
 const l=lead({language:'ja'});
 const s0=Core.settingsFrom([{key:'SENDER_NAME',value:'Taro'},{key:'SENDER_ADDRESS',value:'Tokyo'},{key:'PRODUCT_URL',value:'https://app.example'}]);
 const m0=Core.buildEmail(l,s0,1);
 assert.ok(!m0.body.includes('https://app.example'));assert.ok(!/トライアル/.test(m0.body));
 assert.match(m0.body,/配信停止/);assert.match(m0.body,/Taro/);assert.match(m0.body,/Tokyo/);assert.match(m0.body,/公開ウェブサイト/);
 const s1=Core.settingsFrom([{key:'SENDER_NAME',value:'Taro'},{key:'SENDER_ADDRESS',value:'Tokyo'},{key:'PRODUCT_URL',value:'https://app.example'},{key:'SIGNUP_JOURNEY_VERIFIED',value:'TRUE'}]);
 const m1=Core.buildEmail(l,s1,1);
 assert.match(m1.body,/30日間の無料トライアル/);assert.match(m1.body,/英語/);assert.ok(!/日本語対応/.test(m1.body));
 const en=Core.buildEmail(lead({country:'SG'}),s1,1);
 assert.equal(en.language,'en');assert.match(en.body,/30-day free trial/);assert.match(en.body,/unsubscribe/);
 for(const m of [m0,m1,en])assert.deepEqual(Core.bannedPhrases(m.subject+m.body),[]);
 assert.ok(Core.bannedPhrases('Free forever, no credit card').length>=2);
});
test('dry run: approved + all checks pass -> DRY_RUN_OK, Gmail never called',()=>{
 const w=world({LEGAL_REVIEW_COMPLETED:'TRUE'});ready(w);approveAll(w);
 const r=Engine.processQueue(w.deps);
 assert.equal(r.mode,'DRY_RUN');assert.equal(r.dryRunOk,1);assert.equal(r.sent,0);assert.equal(w.sent.length,0);
 assert.equal(w.tables.EmailQueue[0].status,'DRY_RUN_OK');
});
test('unapproved drafts are never sent, even when everything else is live',()=>{
 const w=world(LIVE);ready(w);Engine.processQueue(w.deps);
 assert.equal(w.sent.length,0);assert.equal(w.tables.EmailQueue[0].status,'QUEUED');
 w.tables.EmailQueue[0].approval_status='APPROVED'; // approved but nobody named
 Engine.processQueue(w.deps);assert.equal(w.sent.length,0);assert.match(w.tables.EmailQueue[0].blocked_reason,/NOT_APPROVED/);
});
test('legal review pending blocks live sending',()=>{
 const w=world({LIVE_SENDING:'TRUE'});ready(w);approveAll(w);Engine.processQueue(w.deps);
 assert.equal(w.sent.length,0);assert.match(w.tables.EmailQueue[0].blocked_reason,/LEGAL_REVIEW_PENDING/);
});
test('live send happens exactly once, with thread id recorded; reruns do not resend',()=>{
 const w=world(LIVE);ready(w);approveAll(w);
 assert.equal(Engine.processQueue(w.deps).sent,1);assert.equal(Engine.processQueue(w.deps).sent,0);assert.equal(Engine.processQueue(w.deps).sent,0);
 assert.equal(w.sent.length,1);const q=w.tables.EmailQueue[0];
 assert.equal(q.status,'SENT');assert.equal(q.gmail_thread_id,'T1');assert.equal(w.tables.Leads[0].status,'CONTACTED');
 assert.equal(w.tables.ActivityLog.filter(l=>l.event==='SENT').length,1);
});
test('editing the email after approval blocks it',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.snapshotApprovals(w.deps);
 w.tables.EmailQueue[0].body+='\nP.S. extra claim';Engine.processQueue(w.deps);
 assert.equal(w.sent.length,0);assert.match(w.tables.EmailQueue[0].blocked_reason,/EDITED_AFTER_APPROVAL/);
});
test('changing the recipient after approval blocks it',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.snapshotApprovals(w.deps);
 w.tables.EmailQueue[0].to_email='someone-else@other.example';Engine.processQueue(w.deps);
 assert.equal(w.sent.length,0);assert.match(w.tables.EmailQueue[0].blocked_reason,/EDITED_AFTER_APPROVAL|RECIPIENT_MISMATCH/);
});
test('banned claims added before approval are blocked',()=>{
 const w=world(LIVE);ready(w);w.tables.EmailQueue[0].body+='\n永久無料でお使いいただけます';w.tables.EmailQueue[0].subject+='';approveAll(w);
 Engine.processQueue(w.deps);assert.equal(w.sent.length,0);assert.match(w.tables.EmailQueue[0].blocked_reason,/BANNED_CLAIM/);
});
test('body without opt-out line is blocked',()=>{
 const w=world(LIVE);ready(w);w.tables.EmailQueue[0].body='Hello, buy now.\nTaro';approveAll(w);
 Engine.processQueue(w.deps);assert.equal(w.sent.length,0);assert.match(w.tables.EmailQueue[0].blocked_reason,/NO_OPT_OUT_LINE/);
});
test('suppressed recipient is blocked at send time even if added after drafting',()=>{
 const w=world(LIVE);ready(w);approveAll(w);w.tables.Suppression.push({value:'sato@acme.example',type:'email'});
 Engine.processQueue(w.deps);assert.equal(w.sent.length,0);assert.match(w.tables.EmailQueue[0].blocked_reason,/SUPPRESSED/);
});
test('daily and per-run limits are enforced and deferred items are retried later',()=>{
 const w=world({...LIVE,DAILY_SEND_LIMIT:'3',RUN_SEND_LIMIT:'2'});
 ready(w,[1,2,3,4].map(i=>lead({contact_email:`p${i}@c${i}.example`,company:'C'+i})));approveAll(w);
 assert.equal(Engine.processQueue(w.deps).sent,2);
 assert.equal(Engine.processQueue(w.deps).sent,1);
 assert.equal(Engine.processQueue(w.deps).sent,0);assert.equal(w.sent.length,3);
 w.setNow('2026-11-12T01:00:00Z');assert.equal(Engine.processQueue(w.deps).sent,1);
});
test('send window: weekends and off-hours defer without blocking',()=>{
 const w=world(LIVE);ready(w);approveAll(w);
 w.setNow('2026-11-14T01:00:00Z');Engine.processQueue(w.deps); // Saturday JST
 w.setNow('2026-11-11T12:00:00Z');Engine.processQueue(w.deps); // 21:00 JST
 assert.equal(w.sent.length,0);assert.equal(w.tables.EmailQueue[0].status,'QUEUED');
 w.setNow(WED_10JST);Engine.processQueue(w.deps);assert.equal(w.sent.length,1);
});
test('one contact per company domain within the cooldown',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.processQueue(w.deps);
 w.tables.Leads.push(lead({company:'Acme 2',contact_email:'other@acme.example',status:'NEW'}));
 Engine.generateDrafts(w.deps);approveAll(w);
 const q2=w.tables.EmailQueue[1];assert.ok(q2);Engine.processQueue(w.deps);
 assert.equal(w.sent.length,1);assert.match(q2.blocked_reason,/DOMAIN_COOLDOWN/);
});
test('send failure is recorded, never auto-retried; a stuck SENDING row is never resent',()=>{
 const w=world(LIVE,{failSend:true});ready(w);approveAll(w);
 assert.equal(Engine.processQueue(w.deps).failed,1);Engine.processQueue(w.deps);Engine.processQueue(w.deps);
 const q=w.tables.EmailQueue[0];assert.equal(q.status,'FAILED');assert.equal(q.attempts,1);assert.match(q.error,/quota/);
 const w2=world(LIVE);ready(w2);approveAll(w2);w2.tables.EmailQueue[0].status='SENDING';
 Engine.processQueue(w2.deps);assert.equal(w2.sent.length,0);
});
test('duplicate send_key rows cannot both send',()=>{
 const w=world(LIVE);ready(w);const q=w.tables.EmailQueue[0];w.tables.EmailQueue.push({...q,queue_id:'Q-dupe'});approveAll(w);
 Engine.processQueue(w.deps);assert.equal(w.sent.length,1);
});
test('reply stops follow-ups and cancels pending drafts',()=>{
 const w=world({...LIVE,FOLLOW_UP_ENABLED:'TRUE',FOLLOW_UP_DELAY_DAYS:'5'});ready(w);approveAll(w);Engine.processQueue(w.deps);
 w.reply('T1','Sato <sato@acme.example>','Re: ご案内','詳しく教えてください');
 assert.deepEqual(Engine.checkReplies(w.deps),{replies:1,unsubscribes:0,bounces:0});
 assert.equal(w.tables.Leads[0].status,'REPLIED');
 w.setNow('2026-11-20T01:00:00Z');assert.equal(Engine.scheduleFollowUps(w.deps).drafts,0);
});
test('unsubscribe reply suppresses the address, cancels queue, and blocks future sends',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.processQueue(w.deps);
 w.reply('T1','Sato <sato@acme.example>','Re: ご案内','配信停止をお願いします。');
 assert.equal(Engine.checkReplies(w.deps).unsubscribes,1);
 assert.equal(w.tables.Suppression.length,1);assert.equal(w.tables.Suppression[0].value,'sato@acme.example');
 assert.equal(w.tables.Leads[0].status,'UNSUBSCRIBED');
 Engine.checkReplies(w.deps);assert.equal(w.tables.Suppression.length,1); // idempotent
 w.tables.Leads.push(lead({contact_email:'sato@acme.example',status:'NEW'}));
 const before=w.sent.length;w.tables.EmailQueue.push({...w.tables.EmailQueue[0],queue_id:'Q-new',send_key:'x#9',status:'QUEUED',step:1});
 Engine.processQueue(w.deps);assert.equal(w.sent.length,before);
});
test('quoted copy of our own opt-out line does not count as an unsubscribe',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.processQueue(w.deps);
 w.reply('T1','Sato <sato@acme.example>','Re: ご案内','興味があります。\n\n2026年11月11日 10:00 Taro <owner@stockwise.test> 書きました:\n> ご不要でしたら、このメールに「配信停止」とご返信ください。');
 const r=Engine.checkReplies(w.deps);assert.equal(r.unsubscribes,0);assert.equal(r.replies,1);
});
test('bounce suppresses the address; out-of-office is ignored',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.processQueue(w.deps);
 w.reply('T1','Sato <sato@acme.example>','自動返信: 不在のお知らせ','不在です');
 assert.deepEqual(Engine.checkReplies(w.deps),{replies:0,unsubscribes:0,bounces:0});
 w.reply('T1','Mail Delivery Subsystem <mailer-daemon@googlemail.com>','Delivery Status Notification (Failure)','550 user unknown');
 assert.equal(Engine.checkReplies(w.deps).bounces,1);assert.equal(w.tables.Suppression[0].reason,'bounce');
});
test('follow-ups are off by default; when on they are drafts that need approval, limited by MAX_FOLLOW_UPS',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.processQueue(w.deps);w.setNow('2026-11-20T01:00:00Z');
 assert.match(Engine.scheduleFollowUps(w.deps).skipped,/FOLLOW_UP_ENABLED=false/);assert.equal(w.tables.EmailQueue.length,1);
 const w2=world({...LIVE,FOLLOW_UP_ENABLED:'TRUE'});ready(w2);approveAll(w2);Engine.processQueue(w2.deps);
 w2.setNow('2026-11-13T01:00:00Z');assert.equal(Engine.scheduleFollowUps(w2.deps).drafts,0); // too early
 w2.setNow('2026-11-18T01:00:00Z');assert.equal(Engine.scheduleFollowUps(w2.deps).drafts,1);
 const f=w2.tables.EmailQueue[1];assert.equal(f.step,2);assert.equal(f.approval_status,'DRAFT');
 Engine.processQueue(w2.deps);assert.equal(w2.sent.length,1); // follow-up not sent without approval
 assert.equal(Engine.scheduleFollowUps(w2.deps).drafts,0); // no duplicate step-2
 f.approval_status='APPROVED';f.approved_by='owner';Engine.snapshotApprovals(w2.deps);Engine.processQueue(w2.deps);assert.equal(w2.sent.length,2);
 w2.setNow('2026-11-30T01:00:00Z');assert.equal(Engine.scheduleFollowUps(w2.deps).drafts,0); // MAX_FOLLOW_UPS=1
});
test('safety report and logs never contain secrets or email bodies',()=>{
 const w=world(LIVE);ready(w);approveAll(w);Engine.processQueue(w.deps);
 const text=Engine.safetyReport(w.deps)+JSON.stringify(w.tables.ActivityLog);
 assert.ok(!text.includes('サトウ')&&!text.includes(w.tables.EmailQueue[0].body));
});
test('Apps Script sources use no network calls and no Vercel/OAuth paths',async()=>{
 const fs=await import('node:fs');
 for(const f of ['Core.js','Engine.js','Main.js']){const t=fs.readFileSync(new URL('../apps-script/sales-crm/'+f,import.meta.url),'utf8');
  assert.ok(!/UrlFetchApp|fetch\(|vercel|oauth|api\.openai|anthropic/i.test(t),f);}
 const m=JSON.parse(fs.readFileSync(new URL('../apps-script/sales-crm/appsscript.json',import.meta.url),'utf8'));
 assert.ok(!m.oauthScopes.some(s=>/script\.external_request/.test(s)));
});
test('row is marked SENDING before Gmail is called (crash-safe against double send)',()=>{
 const w=world(LIVE);ready(w);approveAll(w);let seen;const orig=w.deps.mail.send;
 w.deps.mail.send=m=>{seen=w.tables.EmailQueue[0].status;return orig(m);};
 Engine.processQueue(w.deps);assert.equal(seen,'SENDING');
 // simulate a crash right after Gmail accepted the message: the row is left as SENDING and must never be re-sent
 const w2=world(LIVE);ready(w2);approveAll(w2);
 w2.deps.mail.send=()=>{throw new Error('process killed');};Engine.processQueue(w2.deps);
 w2.deps.mail.send=()=>{throw new Error('must not be called');};
 w2.tables.EmailQueue[0].status='SENDING';Engine.processQueue(w2.deps);assert.equal(w2.tables.EmailQueue[0].status,'SENDING');
});

test('marking APPROVED alone does not bypass explicit content approval recording',()=>{
 const w=world(LIVE);ready(w);
 const q=w.tables.EmailQueue[0];q.approval_status='APPROVED';q.approved_by='owner';
 Engine.processQueue(w.deps);assert.equal(w.sent.length,0);assert.match(q.blocked_reason,/EDITED_AFTER_APPROVAL/);
});
