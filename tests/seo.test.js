import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const run=promisify(execFile)
test('SEO generation has real localized HTML and only uses a configured canonical origin',async()=>{
 const dir=await mkdtemp(tmpdir()+'/nexops-seo-')
 try{
  await mkdir(dir+'/dist/assets',{recursive:true});const template='<html lang="ja"><head><title>Stockwise</title></head><body><div id="root"></div></body></html>'
  await writeFile(dir+'/dist/index.html',template)
  await run(process.execPath,[resolve('scripts/generate-seo.mjs')],{cwd:dir,env:{...process.env,VITE_PUBLIC_SITE_URL:'https://public.example.test'}})
  const english=await readFile(dir+'/dist/en/index.html','utf8')
  assert.ok(english.includes('rel="canonical" href="https://public.example.test/en"'))
  assert.ok(english.includes('hreflang="ja"'));assert.ok(english.includes('See supply risks'))
  assert.ok((await readFile(dir+'/dist/sitemap.xml','utf8')).includes('https://public.example.test/ja'))
  await writeFile(dir+'/dist/index.html',template)
  await run(process.execPath,[resolve('scripts/generate-seo.mjs')],{cwd:dir,env:{...process.env,VITE_PUBLIC_SITE_URL:''}})
  assert.ok((await readFile(dir+'/dist/en/index.html','utf8')).includes('noindex,nofollow'))
  assert.equal(await readFile(dir+'/dist/robots.txt','utf8'),'User-agent: *\nDisallow: /\n')
 }finally{await rm(dir,{recursive:true,force:true})}
})
