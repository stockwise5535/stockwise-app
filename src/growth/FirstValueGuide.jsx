import {firstValueProgress} from './firstValue.js'
export default function FirstValueGuide({activation,onStart,intro=false,overview=false}){
 const progress=firstValueProgress(activation)
 if(progress.completed&&!overview)return <aside className="growth-onboarding-complete" aria-label="Getting started complete"><strong>You’re ready to explore.</strong> Keep reviewing risks and next actions. Get started is always available.</aside>
 const Heading=intro||overview?'h1':'h2'
 return <section className="growth-card growth-onboarding" aria-label="Getting started with Nexops">
  <Heading>{progress.completed?'You’re ready to explore':intro?'See what needs attention today':'Your first risk, your next action'}</Heading>
  <p>Nexops turns inventory, PO and supplier exceptions into prioritized action.</p>
  <p>{progress.completed?'Your first demo walkthrough is complete.':intro?'Explore a sample risk and its next action in about a minute. No upload needed.':'Open one risk in TODAY and read its recommended next action. Everything here is demo data.'}</p>
  {intro&&<button className="growth-onboarding-primary" onClick={onStart}>{progress.count?'Continue with today’s risks':"Start with today's risks"}</button>}
  <p role="status">{progress.count} of 4 completed</p><progress aria-label="Demo progress" max="4" value={progress.count}/>
  <ol>{progress.steps.map(step=><li key={step.key} className={step.done?'is-complete':''}><span aria-label={step.done?'Completed':'Not completed'}>{step.done?'✓':'○'}</span> {step.label}</li>)}</ol>
  {overview&&<button className="growth-onboarding-primary" onClick={onStart}>{progress.completed?'Open TODAY':progress.count?'Continue with today’s risks':"Start with today's risks"}</button>}
 </section>
}
