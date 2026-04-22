-- ============================================================
-- Migration 0001 — Core schema
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── Enums ───────────────────────────────────────────────────
create type account_type      as enum ('google', 'manual');
create type league_role       as enum ('admin', 'player');
create type tournament_status as enum ('upcoming', 'group_stage', 'knockout', 'finished');
create type match_stage       as enum ('group', 'r32', 'r16', 'qf', 'sf', '3rd_place', 'final');
create type match_status      as enum ('scheduled', 'live', 'finished', 'void');

-- ─── profiles ────────────────────────────────────────────────
-- Mirrors auth.users 1-to-1; created automatically via trigger.
create table profiles (
  id           uuid         primary key references auth.users(id) on delete cascade,
  display_name text         not null,
  account_type account_type not null default 'google',
  is_active    boolean      not null default true,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

-- ─── invite_whitelist ────────────────────────────────────────
-- Google OAuth users must have an entry here to get is_active = true.
create table invite_whitelist (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null unique,
  invited_by  uuid        references profiles(id) on delete set null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ─── tournaments ─────────────────────────────────────────────
create table tournaments (
  id                    uuid              primary key default gen_random_uuid(),
  name                  text              not null,
  status                tournament_status not null default 'upcoming',
  special_bets_deadline timestamptz,
  created_at            timestamptz       not null default now(),
  updated_at            timestamptz       not null default now()
);

-- ─── teams ───────────────────────────────────────────────────
create table teams (
  id            uuid        primary key default gen_random_uuid(),
  tournament_id uuid        not null references tournaments(id) on delete cascade,
  name          text        not null,
  short_name    char(3)     not null,
  flag_emoji    text,
  group_letter  char(1),
  created_at    timestamptz not null default now()
);

create index on teams(tournament_id);

-- ─── matches ─────────────────────────────────────────────────
-- Knockout matches can have null team IDs until teams qualify.
create table matches (
  id            uuid         primary key default gen_random_uuid(),
  tournament_id uuid         not null references tournaments(id) on delete cascade,
  match_number  int          not null,
  stage         match_stage  not null default 'group',
  group_letter  char(1),
  home_team_id  uuid         references teams(id) on delete set null,
  away_team_id  uuid         references teams(id) on delete set null,
  scheduled_at  timestamptz  not null,
  status        match_status not null default 'scheduled',
  home_score    int,
  away_score    int,
  home_score_ht int,
  away_score_ht int,
  external_id   text         unique,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

create index on matches(tournament_id);
create index on matches(scheduled_at);
create index on matches(stage);

-- ─── leagues ─────────────────────────────────────────────────
create table leagues (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  tournament_id uuid        not null references tournaments(id) on delete restrict,
  is_open       boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── league_members ──────────────────────────────────────────
create table league_members (
  id             uuid        primary key default gen_random_uuid(),
  league_id      uuid        not null references leagues(id) on delete cascade,
  user_id        uuid        not null references profiles(id) on delete cascade,
  role           league_role not null default 'player',
  match_wallet   int         not null default 5000,
  special_wallet int         not null default 1000,
  is_active      boolean     not null default true,
  joined_at      timestamptz not null default now(),
  unique(league_id, user_id),
  constraint match_wallet_non_negative   check (match_wallet >= 0),
  constraint special_wallet_non_negative check (special_wallet >= 0)
);

create index on league_members(league_id);
create index on league_members(user_id);

-- ─── audit_log ───────────────────────────────────────────────
-- actor_id null = system action.
create table audit_log (
  id          uuid        primary key default gen_random_uuid(),
  actor_id    uuid        references profiles(id) on delete set null,
  action      text        not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index on audit_log(actor_id);
create index on audit_log(created_at desc);
create index on audit_log(entity_type, entity_id);
