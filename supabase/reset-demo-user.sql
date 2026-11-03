-- Makes one demo user "new" again for the full MVP check (spec/plans/milestone-6.md, 5.4).
-- Deletes that user's daily logs, cycles and profile. The login in Auth stays.
-- Development database only. Run by the product owner in the SQL Editor. This cannot be undone.
-- Change the email below if needed. Only demo users can be reset.

do $$
declare
  v_email text := 'demo5@example.com';
  v_user uuid;
begin
  if v_email not like 'demo_@example.com' then
    raise exception 'Only demo users can be reset';
  end if;
  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    raise exception 'No such user: %', v_email;
  end if;
  delete from public.daily_logs where user_id = v_user;
  delete from public.weekly_cycles where user_id = v_user;
  delete from public.profiles where id = v_user;
end $$;

select u.email,
       (select count(*) from public.profiles p where p.id = u.id) as profiles,
       (select count(*) from public.weekly_cycles c where c.user_id = u.id) as cycles,
       (select count(*) from public.daily_logs l where l.user_id = u.id) as days
  from auth.users u where u.email like 'demo_@example.com'
 order by u.email;
