-- ============================================================
-- Migration 0004 — match_odds (admin fallback + api)
-- ============================================================
-- One row per match. Source 'admin' = manually set by admin;
-- source 'api' = written by cron ingestion (fas 4).
-- Unique constraint on match_id: only one active odds per match.
-- ============================================================

create table match_odds (
  id         uuid          primary key default gen_random_uuid(),
  match_id   uuid          not null references matches(id) on delete cascade,
  home_odds  numeric(6,2)  not null check (home_odds > 1.0),
  draw_odds  numeric(6,2)  not null check (draw_odds > 1.0),
  away_odds  numeric(6,2)  not null check (away_odds > 1.0),
  source     text          not null default 'admin' check (source in ('admin', 'api')),
  set_by     uuid          references profiles(id) on delete set null,
  created_at timestamptz   not null default now(),
  updated_at timestamptz   not null default now(),
  unique(match_id)
);

create index on match_odds(match_id);

create trigger match_odds_updated_at
  before update on match_odds
  for each row execute function handle_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────
alter table match_odds enable row level security;

-- All authenticated users can read (needed for betting in fas 5)
create policy "match_odds: authenticated can read"
  on match_odds for select to authenticated using (true);

-- Only admins can insert/update/delete
create policy "match_odds: admin can write"
  on match_odds for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());
