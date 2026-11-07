import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth/google/connect.js';

function invoke(method,enabled){
 const previous=process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED;
 if(enabled===undefined)delete process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED;
 else process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED=enabled;
 const headers={};
 const response={statusCode:200,body:undefined,
  setHeader(k,v){headers[k.toLowerCase()]=v;return this;},
  status(code){this.statusCode=code;return this;},
  type(value){headers['content-type']=value;return this;},
  send(value){this.body=value;return this;},
  end(value){this.body=value;return this;}
 };
 try{handler({method},response);return {headers,...response};}
 finally{if(previous===undefined)delete process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED;else process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED=previous;}
}

test('Gmail connection page fails closed without explicit setup flag',()=>{
 const result=invoke('GET','false');
 assert.equal(result.statusCode,503);
 assert.match(result.body,/disabled/);
 assert.equal(result.headers['cache-control'],'no-store');
});

test('Gmail connection page rejects unsupported methods',()=>{
 const result=invoke('POST','true');
 assert.equal(result.statusCode,405);
 assert.equal(result.headers.allow,'GET');
});

test('Gmail connection page has same-origin browser start and no hardcoded secret',()=>{
 const result=invoke('GET','true');
 assert.equal(result.statusCode,200);
 assert.match(result.headers['content-type'],/text\/html/);
 assert.match(result.headers['content-security-policy'],/connect-src 'self'/);
 assert.match(result.body,/fetch\('\/api\/auth\/google\/start'/);
 assert.match(result.body,/credentials:'same-origin'/);
 assert.match(result.body,/key\.value=''/);
 assert.match(result.body,/window\.location\.assign/);
 assert.doesNotMatch(result.body,/localStorage|sessionStorage/);
 assert.doesNotMatch(result.body,/STOCKWISE_SALES_OAUTH_ADMIN_KEY/);
});
