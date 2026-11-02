-- Check 12.2 #5 for commit_close_cycle. Run after seed.sql. Shows a results table, and leaves nothing behind.
create temp table check_results (test text, result text) on commit drop;

do $$
declare
  v_user uuid;
  v_cycle record;
  v_other record;
  v_first text := 'FAILED';
  v_second text := 'FAILED';
  v_conflict text := 'FAILED';
  v_report_kept text := 'FAILED';
  v_undone text := 'FAILED';
begin
  select c.* into v_cycle from public.weekly_cycles c
    join auth.users u on u.id = c.user_id
   where u.email = 'demo2@example.com' and c.report is null
   order by c.cycle_start limit 1;
  select c.* into v_other from public.weekly_cycles c
    join auth.users u on u.id = c.user_id
   where u.email = 'demo1@example.com' and c.report is null
   order by c.cycle_start limit 1;
  v_user := v_cycle.user_id;

  -- Everything in this block is undone by the exception at its end.
  begin
    perform public.commit_close_cycle(v_user, v_cycle.id, '{"check": true}'::jsonb,
      '2099-01-04', '2099-01-10', v_cycle.menu, v_cycle.training_plan);
    if exists (select 1 from public.weekly_cycles where user_id = v_user and cycle_start = '2099-01-04') then
      v_first := 'OK';
    end if;

    begin
      perform public.commit_close_cycle(v_user, v_cycle.id, '{"check": true}'::jsonb,
        '2099-01-11', '2099-01-17', v_cycle.menu, v_cycle.training_plan);
    exception when others then
      if sqlerrm = 'cycle_closed' then v_second := 'OK'; end if;
    end;

    begin
      -- The next cycle reuses an existing start date, so the insert fails.
      perform public.commit_close_cycle(v_other.user_id, v_other.id, '{"check": true}'::jsonb,
        v_other.cycle_start, v_other.cycle_end, v_other.menu, v_other.training_plan);
    exception when unique_violation then
      v_conflict := 'OK';
    end;
    if (select report from public.weekly_cycles where id = v_other.id) is null then
      v_report_kept := 'OK';
    end if;

    raise exception 'undo_check';
  exception when others then
    if sqlerrm <> 'undo_check' then
      raise;
    end if;
  end;

  if (select report from public.weekly_cycles where id = v_cycle.id) is null
     and not exists (select 1 from public.weekly_cycles where cycle_start >= '2099-01-01') then
    v_undone := 'OK';
  end if;

  insert into check_results values
    ('1. first call succeeds', v_first),
    ('2. second call returns cycle_closed', v_second),
    ('3. failed insert raises an error', v_conflict),
    ('4. failed insert also cancels the report', v_report_kept),
    ('5. nothing left in the database', v_undone);
end $$;

select * from check_results order by test;
