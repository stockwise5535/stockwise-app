-- Authorized SQL editor/service administration only. Not an anonymous endpoint.
-- UTC rolling seven-day window; replace bounds with the agreed reporting period.
with bounds as (select now()-interval '7 days' as start_at,now() as end_at),
new_users as (select p.* from public.nexops_profiles p,bounds b where p.created_at>=b.start_at and p.created_at<b.end_at),
activated as (select distinct a.user_id from public.nexops_activation a,bounds b where a.activated_at>=b.start_at and a.activated_at<b.end_at),
events as (select e.* from public.nexops_events e,bounds b where e.occurred_at>=b.start_at and e.occurred_at<b.end_at),
consultations as (select l.* from public.nexops_consultation_leads l,bounds b where l.created_at>=b.start_at and l.created_at<b.end_at)
select
 (select count(*) from new_users) as new_users,
 (select count(*) from activated) as activated_users_in_period,
 (select count(*) from new_users n where exists(select 1 from public.nexops_activation a where a.user_id=n.user_id and a.activated_at is not null)) as activated_new_user_cohort,
 (select round(100.0*count(*) filter(where exists(select 1 from public.nexops_activation a where a.user_id=n.user_id and a.activated_at is not null))/nullif(count(*),0),1) from new_users n) as new_user_activation_percent,
 (select count(distinct user_id) from events where event_name='user_returned') as returning_users,
 (select count(distinct user_id) from events where event_name='csv_upload_completed') as workspace_csv_upload_users,
 (select count(*) from consultations) as consultation_leads,
 (select count(*) from consultations l join public.nexops_lead_qualification q on q.workspace_id=l.workspace_id and q.lead_id=l.id where q.status in ('Qualified Lead','Consultation','Pilot Candidate')) as qualified_leads,
 (select properties->>'referral_source' from events where properties ? 'referral_source' group by 1 order by count(*) desc limit 1) as top_recorded_source,
 (select locale from new_users group by locale order by count(*) desc limit 1) as top_locale,
 (select properties->>'screen' from events where properties ? 'screen' group by 1 order by count(*) desc limit 1) as most_recorded_screen;
-- Drop-off: compare distinct same-cohort users reaching today_viewed, exception_opened,
-- recommended_action_viewed and activated_at. Use PostHog funnel for anonymous stages;
-- missing source/visitor data stays NULL, never a manufactured 'direct' source.

-- Same new-user cohort, cumulative first-value funnel and observed main drop-off.
with cohort as (
 select p.user_id,
  exists(select 1 from public.nexops_activation a where a.user_id=p.user_id and today_viewed_at is not null) as today,
  exists(select 1 from public.nexops_activation a where a.user_id=p.user_id and today_viewed_at is not null and exception_opened_at is not null) as exception,
  exists(select 1 from public.nexops_activation a where a.user_id=p.user_id and today_viewed_at is not null and exception_opened_at is not null and first_value_at is not null) as first_value,
  exists(select 1 from public.nexops_activation a where a.user_id=p.user_id and activated_at is not null) as activated
 from public.nexops_profiles p where p.created_at>=now()-interval '7 days' and p.created_at<now()
), steps as (
 select 1 as position,'Registered' as step,count(*) as users from cohort
 union all select 2,'Viewed TODAY',count(*) filter(where today) from cohort
 union all select 3,'Opened exception',count(*) filter(where exception) from cohort
 union all select 4,'Reviewed recommended action',count(*) filter(where first_value) from cohort
 union all select 5,'Activated',count(*) filter(where activated) from cohort
), losses as (
 select *,users-lead(users) over(order by position) as users_not_reaching_next_step from steps
)
select step,users,users_not_reaching_next_step,
 round(100.0*users_not_reaching_next_step/nullif(users,0),1) as observed_drop_percent,
 case when users_not_reaching_next_step>0 and users_not_reaching_next_step=max(users_not_reaching_next_step) over() then 'Largest observed drop' else null end as drop_off_context
from losses order by position;
