import{registrationClient}from'./sales-crm-registration-client.mjs';
import{registrationState}from'./sales-crm-registration.mjs';
// Fixed isolated target, service account only, and a transport-level write block.
// No production/legacy target argument, credential persistence, or token output.
export async function checkDedicatedSheetsAuth({authJson,fetchImpl=fetch}){
 const client=await registrationClient({target:'isolation',authJson,requireDedicatedAuth:true,readOnly:true,fetchImpl});
 registrationState(await client.read(),'isolation');
 return{target:'isolation',dedicatedAuthentication:true,sheetsApiReachable:true,threeSendingGatesOff:true,crmWrites:false};
}
