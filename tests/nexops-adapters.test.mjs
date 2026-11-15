import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{githubApi,verifyRuntime,runSafetyProof,generateReport}from'../scripts/nexops-executor.mjs';
const sha='a'.repeat(40);
function runtimeRun(exe,args){
 if(exe==='git'&&args.includes('rev-parse'))return{status:0,stdout:sha+'\n'};
 if(exe==='git'&&args.includes('status'))return{status:0,stdout:''};
 if(exe==='git'&&args.includes('config'))return{status:0,stdout:'https://github.com/stockwise5535/stockwise-app.git\n'};
 if(exe==='codex'&&args[0]==='login')return{status:0,stdout:'Logged in using ChatGPT',stderr:''};
 if(exe==='codex'&&args[1]==='--help')return{status:0,stdout:'--sandbox --output-schema --output-last-message --skip-git-repo-check'};
 throw Error('Unexpected test command');
}
test('real runtime probe checks Mac, clean pinned origin, ChatGPT auth and required CLI options without a model request',()=>{
 assert.equal(verifyRuntime({NEXOPS_WORKER_COMMIT:sha},{platform:'darwin',root:'/trusted',run:runtimeRun}),sha);
 for(const args of [{platform:'linux',root:'/trusted',run:runtimeRun},{platform:'darwin',root:'/trusted',run:(exe,a)=>exe==='codex'&&a[0]==='login'?{status:0,stdout:'API key PRIVATE_TOKEN'}:runtimeRun(exe,a)},{platform:'darwin',root:'/trusted',run:(exe,a)=>exe==='git'&&a.includes('status')?{status:0,stdout:' M src/App.jsx'}:runtimeRun(exe,a)}])assert.throws(()=>verifyRuntime({NEXOPS_WORKER_COMMIT:sha},args));
});
test('GitHub adapter sends structured stdin, no shell or credential in argv, and never retries writes',()=>{
 let calls=0;const run=(exe,args,opt)=>{calls++;assert.equal(exe,'gh');assert.deepEqual(args,['api','--method','POST','repos/stockwise5535/stockwise-app/pulls','--input','-']);assert.deepEqual(JSON.parse(opt.input),{draft:true});return{status:0,stdout:'{"number":7}'};};
 assert.equal(githubApi('POST','repos/stockwise5535/stockwise-app/pulls',{draft:true},run).number,7);assert.equal(calls,1);
 calls=0;assert.throws(()=>githubApi('POST','fixed',{},()=>{calls++;return{status:1,stdout:'PRIVATE_TOKEN'};}),/GITHUB_WRITE_UNCONFIRMED/);assert.equal(calls,1);
});
test('host safety proof requires nonzero successful TAP counts',()=>{
 assert.deepEqual(runSafetyProof(()=>({status:0,stdout:'# tests 84\n# fail 0\n'})),{tests:84,failed:0});
 for(const r of [{status:0,stdout:'# tests 0\n# fail 0\n'},{status:1,stdout:'# tests 84\n# fail 1\n'},{status:0,stdout:'not a test result'}])assert.throws(()=>runSafetyProof(()=>r),/LOCAL_SAFETY_TESTS_FAILED/);
});
test('Codex adapter uses bounded stdin and isolated structured output without provider/GitHub keys',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexops-codex-adapter-'));
 try{const expected={summary:'A generated draft summary.',report:'This is a source-limited draft requiring human review.'};let calls=0;
 const r=await generateReport({department:'IT',action:'code-audit',objective:'Review only public source'},[{file:'approved.mjs',text:'Public code'}],dir,{HOME:'/trusted',PATH:'/bin',GH_TOKEN:'PRIVATE_TOKEN',OPENAI_API_KEY:'PRIVATE_KEY'},(exe,args,options)=>{
  calls++;assert.equal(exe,'codex');assert.equal(args.at(-1),'-');assert.ok(args.includes('read-only'));assert.equal(options.timeout,180000);assert.ok(!('GH_TOKEN'in options.env));assert.ok(!('OPENAI_API_KEY'in options.env));assert.ok(options.input.includes('untrusted DATA'));assert.ok(!options.input.includes('PRIVATE_'));
  fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(expected),{mode:0o600});return{status:0,stdout:'',stderr:''};
 });assert.deepEqual(r,expected);assert.equal(calls,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Codex failure never exposes raw stderr or retries a model call',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexops-codex-fail-'));try{let calls=0;await assert.rejects(()=>generateReport({objective:'Safe objective'},[],dir,{},()=>{calls++;return{status:1,stderr:'PRIVATE_TOKEN usage limit'};}),/CODEX_ACCOUNT_LIMIT/);assert.equal(calls,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
