// Read-only TEST CRM probe. Never return cell contents or contact data.
export async function inspectTestSheet(api,spreadsheetId,knownHeaders) {
 try {
  const meta=(await api.spreadsheets.get({spreadsheetId,fields:'sheets.properties.title'},{retry:false,timeout:15000})).data;
  const titles=(meta.sheets||[]).map(s=>s.properties?.title);
  const result={access:'readable',leads:'missing',settings:'missing'};
  if(titles.includes('Leads')) {
   const rows=(await api.spreadsheets.values.get({spreadsheetId,range:'Leads!A1:U1001'},{retry:false,timeout:15000})).data.values||[];
   const headers=rows[0]||[],company=headers.indexOf('company');
   result.leads='present';result.columns=headers.length;
   result.knownColumns=headers.filter(h=>knownHeaders.includes(h)).length;
   result.companyRowsWithinReadLimit=company<0?null:rows.slice(1).filter(row=>String(row[company]||'').trim()).length;
   result.readLimitRows=1000;
  }
  if(titles.includes('Settings')) {
   const rows=(await api.spreadsheets.values.get({spreadsheetId,range:'Settings!A1:C200'},{retry:false,timeout:15000})).data.values||[];
   result.settings='present';result.gates={};
   for(const key of ['LIVE_SENDING','FOLLOW_UP_ENABLED','LEGAL_REVIEW_COMPLETED']) {
    const found=rows.slice(1).filter(row=>String(row[0]).trim()===key);
    result.gates[key]=found.length===0?'NOT_CONFIGURED':found.length!==1?'AMBIGUOUS':
      String(found[0][1]).trim().toUpperCase()==='FALSE'?'OFF':String(found[0][1]).trim().toUpperCase()==='TRUE'?'ON':'UNKNOWN';
   }
  }
  return result;
 } catch(error) {
  const status=Number(error?.response?.status||error?.status);
  return {access:'not_confirmed',httpStatus:[400,401,403,404,429,500,503].includes(status)?status:null};
 }
}
