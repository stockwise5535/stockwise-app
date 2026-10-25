import {Component} from 'react'
import {resetSavedDemo} from '../operations/OperationsWorkspace.jsx'
export default class DemoRecovery extends Component{
 state={failed:false,revision:0}
 static getDerivedStateFromError(){return {failed:true}}
 retry=(reset=false)=>{if(reset)resetSavedDemo();this.setState(s=>({failed:false,revision:s.revision+1}))}
 render(){
  if(this.state.failed)return <section className="growth-card"><h1>We couldn’t open your demo</h1><p>Try again. If your saved demo still won’t open, reset its data in this browser. Resetting clears demo edits, but keeps your account and getting-started progress.</p><button onClick={()=>this.retry()}>Retry demo</button><button onClick={()=>this.retry(true)}>Reset demo and retry</button></section>
  return <div key={this.state.revision}>{this.props.children}</div>
 }
}
