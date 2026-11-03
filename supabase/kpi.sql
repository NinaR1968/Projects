-- Success metrics 1 and 2 (PRD 6), with the definitions in spec/plans/milestone-6.md, section 2. Read only.
-- Metric 3 (AI quality) is the pass rate in ai-tests.md.
-- "Today" is the date in Israel. An active user has at least one cycle that has ended.

-- 1. Cycle completion: active users whose latest ended cycle has both feedback and a report
--    (the report is written together with the updated plan). Target: 80%.
with today as (select (now() at time zone 'Asia/Jerusalem')::date as d),
latest_ended as (
  select distinct on (c.user_id) c.user_id, c.feedback, c.report
    from public.weekly_cycles c, today
   where c.cycle_end < today.d
   order by c.user_id, c.cycle_end desc
)
select 'KPI 1: cycle completion' as metric,
       count(*) filter (where feedback is not null and report is not null) as completed,
       count(*) as active_users,
       round(100.0 * count(*) filter (where feedback is not null and report is not null) / nullif(count(*), 0)) as percent
  from latest_ended;

-- 2. Daily continuity: completed days (weight, at least one meal, a workout) inside ended cycles,
--    out of all the days of those cycles. Days between cycles are not counted. Target: 80%.
with today as (select (now() at time zone 'Asia/Jerusalem')::date as d),
ended as (
  select c.user_id, c.cycle_start, c.cycle_end, (c.cycle_end - c.cycle_start + 1) as days
    from public.weekly_cycles c, today
   where c.cycle_end < today.d
)
select 'KPI 2: daily continuity' as metric,
       (select count(*) from public.daily_logs l join ended e
          on l.user_id = e.user_id and l.log_date between e.cycle_start and e.cycle_end
        where l.weight_kg is not null and l.workout is not null
          and jsonb_typeof(l.meals) = 'array' and jsonb_array_length(l.meals) > 0) as completed_days,
       (select sum(days) from ended) as cycle_days,
       round(100.0 * (select count(*) from public.daily_logs l join ended e
          on l.user_id = e.user_id and l.log_date between e.cycle_start and e.cycle_end
        where l.weight_kg is not null and l.workout is not null
          and jsonb_typeof(l.meals) = 'array' and jsonb_array_length(l.meals) > 0)
         / nullif((select sum(days) from ended), 0)) as percent;

-- 3. Detail per demo user and cycle.
select u.email, c.cycle_start, c.cycle_end,
       c.report is not null as has_report,
       c.feedback is not null as has_feedback,
       (select count(*) from public.daily_logs l
         where l.user_id = c.user_id and l.log_date between c.cycle_start and c.cycle_end
           and l.weight_kg is not null and l.workout is not null
           and jsonb_typeof(l.meals) = 'array' and jsonb_array_length(l.meals) > 0) as completed_days,
       (c.cycle_end - c.cycle_start + 1) as cycle_days
  from public.weekly_cycles c join auth.users u on u.id = c.user_id
 order by u.email, c.cycle_start;
