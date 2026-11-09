// Only fixed labels leave this module. Never return raw SDK/CLI errors or URLs.
const known=new Set([
 'INVALID_OPERATION','DEBUG_LOGGING_FORBIDDEN','INVALID_TARGET','MISSING_OR_INVALID_TARGET_CONFIG',
 'CRM_TARGET_COLLISION','SCRIPT_TARGET_COLLISION','AUTH_FILE_MUST_BE_OUTSIDE_REPOSITORY',
 'GOOGLE_LOGIN_REQUIRED','GOOGLE_PARENT_BINDING_MISMATCH','INVALID_OUTPUT_DIRECTORY',
 'BACKUP_KEY_MUST_BE_32_BYTES_BASE64','CLEAN_CHECKOUT_REQUIRED','REMOTE_FILES_REQUIRE_RECONCILIATION',
 'RETAINED_GOOGLE_ENTRY_POINT_CHANGED','MANIFEST_CHANGED_REVIEW_REQUIRED','REVIEW_TARGET_MISMATCH',
 'SOURCE_MUST_MATCH_HEAD','INVALID_WRITE_OPERATION','MAIN_REF_REQUIRED','LIVE_REVIEW_REQUIRED',
 'LIVE_SAFETY_ATTESTATION_REQUIRED','TEST_RUNTIME_VERIFICATION_REQUIRED','MANUAL_APPROVAL_REQUIRED',
 'INVALID_DEPLOY_EVENT','REVIEWED_SNAPSHOT_CHANGED','UNREVIEWED_REMOTE_EDIT_OR_NO_BOOTSTRAP',
 'REMOTE_CHANGED_DURING_REVIEW','POST_PUSH_MISMATCH_MANUAL_REVIEW_NO_RETRY',
 'UNSUPPORTED_REMOTE_TYPE','INVALID_REMOTE_FILE','UNRECONCILED_SOURCE_FILES','MISSING_ENTRY_POINTS','V8_REQUIRED'
]);
export function safeFailureCode(error) {
 if(known.has(error?.message))return error.message;
 const status=Number(error?.response?.status);
 if([400,401,403,404,409,429,500,502,503,504].includes(status))return 'GOOGLE_HTTP_'+status;
 const text=[error?.message,error?.stderr,error?.stdout].map(v=>Buffer.isBuffer(v)?v.toString('utf8'):typeof v==='string'?v:'').join('\n');
 const patterns=[
  [/insufficient.*(?:authentication )?scopes?|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i,'GOOGLE_SCOPE_INSUFFICIENT'],
  [/invalid_grant|invalid_rapt|reauthentication/i,'GOOGLE_REAUTH_REQUIRED'],
  [/invalid_client/i,'GOOGLE_OAUTH_CLIENT_REJECTED'],
  [/caller does not have permission|PERMISSION_DENIED|permission denied/i,'GOOGLE_PERMISSION_DENIED'],
  [/Apps Script API.*(?:disabled|not enabled)|has not enabled.*Apps Script API/i,'GOOGLE_SCRIPT_API_DISABLED'],
  [/SyntaxError|Syntax error/i,'GOOGLE_SOURCE_SYNTAX_REJECTED'],
  [/CLASP_SINGLE_ATTEMPT_CONFIGURATION_REQUIRED/,'CLASP_SINGLE_ATTEMPT_CONFIGURATION_REQUIRED'],
  [/Security Error:.*(?:symlink|escapes|traversal)/i,'CLASP_PATH_REJECTED'],
  [/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timed out/i,'TRANSPORT_RESULT_REQUIRES_REVIEW']
 ];
 return patterns.find(([pattern])=>pattern.test(text))?.[1] || 'GOOGLE_OR_CLASP_OPERATION_FAILED_REVIEW_PRIVATELY_NO_RETRY';
}
export function remoteSourceState(remoteDigest,sourceDigest,reviewedRemoteDigest) {
 return remoteDigest===sourceDigest?'APPROVED_SOURCE':remoteDigest===reviewedRemoteDigest?'REVIEWED_BASELINE':'UNREVIEWED_CHANGE';
}
