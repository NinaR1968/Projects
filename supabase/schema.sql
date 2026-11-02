-- Three tables (ARCHITECTURE 3). Run first, in the Supabase SQL Editor. Safe to run again.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  name text not null,
  birth_date date not null check (birth_date >= '1900-01-01'),
  sex text not null check (sex in ('male', 'female')),
  height_cm numeric not null check (height_cm between 120 and 210),
  weight_kg numeric not null check (weight_kg between 45 and 150),
  body_type text not null check (body_type in ('ectomorph', 'mesomorph', 'endomorph')),
  waist_cm numeric not null check (waist_cm between 40 and 200),
  arm_cm numeric not null check (arm_cm between 15 and 70),
  leg_cm numeric not null check (leg_cm between 25 and 100),
  diet_preferences jsonb not null default '["none"]'::jsonb,
  goal text not null check (goal in ('lose_weight', 'maintain_weight', 'strengthen')),
  fitness_level text not null check (fitness_level in ('sedentary', 'low', 'medium', 'high')),
  workouts_per_week int not null check (workouts_per_week between 1 and 7),
  baseline jsonb,
  preferred_hours jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  weight_kg numeric check (weight_kg between 45 and 150),
  workout jsonb,
  meals jsonb,
  calories_in numeric,
  tdee numeric,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists public.weekly_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  cycle_start date not null,
  cycle_end date not null,
  menu jsonb not null,
  training_plan jsonb not null,
  report jsonb,
  feedback jsonb,
  created_at timestamptz not null default now(),
  check (cycle_end >= cycle_start),
  unique (user_id, cycle_start)
);
