export const FIRST_VALUE_STEPS=Object.freeze([
 ['demo_opened_at','Open demo workspace'],
 ['today_viewed_at','View TODAY'],
 ['exception_opened_at','Open one exception'],
 ['first_value_at','Review the recommended next action'],
])
export function firstValueProgress(activation){
 const steps=FIRST_VALUE_STEPS.map(([key,label])=>({key,label,done:!!activation?.[key]}))
 return {steps,count:steps.filter(s=>s.done).length,completed:!!activation?.activated_at,next:steps.find(s=>!s.done)?.key||null}
}
