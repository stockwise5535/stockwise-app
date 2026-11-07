// AES-256-GCM envelope for OAuth tokens before durable storage.
// Key must be an independently generated 32-byte base64 value, stored only
// in the deployment secret manager. Never store plaintext refresh tokens.
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
function decodeKey(encoded) {
 if(typeof encoded!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('invalid_encryption_key');
 const key=Buffer.from(encoded,'base64');
 if(key.length!==32||key.toString('base64')!==encoded) throw new Error('invalid_encryption_key');
 return key;
}
export function encryptSalesSecret(plaintext,keyBase64,aad) {
 if(typeof plaintext!=='string'||!plaintext||typeof aad!=='string'||!aad) throw new Error('invalid_encryption_input');
 const key=decodeKey(keyBase64),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(aad,'utf8'));
 const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
 return {version:1,algorithm:'aes-256-gcm',iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function decryptSalesSecret(envelope,keyBase64,aad) {
 if(!envelope||envelope.version!==1||envelope.algorithm!=='aes-256-gcm'||typeof aad!=='string'||!aad) throw new Error('invalid_envelope');
 const key=decodeKey(keyBase64);
 try {
  const iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');
  if(iv.length!==12||tag.length!==16) throw new Error('invalid');
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(Buffer.from(aad,'utf8'));decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8');
 } catch { throw new Error('decryption_failed'); }
}
