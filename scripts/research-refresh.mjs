#!/usr/bin/env node
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join,resolve} from 'node:path'
import {refreshResearch} from '../services/research-refresh.js'
try{
 const args=process.argv.slice(2);let readPublic=false,output=resolve('logs/growth')
 for(let i=0;i<args.length;i++){if(args[i]==='--read-public')readPublic=true;else if(args[i]==='--output'&&args[i+1])output=resolve(args[++i]);else throw Error('INVALID_ARGUMENT')}
 const source=fileURLToPath(new URL('../data/acquisition/research.json',import.meta.url)),candidates=JSON.parse(await readFile(source,'utf8'))
 const result=await refreshResearch(candidates,{readPublic});await mkdir(output,{recursive:true,mode:0o700});await writeFile(join(output,'research-revalidation.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify({status:'research_report_ready',mode:result.mode,requests:result.requests,candidates:result.candidates.length,external_writes:0}))
}catch{console.error(JSON.stringify({status:'blocked',reason:'RESEARCH_INPUT_OR_OUTPUT_UNAVAILABLE',external_writes:0}));process.exitCode=1}
