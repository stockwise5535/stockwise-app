// Server-only restriction. There is deliberately no production/unrestricted mode.
export const TEST_TEMPLATE_IDS=Object.freeze(['welcome','activation_reminder','consultation_confirmation','workspace_invitation'])
const address=value=>{if(typeof value!=='string'||/[\r\n]/.test(value)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw Error('Valid explicitly configured mail address required');return value.trim().toLowerCase()}
export function emailSendPolicy(env=process.env){
 const mode=env.EMAIL_SEND_MODE??'draft_only'
 if(!['draft_only','test_recipient'].includes(mode))throw Error('Unsupported EMAIL_SEND_MODE; sending disabled')
 if(mode==='draft_only')return Object.freeze({mode})
 const sender=address(env.GMAIL_SENDER_EMAIL),approvedSender=address(env.NEXOPS_GMAIL_APPROVED_SENDER)
 if(sender!==approvedSender)throw Error('Configured sender does not match independently approved sender')
 return Object.freeze({mode,sender,testRecipient:address(env.NEXOPS_GMAIL_TEST_RECIPIENT)})
}
export function restrictedMessageAllowed(message,policy){
 if(policy?.mode!=='test_recipient')return false
 try{
  if(address(message.recipient_email)!==policy.testRecipient||address(policy.sender)!==policy.sender)return false
  if(message.template_id==='sender_test')return message.source_event==='sender_connection_test'&&policy.testRecipient===policy.sender
  return TEST_TEMPLATE_IDS.includes(message.template_id)
 }catch{return false}
}
