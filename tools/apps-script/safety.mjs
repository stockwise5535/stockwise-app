import {createHash, randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
import vm from 'node:vm';
export const FILES = ['Core.js', 'Engine.js', 'Main.js', 'コード.js', 'appsscript.json'];
export const TEST_CRM = '12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk';
export function requireSafe(condition, code) { if (!condition) throw new Error(code); }
export const hash = text => createHash('sha256').update(text).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
export function canonical(files) {
  return JSON.stringify(Object.keys(files).sort().map(name => [name, name === 'appsscript.json' ? stable(JSON.parse(files[name])) : files[name].replace(/\r\n/g, '\n')]));
}
export const digest = files => hash(canonical(files));
export function fromRemote(files) {
  const result = {};
  for (const file of files) {
    requireSafe(['SERVER_JS', 'HTML', 'JSON'].includes(file.type), 'UNSUPPORTED_REMOTE_TYPE');
    const name = file.name + ({SERVER_JS: '.js', HTML: '.html', JSON: '.json'})[file.type];
    requireSafe(!Object.hasOwn(result, name) && typeof file.source === 'string', 'INVALID_REMOTE_FILE');
    result[name] = file.source;
  }
  return result;
}
export function validateSource(files) {
  requireSafe(JSON.stringify(Object.keys(files).sort()) === JSON.stringify([...FILES].sort()), 'UNRECONCILED_SOURCE_FILES');
  const context = vm.createContext({});
  for (const name of FILES.filter(n => n.endsWith('.js'))) new vm.Script(files[name], {filename:name}).runInContext(context, {timeout:1000});
  context.ensureLoaded_();
  requireSafe(typeof context.sendTestToOwner === 'function' && typeof context.verifyTestCrmDeployment === 'function', 'MISSING_ENTRY_POINTS');
  const manifest = JSON.parse(files['appsscript.json']);
  requireSafe(manifest.runtimeVersion === 'V8', 'V8_REQUIRED');
  return context;
}
export function validateTargets(env, target) {
  requireSafe(['test','production'].includes(target), 'INVALID_TARGET');
  const keys = ['APPS_SCRIPT_TEST_SCRIPT_ID','APPS_SCRIPT_PRODUCTION_SCRIPT_ID','STOCKWISE_TEST_CRM_ID','STOCKWISE_CRM_ID'];
  for (const key of keys) {
    const required = target === 'production' || key === keys[0] || key === keys[2];
    if (required || env[key]) requireSafe(typeof env[key] === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(env[key]), 'MISSING_OR_INVALID_TARGET_CONFIG');
  }
  requireSafe(env.STOCKWISE_TEST_CRM_ID === TEST_CRM && (!env.STOCKWISE_CRM_ID || env.STOCKWISE_CRM_ID !== TEST_CRM), 'CRM_TARGET_COLLISION');
  requireSafe(!env.APPS_SCRIPT_PRODUCTION_SCRIPT_ID || env.APPS_SCRIPT_TEST_SCRIPT_ID !== env.APPS_SCRIPT_PRODUCTION_SCRIPT_ID, 'SCRIPT_TARGET_COLLISION');
  return {scriptId:env[target === 'test' ? keys[0] : keys[1]], parentId:env[target === 'test' ? keys[2] : keys[3]]};
}
export function authorizeWrite({operation, target, event, ref, confirmedSha, head, review, binding, remote, source, knownSources, patchReviewed}) {
  requireSafe(['bootstrap','deploy'].includes(operation), 'INVALID_WRITE_OPERATION');
  requireSafe(ref === 'refs/heads/main', 'MAIN_REF_REQUIRED');
  requireSafe(patchReviewed === true && review.status === 'reviewed' && review.bindingHash === binding, 'LIVE_REVIEW_REQUIRED');
  requireSafe(review.settingsVerifiedOff === true && review.manualEditsReconciled === true && review.ownerGmailTestPreserved === true, 'LIVE_SAFETY_ATTESTATION_REQUIRED');
  if (target === 'production') requireSafe(review.testRuntimeVerified === true && review.testSourceDigest === source && /^[0-9]+$/.test(review.testDeploymentRunId || ''), 'TEST_RUNTIME_VERIFICATION_REQUIRED');
  const manual = event === 'workflow_dispatch' && confirmedSha === head;
  if (target === 'production' || operation === 'bootstrap') requireSafe(manual, 'MANUAL_APPROVAL_REQUIRED');
  else requireSafe(event === 'push' || manual, 'INVALID_DEPLOY_EVENT');
  if (operation === 'bootstrap') {
    requireSafe(review.remoteDigest === remote && review.approvedSourceDigest === source, 'REVIEWED_SNAPSHOT_CHANGED');
  } else {
    // Only Git versions on main since the first reviewed version are eligible.
    requireSafe(knownSources.includes(review.approvedSourceDigest) && knownSources.includes(remote), 'UNREVIEWED_REMOTE_EDIT_OR_NO_BOOTSTRAP');
  }
}
export function encryptBackup(value, keyText) {
  keyText = typeof keyText === 'string' ? keyText.trim() : '';
  const key = Buffer.from(keyText || '', 'base64');
  requireSafe(key.length === 32 && key.toString('base64') === keyText, 'BACKUP_KEY_MUST_BE_32_BYTES_BASE64');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({version:1, algorithm:'aes-256-gcm', iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:encrypted.toString('base64')});
}
export function decryptBackup(text, keyText) {
  const data = JSON.parse(text), cipher = createDecipheriv('aes-256-gcm', Buffer.from(keyText,'base64'), Buffer.from(data.iv,'base64'));
  cipher.setAuthTag(Buffer.from(data.tag,'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data.ciphertext,'base64')),cipher.final()]).toString('utf8'));
}

export function requireProductionProtection(environment) {
  requireSafe(environment && Array.isArray(environment.protection_rules) && environment.protection_rules.some(rule => rule.type === 'required_reviewers' && Array.isArray(rule.reviewers) && rule.reviewers.length > 0), 'GITHUB_REQUIRED_REVIEWER_PROTECTION_MISSING');
}

export function validateRemoteFileSet(remote, source, operation) {
  // Every remote file must be kept. A reviewed initial bootstrap may ADD files.
  requireSafe(Object.keys(remote).every(name => Object.hasOwn(source, name)), 'REMOTE_FILES_REQUIRE_RECONCILIATION');
  if (operation !== 'bootstrap') requireSafe(Object.keys(remote).length === Object.keys(source).length, 'REMOTE_FILES_REQUIRE_RECONCILIATION');
  requireSafe(remote['コード.js'] === source['コード.js'], 'RETAINED_GOOGLE_ENTRY_POINT_CHANGED');
}
