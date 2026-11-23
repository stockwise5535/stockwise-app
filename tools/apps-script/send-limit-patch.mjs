// Pure payload preparation only: no Google authentication, network or writes.
import{createHash}from'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function patchDailyLimitCore(source){
 let next=source;
 for(const[from,to]of[["DAILY_SEND_LIMIT: ['10',","DAILY_SEND_LIMIT: ['100',"],['dailyLimit: num(map.DAILY_SEND_LIMIT, 10)','dailyLimit: num(map.DAILY_SEND_LIMIT, 100)'],['s.dailyLimit > 10 ||','s.dailyLimit > 100 ||']]){
  if(typeof next!=='string'||next.split(from).length!==2)throw Error('UNEXPECTED_CORE_LIMIT_SOURCE');
  next=next.replace(from,to);
 }
 return next;
}
export function buildReviewedSendingPatch(remote,replacements,review){
 if(!Array.isArray(remote?.files)||new Set(remote.files.map(f=>f.name)).size!==remote.files.length)throw Error('INVALID_REMOTE_SOURCE');
 for(const name of['Main','Engine','Core']){
  const file=remote.files.find(f=>f.name===name);
  if(!file||sha(file.source)!==review.expectedCurrentSourceHashes[name])throw Error('REMOTE_SOURCE_CHANGED');
 }
 const manifest=remote.files.find(f=>f.name==='appsscript');
 if(!manifest||sha(manifest.source)!==review.expectedCurrentManifestHash)throw Error('REMOTE_MANIFEST_CHANGED');
 const changes={Main:replacements.Main,Engine:replacements.Engine,Core:patchDailyLimitCore(remote.files.find(f=>f.name==='Core').source)};
 for(const name of Object.keys(changes))if(typeof changes[name]!=='string'||sha(changes[name])!==review.preparedSourceHashes[name])throw Error('UNREVIEWED_PREPARED_SOURCE');
 return{files:remote.files.map(f=>({name:f.name,type:f.type,source:changes[f.name]??f.source}))};
}
