// Sender identity is configured server-side, never accepted from a lead or a request.
// No OAuth, Gmail API or sending side effects occur in this module.
export function getGmailSenderConfig(env = process.env) {
 const address=String(env.STOCKWISE_SALES_GMAIL_FROM ?? '').trim().toLowerCase();
 const reasons=[];
 if (!/^[^\s@<>]+@gmail\.com$/.test(address)) reasons.push('gmail_sender_not_configured');
 if (env.STOCKWISE_SALES_GMAIL_VERIFIED !== 'true') reasons.push('sender_not_verified');
 if (env.STOCKWISE_SALES_SEND_ENABLED !== 'true') reasons.push('send_disabled');
 return {ready:reasons.length===0,address:address||null,reasons};
}
