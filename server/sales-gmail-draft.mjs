// Gmail API RFC 2822 draft builder: pure functions, no credential or network access.
// Callers MUST pass a verified sender, approved recipient and a signed unsubscribe URL.
// Sending is intentionally not implemented until OAuth, durable ledger and webhook handling exist.
const CRLF='\r\n';
function header(v) { const s=String(v??'').trim(); return s && !/[\r\n]/.test(s) && /^[\x20-\x7E]+$/.test(s) ? s : null; }
function email(v) { const s=header(v); return s && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(s) ? s : null; }
function b64url(s) { return Buffer.from(s,'utf8').toString('base64url'); }
export function buildGmailDraft({from,to,subject,body,unsubscribeUrl,unsubscribeMailto}={}) {
 const sender=email(from),recipient=email(to),title=header(subject);
 const url=header(unsubscribeUrl),mailto=email(unsubscribeMailto);
 const reasons=[];
 if (!sender || !recipient) reasons.push('invalid_address');
 if (!title) reasons.push('invalid_subject');
 if (typeof body!=='string' || !body.trim() || /\r(?!\n)/.test(body)) reasons.push('invalid_body');
 if (!url || !/^https:\/\/[^\s<>]+$/.test(url)) reasons.push('invalid_unsubscribe_url');
 if (!mailto) reasons.push('invalid_unsubscribe_mailbox');
 if (reasons.length) return {ok:false,reasons};
 const safeBody=body.replace(/\r?\n/g,CRLF);
 const raw=[
   'From: '+sender,'To: '+recipient,'Subject: '+title,
   'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8',
   'Content-Transfer-Encoding: 8bit',
   'List-Unsubscribe: <'+url+'>, <mailto:'+mailto+'>',
   'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
   '',safeBody
 ].join(CRLF);
 return {ok:true,raw:b64url(raw),recipient};
}
