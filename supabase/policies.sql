-- Locks the tables (ARCHITECTURE 4.3). Run second. Safe to run again.
-- RLS on with no policy: only the function, through service_role, reaches the data.

alter table public.profiles      enable row level security;
alter table public.daily_logs    enable row level security;
alter table public.weekly_cycles enable row level security;

revoke all on public.profiles, public.daily_logs, public.weekly_cycles
  from anon, authenticated;

grant select, insert, update on public.profiles, public.daily_logs, public.weekly_cycles
  to service_role;
