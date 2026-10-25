import {legalDocuments,legalPublication} from './legalContent.js'
export default function LegalDocument({kind}){
 const document=legalDocuments[kind]
 return <article className="growth-legal" aria-labelledby="legal-title">
  <div className="growth-card growth-legal-intro">
   <p className="growth-eyebrow">Stockwise · Nexops managed services</p>
   <h1 id="legal-title">{document.title}</h1><p>{document.intro}</p>
   <aside className="growth-legal-review" aria-label="Publication status"><strong>Publication details pending.</strong> This product-specific draft requires the verified operator details below and professional legal review before public launch. No attorney review or legal certification is claimed.</aside>
   <dl className="growth-legal-details">{document.publicationFields.map(key=><div key={key}><dt>{legalPublication[key].label}</dt><dd>{legalPublication[key].value}</dd></div>)}</dl>
   <nav aria-label={`${document.title} contents`}><details><summary>On this page</summary><ol>{document.sections.map(section=><li key={section.id}><a href={'#'+section.id}>{section.title}</a></li>)}</ol></details></nav>
  </div>
  {document.sections.map(section=><section className="growth-card" id={section.id} aria-labelledby={'heading-'+section.id} key={section.id}><h2 id={'heading-'+section.id}>{section.title}</h2>{section.paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>)}
  <nav className="growth-legal-links" aria-label="Legal document links"><a href="/growth?view=account">Account and preferences</a><a href={kind==='privacy'?'/terms':'/privacy'}>{kind==='privacy'?'Terms of Service':'Privacy Policy'}</a><a href="/en">Back to product</a><a href="#legal-title">Back to top</a></nav>
 </article>
}
