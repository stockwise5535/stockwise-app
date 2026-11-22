import {readFileSync} from 'node:fs';
export const CRM_BINDING=Object.freeze(JSON.parse(readFileSync(new URL('../apps-script/sales-crm/deployment/crm-binding.json',import.meta.url),'utf8')));
export const RETIRED_UNVERIFIED_CRM_ID='1kFsOxMgepkR1G6RPUXeoY3j5KTtl__82cB8VgaLEBdg';
export function productionCrmId(binding=CRM_BINDING){
 if(binding?.confirmedByOwner!==true||!binding.spreadsheetId||binding.spreadsheetId===RETIRED_UNVERIFIED_CRM_ID||!Number.isFinite(Date.parse(binding.confirmedAt)))throw Error('CANONICAL_CRM_NOT_CONFIRMED');
 if(!/^[0-9a-f]{40}$/.test(binding.independentReviewCommit||'')||!binding.independentReviewer)throw Error('INDEPENDENT_REVIEW_REQUIRED');
 if(['emailSending','snsSending','followUp'].some(k=>binding.newRoute?.[k]!==false))throw Error('NEW_ROUTE_SENDING_FORBIDDEN');
 if(binding.dedicatedCredentialConfirmed!==true||!binding.credentialsProjectId||!binding.serviceAccountEmail)throw Error('DEDICATED_CREDENTIAL_NOT_CONFIRMED');
 return binding.spreadsheetId;
}
