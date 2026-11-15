/* Generates a DISABLED example only. Never installs or loads a Mac service. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{fileURLToPath}from'node:url';
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function launchdTemplate({nodePath,scriptPath,workerCommit,searchPath,stateDir=path.join(os.homedir(),'.nexops','artifact-worker')}){
 if(!path.isAbsolute(nodePath)||!path.isAbsolute(scriptPath)||!/^\/[\s\S]+/.test(nodePath)||!(/^[a-f0-9]{40}$/.test(workerCommit||'')))throw Error('ABSOLUTE_PATHS_AND_PINNED_COMMIT_REQUIRED');
 const executablePath=searchPath||[path.dirname(nodePath),'/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin','/usr/sbin','/sbin'].join(':');
 if(executablePath.length>8192||/[\r\n\0]/.test(executablePath)||!executablePath.split(':').every(p=>path.isAbsolute(p))||!path.isAbsolute(stateDir))throw Error('ABSOLUTE_SEARCH_PATH_REQUIRED');
 return`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.nexops.artifact-worker</string>
<key>ProgramArguments</key><array><string>${escape(nodePath)}</string><string>${escape(scriptPath)}</string><string>--poll-once</string></array>
<key>StartInterval</key><integer>600</integer>
<key>RunAtLoad</key><false/>
<key>KeepAlive</key><false/>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${escape(path.join(stateDir,'run.log'))}</string>
<key>StandardErrorPath</key><string>${escape(path.join(stateDir,'error.log'))}</string>
<key>EnvironmentVariables</key><dict>
<key>PATH</key><string>${escape(executablePath)}</string>
<key>NEXOPS_AI_EXECUTION_ENABLED</key><string>false</string>
<key>NEXOPS_AI_EMERGENCY_STOP</key><string>true</string>
<key>NEXOPS_GITHUB_REPORT_WRITES</key><string>false</string>
<key>NEXOPS_HOSTING_GUARDS_VERIFIED</key><string>false</string>
<key>NEXOPS_MAX_DAILY_JOBS</key><string>2</string>
<key>NEXOPS_DESKTOP_NOTIFICATIONS</key><string>false</string>
<key>NEXOPS_WORKER_COMMIT</key><string>${workerCommit}</string>
</dict></dict></plist>\n`;
}
export function writeDisabledTemplate(commit){
 if(process.platform!=='darwin')throw Error('MAC_ONLY');
 const dir=path.join(os.homedir(),'.nexops','artifact-worker');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const info=fs.lstatSync(dir);if(!info.isDirectory()||info.isSymbolicLink()||fs.realpathSync(dir)!==dir||(info.mode&0o077)!==0)throw Error('PRIVATE_DIRECTORY_REQUIRED');
 const output=path.join(dir,'com.nexops.artifact-worker.plist.disabled');
 fs.writeFileSync(output,launchdTemplate({nodePath:process.execPath,scriptPath:fileURLToPath(new URL('./nexops-executor.mjs',import.meta.url)),workerCommit:commit,searchPath:process.env.PATH,stateDir:dir}),{mode:0o600,flag:'wx'});
 return{status:'DISABLED_TEMPLATE_WRITTEN',installed:false,loaded:false};
}
let entry;try{entry=process.argv[1]?fs.realpathSync(process.argv[1]):null;}catch{}
if(entry===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==4||process.argv[2]!=='--write-disabled-template')throw Error('USAGE');console.log(JSON.stringify(writeDisabledTemplate(process.argv[3])));}catch{console.log(JSON.stringify({status:'BLOCKED',reason:'TEMPLATE_NOT_WRITTEN'}));process.exitCode=1;}
}
