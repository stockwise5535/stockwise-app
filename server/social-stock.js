import {APPROVED_STOCK,compose} from './social-content.js';
export function validateStockEntry(entry){
 if(!entry||Object.keys(entry).sort().join()!=='factIds,hook,id,network,text'||typeof entry.id!=='string'||!/^(linkedin|threads|x)-[0-9]{2}$/.test(entry.id))throw Error('STOCK_INVALID');
 if(!entry.id.startsWith(entry.network+'-'))throw Error('STOCK_INVALID');
 const candidate=compose(entry.network,{hook:entry.hook,factIds:entry.factIds});
 if(candidate.text!==entry.text)throw Error('STOCK_INVALID');
 return Object.freeze({...candidate,id:entry.id,network:entry.network});
}
export function approvedPostCatalog(){
 const catalog=APPROVED_STOCK.map(validateStockEntry);
 if(catalog.length>90||new Set(catalog.map(p=>p.id)).size!==catalog.length||new Set(catalog.map(p=>p.contentHash)).size!==catalog.length||!['linkedin','threads','x'].every(n=>catalog.some(p=>p.network===n)))throw Error('STOCK_INVALID');
 return catalog;
}
export function chooseStock(network,catalog,usedHashes,prior,now){
 const unused=catalog.filter(p=>p.network===network&&!usedHashes.has(p.contentHash));
 if(!unused.length)return {reason:'STOCK_EXHAUSTED'};
 const cutoff=new Date(+now-7*86400000).toISOString().slice(0,10);
 const candidate=unused.find(p=>!prior.some(old=>old.network===network&&old.day>=cutoff&&JSON.stringify([...(old.fact_ids||[])].sort())===JSON.stringify([...p.factIds].sort())));
 return candidate?{candidate}:{reason:'STOCK_COOLDOWN'};
}
