-- Reopens the latest closed cycle of one demo user, so "סיום מחזור" can be tried again (spec/plans/milestone-6.md, 5.3).
-- Deletes the cycle that the closing created and clears the report. Feedback and daily logs stay.
-- Development database only. Run by the product owner in the SQL Editor. This cannot be undone.
-- Change the email below if needed. Only demo users can be reopened.

do $$
declare
  v_email text := 'demo1@example.com';
  v_user uuid;
  v_closed record;
begin
  if v_email not like 'demo_@example.com' then
    raise exception 'Only demo users can be reopened';
  end if;
  select id into v_user from auth.users where email = v_email;
  select * into v_closed from public.weekly_cycles
   where user_id = v_user and report is not null order by cycle_start desc limit 1;
  if v_closed is null then
    raise exception 'No closed cycle for %', v_email;
  end if;
  delete from public.weekly_cycles where user_id = v_user and cycle_start > v_closed.cycle_end;
  update public.weekly_cycles set report = null where id = v_closed.id;
end $$;

select u.email, c.cycle_start, c.cycle_end, c.report is not null as closed, c.feedback is not null as has_feedback
  from public.weekly_cycles c join auth.users u on u.id = c.user_id
 where u.email like 'demo_@example.com'
 order by u.email, c.cycle_start;
