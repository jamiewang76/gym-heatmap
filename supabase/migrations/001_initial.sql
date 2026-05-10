-- State-level weekly session counts
create table states (
  id text primary key,
  count integer default 0,
  updated_at timestamptz default now()
);

-- Seed all 50 US state abbreviations with count 0
insert into states (id) values
  ('AL'),('AK'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('FL'),('GA'),
  ('HI'),('ID'),('IL'),('IN'),('IA'),('KS'),('KY'),('LA'),('ME'),('MD'),
  ('MA'),('MI'),('MN'),('MS'),('MO'),('MT'),('NE'),('NV'),('NH'),('NJ'),
  ('NM'),('NY'),('NC'),('ND'),('OH'),('OK'),('OR'),('PA'),('RI'),('SC'),
  ('SD'),('TN'),('TX'),('UT'),('VT'),('VA'),('WA'),('WV'),('WI'),('WY');

-- Anti-spam: one record per check-in attempt
create table rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  device_uuid text not null,
  checked_in_at timestamptz default now()
);
create index on rate_limits (ip_hash, checked_in_at);
create index on rate_limits (device_uuid, checked_in_at);

-- Previous week's leaderboard snapshot
create table leaderboard_history (
  id serial primary key,
  week_ending date not null,
  rank integer not null,
  state_id text not null,
  session_count integer not null
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table states enable row level security;
alter table rate_limits enable row level security;
alter table leaderboard_history enable row level security;

-- Anon can read states and leaderboard; all writes go through the edge function
-- (service role key bypasses RLS entirely)
create policy "public read states"
  on states for select to anon using (true);

create policy "public read leaderboard"
  on leaderboard_history for select to anon using (true);

-- rate_limits: no client access at all (edge function uses service role)

-- ── Realtime ─────────────────────────────────────────────────────────────────

-- Add states to the realtime publication so UPDATE events are broadcast
alter publication supabase_realtime add table states;

-- ── pg_cron weekly reset ──────────────────────────────────────────────────────
-- Every Sunday at 23:59 PT = Monday 07:59 UTC

select cron.schedule('weekly-reset', '59 7 * * 1', $$
  insert into leaderboard_history (week_ending, rank, state_id, session_count)
  select
    date_trunc('week', now())::date,
    row_number() over (order by count desc),
    id,
    count
  from states
  where count > 0
  order by count desc
  limit 3;

  update states set count = 0, updated_at = now();
$$);

-- ── RPC ───────────────────────────────────────────────────────────────────────

create or replace function increment_state(state_id text)
returns void language sql as $$
  update states set count = count + 1, updated_at = now()
  where id = state_id;
$$;
