// Research ledger cycle. Pure logic; all I/O is injected by scripts/sales-research-cycle.mjs.
// Facts only: company, country, official URL, evidence URL, verification tier. Never emails, never contact permission.
// Re-uses the CRM's own dedupe key and import planner (apps-script/sales-crm/Core.js) read-only, so TEST/production semantics cannot drift.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Core=require('../apps-script/sales-crm/Core.js');
export const LIMITS=Object.freeze({maxNewPerRun:20,maxRecheckPerRun:10,recheckEveryDays:30,failuresBeforeFlag:3,maxImportBatch:20,costUsd:0});
export const IMPORTABLE_TIERS=Object.freeze(['A']); // Official-page confirmation only; B/C remain research candidates.
const IMPORT_FIELDS=['company','country','source_url','domain','website','segment','industry'];
const LEDGER_FIELDS=new Set([...IMPORT_FIELDS,'verification_tier','verification_note','verified_at','discovered_by','status','consecutive_recheck_failures','last_recheck_at','last_recheck_result']);
export const keyOf=e=>Core.companyResearchKey({company:e.company,country:e.country});
export function researchUrl(value){
  if(typeof value!=='string'||value.length>2048||/\s/.test(value))return false;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
    /^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname)&&!/(?:^|\.)(?:localhost|local|internal|invalid|test)$/i.test(u.hostname)&&
    ![...u.searchParams.keys()].some(k=>/token|secret|password|api.?key|authorization/i.test(k));}catch{return false;}
}
const unsafe=v=>/^[=+@-]/.test(String(v||'').trim());
export function validateEntry(e){
  const p=[];
  if(!e||typeof e!=='object'||Array.isArray(e))return ['ENTRY'];
  if(Object.keys(e).some(k=>!LEDGER_FIELDS.has(k)))p.push('UNKNOWN_LEDGER_FIELD');
  if(!e||!String(e.company||'').trim()||String(e.company).length>200||unsafe(e.company))p.push('COMPANY');
  if(!['JP','SG','AU'].includes(String(e?.country||'').toUpperCase()))p.push('COUNTRY');
  if(!researchUrl(e?.source_url))p.push('EVIDENCE_URL_HTTPS');
  if(e.website&&!researchUrl(e.website)&&!/^http:\/\/[a-z][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(e.website))p.push('WEBSITE_URL');
  if(!['A','B','C'].includes(e?.verification_tier))p.push('TIER');
  if(e&&['website','domain','segment','industry'].some(k=>unsafe(e[k])))p.push('UNSAFE_CELL');
  if(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(JSON.stringify(e)))p.push('EMAIL_NOT_ALLOWED_IN_LEDGER');
  if(IMPORT_FIELDS.some(k=>e[k]!==undefined&&typeof e[k]!=='string'))p.push('FIELD_TYPE');
  if(Object.values(e).some(v=>typeof v==='string'&&v.length>4000))p.push('FIELD_LENGTH');
  return p;
}
// NEW DISCOVERY: inbox entries that are not already in the ledger. Existing entries are never overwritten here.
export function discover(ledger,inbox,{now=new Date(),max=LIMITS.maxNewPerRun}={}){
  max=cap(max,LIMITS.maxNewPerRun);
  const seen=new Set(ledger.map(keyOf)),added=[],duplicates=[],rejected=[];
  for(const raw of inbox){
    const bad=validateEntry(raw);if(bad.length){rejected.push({company:raw?.company,reasons:bad});continue;}
    const e={...raw,country:raw.country.toUpperCase(),status:raw.verification_tier==='A'?'verified':'needs_official_confirmation',consecutive_recheck_failures:0,last_recheck_at:null,verified_at:raw.verified_at||now.toISOString()};
    const k=keyOf(e);
    if(seen.has(k)){duplicates.push(e.company);continue;}
    if(added.length>=max){rejected.push({company:e.company,reasons:['RUN_CAP_REACHED']});continue;}
    seen.add(k);added.push(e);
  }
  return {added,duplicates,rejected};
}
// EXISTING-CANDIDATE RECHECK: which already-known companies are due for a reachability check.
export function dueForRecheck(ledger,{now=new Date(),max=LIMITS.maxRecheckPerRun,everyDays=LIMITS.recheckEveryDays}={}){
  max=cap(max,LIMITS.maxRecheckPerRun);everyDays=Math.max(LIMITS.recheckEveryDays,Number(everyDays)||LIMITS.recheckEveryDays);
  return ledger.filter(e=>e.website).filter(e=>!e.last_recheck_at||now-Date.parse(e.last_recheck_at)>=everyDays*864e5)
    .sort((a,b)=>String(a.last_recheck_at||'').localeCompare(String(b.last_recheck_at||''))).slice(0,max);
}
// result: {ok:boolean, kind:'OK'|'NETWORK'|'HTTP'|'NAME_MISSING'}. A network error never downgrades a company; only repeated definitive failures flag it.
export function applyRecheck(e,result,now=new Date()){
  const n={...e,last_recheck_at:now.toISOString(),last_recheck_result:result.kind};
  if(result.ok){n.consecutive_recheck_failures=0;return n;}
  if(['NETWORK','UNAVAILABLE','INVALID_URL','TOO_LARGE'].includes(result.kind))return n;
  n.consecutive_recheck_failures=(e.consecutive_recheck_failures||0)+1;
  if(n.consecutive_recheck_failures>=LIMITS.failuresBeforeFlag)n.status='needs_official_confirmation';
  return n;
}
// Review candidates use the existing CRM CSV columns. No file constitutes production approval.
export function csvEscape(v){const s=String(v??'');return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function cap(n,limit){return Number.isInteger(n)&&n>=0?Math.min(n,limit):limit;}
export const isImportable=e=>validateEntry(e).length===0&&IMPORTABLE_TIERS.includes(e.verification_tier)&&e.status==='verified';
export function toImportCsv(entries){
  if(entries.length>LIMITS.maxImportBatch||entries.some(e=>!isImportable(e)))throw Error('IMPORT_REVIEW_REQUIRED');
  return [IMPORT_FIELDS.join(','),...entries.map(e=>IMPORT_FIELDS.map(k=>csvEscape(e[k])).join(','))].join('\n')+'\n';
}
export function importBatch(ledger,{tiers=IMPORTABLE_TIERS,importedKeys=[],max=LIMITS.maxImportBatch}={}){
  const done=new Set(importedKeys);
  return ledger.filter(e=>isImportable(e)&&tiers.includes(e.verification_tier)&&!done.has(keyOf(e))).slice(0,cap(max,LIMITS.maxImportBatch));
}
export function verifyImportPlan(entries,headers,existing=[]){ // dry-runs the CRM's own planner against a physical header shape (17 / 19 / 21 columns)
  const plan=Core.planResearchCompanyImport(existing,entries.map(e=>Object.fromEntries(IMPORT_FIELDS.map(k=>[k,e[k]]))),headers,'2026-01-01T00:00:00.000Z');
  return {willInsert:plan.appendRows.length,willSkip:plan.skipped,columns:headers.length};
}
export function leadsHeaders(n){return Core.TABLES.Leads.slice(0,n);}
export function renderCycleReport({date,mode,discovery,recheck,sources,caps,stop,failures}){
  const L=[`# 営業調査サイクル日報 ${date}`,'',`実行モード: ${mode} / 有料API費用: $${LIMITS.costUsd}(呼び出しなし。Actions等の利用枠は別途確認)`,stop?`**緊急停止中のため何も実行していません: ${stop}**`:'',''];
  L.push('## 新規企業の発見',discovery?`受付 ${discovery.added.length}社 / 既存と重複 ${discovery.duplicates.length}社 / 却下 ${discovery.rejected.length}社`:'未実行(新規候補の入力なし。無料の審査済みソースも未設定)','');
  L.push('## 既存候補の再確認(新規発見とは別)',recheck?`対象 ${recheck.attempted}社 / 到達確認 ${recheck.ok}社 / ネットワーク不通 ${recheck.network}社 / 要確認へ変更 ${recheck.flagged}社`:'未実行','');
  L.push('## 台帳',sources?`合計 ${sources.total}社(確認A ${sources.A} / 公的資料B ${sources.B} / ディレクトリのみC ${sources.C})。取り込みレビュー候補: ${sources.importable}社(Aのみ。実CRMへの登録は未実行)`:'','');
  if(failures?.length)L.push('## 失敗',...failures.map(f=>'- '+f),'');
  L.push('## 上限','- 新規 最大'+LIMITS.maxNewPerRun+'社/回、再確認 最大'+LIMITS.maxRecheckPerRun+'社/回、CRM取り込み 最大'+LIMITS.maxImportBatch+'社/バッチ','- メールアドレスの収集・保存、送信承認、CRMへの書き込みは行いません');
  return L.filter(x=>x!==undefined).join('\n');
}
