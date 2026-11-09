/* Source updates only: never runs a Google function, sends mail, installs a trigger,
   changes Script Properties, creates a web deployment or edits spreadsheet data. */
import {readFile, writeFile, mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {google} from 'googleapis';
import {initAuth} from './node_modules/@google/clasp/build/src/auth/auth.js';
import {FILES, digest, canonical, hash, fromRemote, validateSource, validateTargets, authorizeWrite, encryptBackup, requireSafe, validateRemoteFileSet} from './safety.mjs';
import {safeFailureCode,remoteSourceState} from './diagnostics.mjs';
let deliveryStage='SETUP',mayHaveWritten=false;
const stage = value => { deliveryStage=value; };
const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = 'apps-script/sales-crm';
const git = args => execFileSync('git', args, {cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024}).trim();
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const localSource = async () => Object.fromEntries(await Promise.all(FILES.map(async f => [f, await readFile(path.join(root,folder,f),'utf8')])));
// git show must preserve exact trailing newlines; execFileSync without trim.
function historicalDigest(rev) {
  const files = Object.fromEntries(FILES.map(f => [f,execFileSync('git',['show',`${rev}:${folder}/${f}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})]));
  return digest(files);
}
async function run() {
  const env = process.env, operation = env.DELIVERY_OPERATION || 'inspect', target = env.DELIVERY_TARGET || 'test';
  requireSafe(['inspect','bootstrap','deploy'].includes(operation), 'INVALID_OPERATION');
  requireSafe(!env.DEBUG && !env.NODE_DEBUG, 'DEBUG_LOGGING_FORBIDDEN');
  const binding = validateTargets(env,target), bindingHash = hash(JSON.stringify(binding));
  const source = await localSource(); validateSource(source);
  requireSafe(env.CLASP_AUTH_FILE && path.isAbsolute(env.CLASP_AUTH_FILE) && !path.resolve(env.CLASP_AUTH_FILE).startsWith(root), 'AUTH_FILE_MUST_BE_OUTSIDE_REPOSITORY');
  stage('AUTHENTICATE');
  const auth = await initAuth({authFilePath:env.CLASP_AUTH_FILE,userKey:'default'});
  requireSafe(auth.credentials, 'GOOGLE_LOGIN_REQUIRED');
  const api = google.script({version:'v1',auth:auth.credentials});
  const options = {retry:false,timeout:30000};
  stage('READ_PROJECT');
  const metadata = (await api.projects.get({scriptId:binding.scriptId},options)).data;
  requireSafe(metadata.parentId === binding.parentId, 'GOOGLE_PARENT_BINDING_MISMATCH');
  const getRemote = async () => (await api.projects.getContent({scriptId:binding.scriptId},options)).data;
  stage('READ_SOURCE');
  const original = await getRemote(), remote = fromRemote(original.files || []);
  const out = path.resolve(env.DELIVERY_OUTPUT || path.join(root,'apps-script-delivery-output'));
  requireSafe(out !== root && !out.startsWith(path.join(root,'.git')), 'INVALID_OUTPUT_DIRECTORY');
  stage('BACKUP');
  const backup = encryptBackup({createdAt:new Date().toISOString(),binding,metadata,content:original},env.APPS_SCRIPT_BACKUP_KEY);
  await mkdir(out,{recursive:true,mode:0o700});
  await writeFile(path.join(out,'backup.enc.json'),backup,{mode:0o600});
  const report = {target,operation,bindingHash,remoteDigest:digest(remote),sourceDigest:digest(source),
    changedFiles:[...new Set([...Object.keys(remote),...Object.keys(source)])].filter(f => !Object.hasOwn(remote,f) || !Object.hasOwn(source,f) || canonical({[f]:remote[f]})!==canonical({[f]:source[f]})),
    sourceBackup:'AES-256-GCM',googleRuntimeExecution:'NOT_VERIFIED',settings:'NOT_READ_OR_CHANGED',status:'INSPECTED_NO_WRITE'};
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  const reference = await json(path.join(root,folder,'deployment',`${target}.review.json`));
  const sourceState=remoteSourceState(digest(remote),reference.approvedSourceDigest,reference.remoteDigest);
  report.sourceState=sourceState;
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(`Source inspection: ${sourceState}. No functions executed.`);
  if(env.GITHUB_ACTIONS==='true') console.log(`::notice title=Apps Script source state::state=${sourceState};target=${target};may_have_written=false`);
  if(operation === 'inspect') { console.log('Read-only inspection completed; encrypted backup and digest report saved. No Google writes.'); return; }
  stage('VERIFY_GUARDS');
  requireSafe(git(['status','--porcelain','--untracked-files=no']) === '', 'CLEAN_CHECKOUT_REQUIRED');
  validateRemoteFileSet(remote, source, operation);
  requireSafe(canonical({'appsscript.json':remote['appsscript.json']})===canonical({'appsscript.json':source['appsscript.json']}),'MANIFEST_CHANGED_REVIEW_REQUIRED');
  const review = await json(path.join(root,folder,'deployment',`${target}.review.json`));
  requireSafe(review.target === target,'REVIEW_TARGET_MISMATCH');
  const patch = await json(path.join(root,folder,'deployment/patch-review.json'));
  const head=git(['rev-parse','HEAD']);
  requireSafe(historicalDigest(head)===digest(source),'SOURCE_MUST_MATCH_HEAD');
  const knownSources=[]; let started=false;
  for(const rev of git(['rev-list','--first-parent','--reverse','HEAD']).split('\n')) {
    try {
      const value=historicalDigest(rev);
      if(value === review.approvedSourceDigest) started=true;
      if(started) knownSources.push(value);
    } catch { /* revisions before this feature have no complete source */ }
  }
  authorizeWrite({operation,target,event:env.GITHUB_EVENT_NAME,ref:env.GITHUB_REF,confirmedSha:env.CONFIRM_SHA,head,review,
    binding:bindingHash,remote:digest(remote),source:digest(source),knownSources,patchReviewed:patch.status==='reconciled'});
  stage('PRE_PUSH_READ');
  requireSafe(digest(fromRemote((await getRemote()).files || []))===digest(remote),'REMOTE_CHANGED_DURING_REVIEW');
  stage('STAGE_FILES');
  const staging = await mkdtemp(path.join(tmpdir(),'stockwise-clasp-'));
  try {
    // Preserve the exact remote manifest bytes after semantic equality was checked.
    // clasp otherwise prompts even for harmless JSON formatting changes.
    for(const name of FILES) await writeFile(path.join(staging,name),name === 'appsscript.json' ? remote[name] : source[name],{mode:0o600});
    const project=path.join(staging,'.clasp.json');
    await writeFile(project,JSON.stringify({scriptId:binding.scriptId,rootDir:'.',filePushOrder:['Core.js','Engine.js','Main.js'],skipSubdirectories:true}),{mode:0o600});
    report.status='PUSH_ATTEMPTED_RESULT_UNCONFIRMED';
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    // Exactly one attempt. Never use --force, watch, run, deploy or an automatic retry.
    stage('CLASP_PUSH'); mayHaveWritten=true;
    execFileSync(process.execPath,[path.join(root,'tools/apps-script/clasp-once.mjs'),
      '--auth',env.CLASP_AUTH_FILE,'--project',project,'push'],{cwd:staging,stdio:['ignore','pipe','pipe'],timeout:120000,
      env:{...env,DEBUG:'',NODE_DEBUG:''}});
    stage('VERIFY_READBACK');
    const after=fromRemote((await getRemote()).files || []);
    requireSafe(digest(after)===digest(source),'POST_PUSH_MISMATCH_MANUAL_REVIEW_NO_RETRY');
    validateSource(after);
    report.status='SOURCE_UPDATED_AND_READ_BACK';
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    if(env.GITHUB_ACTIONS==='true') console.log('::notice title=Apps Script source verified::state=APPROVED_SOURCE;write_verified=true;google_runtime=NOT_VERIFIED');
    console.log('Source updated and read-back digest verified. Google function execution, CRM settings and Gmail remain unverified; no functions were run.');
  } finally { await rm(staging,{recursive:true,force:true}); }
}
try { await run(); }
catch(error) {
  // OAuth/Google/clasp errors may contain source, tokens or personal information.
  const code=safeFailureCode(error);
  console.error(`Delivery stopped: ${code}. Stage=${deliveryStage}; may_have_written=${mayHaveWritten}. No automatic retry or rollback.`);
  if(process.env.GITHUB_ACTIONS==='true') console.log(`::error title=Apps Script delivery::stage=${deliveryStage};code=${code};may_have_written=${mayHaveWritten}`);
  process.exitCode=1;
}
