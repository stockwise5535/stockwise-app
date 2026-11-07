// Readiness assessment: never returns or logs secret values.
// Safe to run in CI or server-only diagnostics.
const REQUIRED=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STOCKWISE_SALES_ENCRYPTION_KEY','STOCKWISE_SALES_OAUTH_ADMIN_KEY','STOCKWISE_SALES_GMAIL_CLIENT_SECRET','STOCKWISE_SALES_UNSUBSCRIBE_SECRET'];
export function assessSalesReadiness(env={}) {
 const missing=REQUIRED.filter(k=>typeof env[k]!=='string'||!env[k].trim());
 const checks={
  databaseConfigured:!!env.SUPABASE_URL&&!!env.SUPABASE_SERVICE_ROLE_KEY,
  oauthSetupExplicitlyEnabled:env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED==='true',
  selfTestExplicitlyEnabled:env.STOCKWISE_SALES_SELF_TEST_ENABLED==='true',
  productionSendingDisabled:env.STOCKWISE_SALES_SEND_ENABLED!=='true',
  allRequiredSecretsPresent:missing.length===0
 };
 // Neither secrets nor credentials can prove migrations applied, OAuth consent
 // validity, mailbox access, verified legal basis, or operational readiness.
 return {readyForProduction:false,checks,missing,blocking:[
  'database_migrations_not_verified','gmail_oauth_not_verified',
  'sender_and_unsubscribe_not_live_verified','lawful_lead_source_not_verified',
  'production_delivery_pipeline_not_approved'
 ]};
}
