import {useEffect,useState} from 'react'
export function deriveInternalAccess(adminResult,reviewerResult,workspaceRole){
 const growthAdmin=adminResult.status==='fulfilled'&&adminResult.value===true
 const outboundReviewer=reviewerResult.status==='fulfilled'&&reviewerResult.value===true
 return {growthAdmin,outboundReviewer,communications:outboundReviewer||(growthAdmin&&['owner','admin'].includes(workspaceRole)),adminCheckFailed:adminResult.status==='rejected',reviewerCheckFailed:reviewerResult.status==='rejected'}
}
export async function loadInternalAccess(api,workspaceId,workspaceRole){
 const [admin,reviewer]=await Promise.allSettled([Promise.resolve().then(()=>api.isGrowthAdmin()),Promise.resolve().then(()=>api.canReviewOutbound(workspaceId))])
 return deriveInternalAccess(admin,reviewer,workspaceRole)
}
const denied={growthAdmin:false,outboundReviewer:false,communications:false,adminCheckFailed:false,reviewerCheckFailed:false}
export function useInternalAccess({api,userId,workspaceId,workspaceRole}){
 const [state,setState]=useState(null),[revision,setRevision]=useState(0)
 useEffect(()=>{
  let active=true
  setState(null)
  if(userId&&workspaceId)void loadInternalAccess(api,workspaceId,workspaceRole).then(access=>{if(active)setState({...access,userId,workspaceId,workspaceRole})},()=>{if(active)setState({...denied,adminCheckFailed:true,reviewerCheckFailed:true,userId,workspaceId,workspaceRole})})
  return()=>{active=false}
 },[api,userId,workspaceId,workspaceRole,revision])
 // Never carry an old workspace's permission into a new selection, even for one render.
 const current=state?.userId===userId&&state?.workspaceId===workspaceId&&state?.workspaceRole===workspaceRole
 return {...(current?state:denied),loading:!current,retry:()=>setRevision(n=>n+1)}
}
