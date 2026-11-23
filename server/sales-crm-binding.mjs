import {readFileSync} from 'node:fs';
import{reviewedExecutionDigest}from'./sales-review-binding.mjs';
export const CRM_BINDING=Object.freeze(JSON.parse(readFileSync(new URL('../apps-script/sales-crm/deployment/crm-binding.json',import.meta.url),'utf8')));
export const RETIRED_UNVERIFIED_CRM_ID='1kFsOxMgepkR1G6RPUXeoY3j5KTtl__82cB8VgaLEBdg';
export const CANONICAL_CRM_ID='12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk';
export function assertProductionWriteAuthorization(binding=CRM_BINDING){
 if(binding.productionWritesAuthorized!==true)throw Error('PRODUCTION_WRITES_NOT_AUTHORIZED');
 productionCrmId(binding);
}
export function productionCrmId(binding=CRM_BINDING){
 if(binding?.confirmedByOwner!==true||binding.spreadsheetId!==CANONICAL_CRM_ID||!Number.isFinite(Date.parse(binding.confirmedAt)))throw Error('CANONICAL_CRM_NOT_CONFIRMED');
 if(binding.independentReviewStatus!=='approved'||!/^[0-9a-f]{40}$/.test(binding.independentReviewCommit||'')||/^0+$/.test(binding.independentReviewCommit)||!binding.independentReviewer||!/^[0-9a-f]{64}$/.test(binding.independentReviewDigest||''))throw Error('INDEPENDENT_REVIEW_REQUIRED');
 if(['emailSending','snsSending','followUp'].some(k=>binding.newRoute?.[k]!==false))throw Error('NEW_ROUTE_SENDING_FORBIDDEN');
 if(binding.dedicatedCredentialConfirmed!==true||!binding.credentialsProjectId||!binding.serviceAccountEmail)throw Error('DEDICATED_CREDENTIAL_NOT_CONFIRMED');
 if(binding.independentReviewDigest!==reviewedExecutionDigest()||binding.independentReviewDigest!==reviewedExecutionDigest({commit:binding.independentReviewCommit}))throw Error('REVIEWED_SOURCE_CHANGED');
 return binding.spreadsheetId;
}
