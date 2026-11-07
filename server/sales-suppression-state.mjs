// Fail-closed immutable suppression-state reducer. The persistence layer must
// commit these events transactionally before any send. No network calls here.
export function applySalesEvent(state, event) {
 const s = state && typeof state==='object' ? state : {suppressed:true,history:[]};
 if (!event || typeof event!=='object' || !['unsubscribe','complaint','hard_bounce','reply','delivered','accepted'].includes(event.type))
   return {ok:false,reasons:['invalid_event']};
 if (typeof event.id!=='string'||!event.id||typeof event.contactId!=='string'||!event.contactId||
     !Number.isSafeInteger(event.at)) return {ok:false,reasons:['invalid_event_identity']};
 if (s.contactId && s.contactId!==event.contactId) return {ok:false,reasons:['wrong_contact']};
 const history=Array.isArray(s.history)?s.history:[];
 if(history.some(e=>e.id===event.id)) return {ok:true,duplicate:true,state:s};
 const suppressed=s.suppressed===true || ['unsubscribe','complaint','hard_bounce'].includes(event.type);
 const replyReceived=s.replyReceived===true || event.type==='reply';
 return {ok:true,duplicate:false,state:{
   contactId:event.contactId,suppressed,replyReceived,
   history:[...history,{id:event.id,type:event.type,at:event.at}]
 }};
}
export function canSendToContact(state) {
 return !!state && state.suppressed===false && state.replyReceived===false &&
   Array.isArray(state.history) && state.history.length>0;
}
