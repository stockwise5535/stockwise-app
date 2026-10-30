#!/usr/bin/env node
// Safe default: offline only. --read-dev-kpis performs aggregate reads against the verified dev ref.
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {collectGrowthKpis} from '../services/growth-kpis.js'
import {prepareAcquisition,writeAcquisitionReport} from '../services/acquisition-preparation.js'
const args=process.argv.slice(2),allowed=new Set(['--read-dev-kpis','--from','--to','--start-date','--output'])
try{
 const options={};for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error('INVALID_ARGUMENT');const key=args[i];options[key]=key==='--read-dev-kpis'?true:args[++i];if(options[key]===undefined)throw Error('INVALID_ARGUMENT')}
 const now=new Date(),to=options['--to'] || now.toISOString(),from=options['--from'] || new Date(+new Date(to)-7*86400000).toISOString()
 const root=fileURLToPath(new URL('../',import.meta.url))
 const kpis=await collectGrowthKpis({env:options['--read-dev-kpis']?process.env:{},from,to})
 if(!options['--read-dev-kpis'])for(const value of Object.values(kpis))if(value?.reason==='development_configuration_required')value.reason='offline_read_not_requested'
 const pack=prepareAcquisition({origin:process.env.VITE_PUBLIC_SITE_URL || undefined,startDate:options['--start-date'] || now.toISOString().slice(0,10)})
 const candidates=JSON.parse(await readFile(join(root,'data/acquisition/research.json'),'utf8'))
 const result=await writeAcquisitionReport({directory:options['--output'] || join(root,'logs/acquisition'),pack,kpis,candidates})
 console.log(JSON.stringify(result))
}catch{console.error(JSON.stringify({status:'blocked',reason:'CONFIGURATION_ARGUMENT_OR_LOCAL_REPORT_ERROR',external_writes:0}));process.exitCode=1}
