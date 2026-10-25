import { useEffect } from 'react'
import { capture } from './analytics.js'
import { content, siteBase } from './landingContent.js'
import AnalyticsConsent from './AnalyticsConsent.jsx'
import LegalDocument from './LegalDocument.jsx'
import {legalDocuments} from './legalContent.js'
import './growth.css'
export default function Landing(){
 const path=location.pathname.replace(/\/$/,'')
 const locale=path==='/ja'?'ja':'en', c=content[locale]
 const legal=path==='/privacy' || path==='/terms'
 const legalKind=path==='/privacy'?'privacy':'terms'
 const legalContent=legal?legalDocuments[legalKind]:null
 useEffect(()=>{
  document.documentElement.lang=locale
  document.title=legal ? `${legalContent.title} | Stockwise` : c.title
  let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement('meta');meta.name='description';document.head.append(meta)}meta.content=legalContent?.description || c.description
  const base=siteBase(import.meta.env.VITE_PUBLIC_SITE_URL)
  if(base && !legal){let link=document.querySelector('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.append(link)}link.href=base+'/'+locale}
  if(!legal)void capture('homepage_view',{locale,screen:'landing'})
 },[locale,legal,c,legalContent])
 return <main className="growth growth-landing"><header><a href="/en" className="growth-brand">{legal?'Stockwise':'NEXOPS'}</a>{legal?<a href="/en">Product</a>:<a href={locale==='en'?'/ja':'/en'}>{locale==='en'?'日本語':'English'}</a>}</header>{legal ? <LegalDocument kind={legalKind}/> : <><section className="growth-hero"><p className="growth-eyebrow">{c.locale}</p><h1>{c.hero}</h1><p>{c.intro}</p><strong>{c.free}</strong><div className="growth-ctas"><a href="/signup" onClick={()=>void capture('signup_started',{locale})}>{c.start}</a><a href="/demo/operations">{c.demo}</a><a href="/growth?view=consultation" onClick={()=>void capture('consultation_clicked',{locale})}>{c.consult}</a></div></section>{c.sections.map(([heading,body])=><section className="growth-card" key={heading}><h2>{heading}</h2><p>{body}</p></section>)}<section className="growth-card"><h2>{locale==='en'?'How it works':'使い方'}</h2><p>{c.how}</p><p>{locale==='en'?'Signup uses email and password. If email confirmation is enabled, the public demo is available while you confirm your email. A private demo workspace is created on your first confirmed sign-in.':'メールとパスワードで登録。確認メールの手続き中も公開デモを利用でき、確認後のログインで専用デモワークスペースが作成されます。'}</p></section></>}<footer><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/en">English</a> · <a href="/ja">日本語</a></footer><AnalyticsConsent/></main>
}
