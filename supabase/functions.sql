-- Saves the report and the next cycle in one transaction (ARCHITECTURE 4.4). Run third. Safe to run again.

create or replace function public.commit_close_cycle(
  p_user_id uuid, p_cycle_id uuid, p_report jsonb,
  p_next_start date, p_next_end date, p_menu jsonb, p_training_plan jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_next_id uuid;
begin
  update public.weekly_cycles set report = p_report
   where id = p_cycle_id and user_id = p_user_id and report is null;
  if not found then
    raise exception 'cycle_closed';
  end if;
  insert into public.weekly_cycles (user_id, cycle_start, cycle_end, menu, training_plan)
  values (p_user_id, p_next_start, p_next_end, p_menu, p_training_plan)
  returning id into v_next_id;
  return v_next_id;
end $$;

revoke execute on function public.commit_close_cycle from public, anon, authenticated;
grant execute on function public.commit_close_cycle to service_role;
