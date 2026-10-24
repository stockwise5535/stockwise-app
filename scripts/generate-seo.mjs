import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { content, siteBase } from '../src/growth/landingContent.js'
const env={...loadEnv('production',process.cwd(),''),...process.env}
const base=siteBase(env.VITE_PUBLIC_SITE_URL)
const html=await readFile('dist/index.html','utf8')
const styles=(await readdir('dist/assets')).filter(f=>f.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/assets/${f}">`).join('')
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
for(const locale of ['en','ja']){
 const c=content[locale]
 const canonical=base?`<link rel="canonical" href="${base}/${locale}"><meta property="og:url" content="${base}/${locale}">${['en','ja'].map(l=>`<link rel="alternate" hreflang="${l}" href="${base}/${l}">`).join('')}`:''
 const meta=`${styles}<meta name="description" content="${escape(c.description)}"><meta property="og:title" content="${escape(c.title)}"><meta property="og:description" content="${escape(c.description)}"><meta property="og:type" content="website"><meta property="og:locale" content="${locale==='en'?'en_SG':'ja_JP'}">${canonical}${base?'':'<meta name="robots" content="noindex,nofollow">'}`
 const body=`<main class="growth growth-landing"><header><a href="/en">NEXOPS</a> · <a href="/ja">日本語</a> · <a href="/en">English</a></header><h1>${escape(c.hero)}</h1><p>${escape(c.intro)}</p><p>${escape(c.free)}</p><nav><a href="/signup">${escape(c.start)}</a> · <a href="/demo/operations">${escape(c.demo)}</a> · <a href="/growth?view=consultation">${escape(c.consult)}</a></nav>${c.sections.map(([heading,text])=>`<section><h2>${escape(heading)}</h2><p>${escape(text)}</p></section>`).join('')}<p>${escape(c.how)}</p><footer><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer></main>`
 const page=html.replace(/<html lang="[^"]*">/,`<html lang="${locale}">`).replace(/<title>.*?<\/title>/,`<title>${escape(c.title)}</title>`).replace('</head>',meta+'</head>').replace('<div id="root"></div>',`<div id="root">${body}</div>`)
 await mkdir(`dist/${locale}`,{recursive:true});await writeFile(`dist/${locale}/index.html`,page)
}
await writeFile('dist/robots.txt',base?`User-agent: *\nAllow: /en\nAllow: /ja\nDisallow: /growth\nDisallow: /signup\nDisallow: /invite\nDisallow: /demo/\nDisallow: /privacy\nDisallow: /terms\nSitemap: ${base}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n')
if(base)await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['en','ja'].map(l=>`<url><loc>${base}/${l}</loc></url>`).join('')}</urlset>`)
await writeFile('dist/index.html',html.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>'))
console.log(base?'Localized HTML, canonical tags, sitemap and robots generated.':'Localized HTML generated with noindex; configure VITE_PUBLIC_SITE_URL before indexing.')
