// Canonical destinations supplied by the Stockwise operator.
// Do not invent deep links; app authentication and registration paths must be verified.
export const STOCKWISE_DESTINATIONS = Object.freeze({
  homepage: 'https://stockwise-homepage.vercel.app/en/',
  application: 'https://stockwise-app-1qz9.vercel.app/'
});
export function campaignDestination(kind='homepage', utm={}) {
  const base=STOCKWISE_DESTINATIONS[kind];
  if (!base) return {ok:false,reasons:['unknown_destination']};
  const u=new URL(base);
  const allowed=['utm_source','utm_medium','utm_campaign','utm_content'];
  for(const key of allowed) {
    const value=utm[key];
    if (value === undefined) continue;
    if (typeof value!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
      return {ok:false,reasons:['invalid_'+key]};
    u.searchParams.set(key,value);
  }
  return {ok:true,url:u.toString()};
}
