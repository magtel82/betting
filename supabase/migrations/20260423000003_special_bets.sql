-- ============================================================
-- Migration 0009 — Specialbets schema (fas 7A)
-- ============================================================
-- Tables:
--   special_markets            — admin-managed market odds per tournament
--   special_bets               — versioned player bets (one active per market)
--   special_wallet_transactions — ledger for special_wallet movements
--
-- Design decisions:
--   • special_markets holds one row per market type per tournament.
--     Admin upserts this row to change the current odds.
--   • special_bets are versioned: changes create a new row (status='active')
--     and mark the previous row (status='superseded'). Partial unique index
--     enforces at most one active bet per (league_member, market).
--   • special_wallet is a separate wallet from match_wallet. Its transactions
--     are tracked in special_wallet_transactions.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

create type special_market_type as enum (
  'vm_vinnare',    -- Tournament winner. Admin-set odds.
  'skyttekung',    -- Top scorer. Admin-set odds.
  'sverige_mal'    -- Sweden goals in group stage. Fixed 4x payout.
);

create type special_bet_status as enum (
  'active',       -- Current active version
  'superseded',   -- Replaced by a newer version (player amended)
  'cancelled'     -- Removed by player or admin
);

create type special_wallet_tx_type as enum (
  'special_stake',   -- Debit at placement (fas 7B)
  'special_payout',  -- Credit at win (settlement, fas 7C)
  'special_refund',  -- Credit on cancellation/amendment (fas 7B)
  'admin_adjust'     -- Manual admin adjustment
);

-- ─── special_markets ─────────────────────────────────────────
-- One row per market type per tournament.
-- Admin upserts odds here; players lock in the current odds when placing.
--
-- odds:               decimal odds for vm_vinnare/skyttekung (> 1.0).
--                     null for sverige_mal (uses fixed_payout_factor).
-- fixed_payout_factor: 4.0 for sverige_mal. null for odds-based markets.
-- set_by:             admin who last updated the odds.

create table special_markets (
  id                  uuid                 primary key default gen_random_uuid(),
  tournament_id       uuid                 not null references tournaments(id) on delete cascade,
  type                special_market_type  not null,
  label               text                 not null,
  odds                numeric(8,2)         check (odds is null or odds > 1.0),
  fixed_payout_factor numeric(8,2)         check (fixed_payout_factor is null or fixed_payout_factor > 1.0),
  set_by              uuid                 references profiles(id) on delete set null,
  created_at          timestamptz          not null default now(),
  updated_at          timestamptz          not null default now(),
  unique(tournament_id, type)
);

create index on special_markets(tournament_id);

create trigger special_markets_updated_at
  before update on special_markets
  for each row execute function handle_updated_at();

-- ─── special_bets ────────────────────────────────────────────
-- One row per version of a player's bet on a market.
--
-- version:          1-based, increments on each amendment.
-- selection_text:   what the player picked (team name, player name, goal count).
-- stake:            coins from special_wallet (>= 100 per spec).
-- odds_snapshot:    locked at placement (market.odds or fixed_payout_factor).
-- potential_payout: floor(stake * odds_snapshot), computed at placement.
-- status:           active | superseded | cancelled.
--
-- Partial unique index ensures at most one active bet per (member, market).

create table special_bets (
  id               uuid                primary key default gen_random_uuid(),
  league_member_id uuid                not null references league_members(id) on delete restrict,
  market_id        uuid                not null references special_markets(id) on delete restrict,
  version          int                 not null default 1 check (version >= 1),
  selection_text   text                not null,
  stake            int                 not null check (stake >= 100),
  odds_snapshot    numeric(8,2)        not null check (odds_snapshot > 1.0),
  potential_payout int                 not null check (potential_payout > 0),
  status           special_bet_status  not null default 'active',
  placed_at        timestamptz         not null default now(),
  settled_at       timestamptz,
  created_at       timestamptz         not null default now(),
  updated_at       timestamptz         not null default now()
);

create index on special_bets(league_member_id);
create index on special_bets(market_id);
create index on special_bets(league_member_id, market_id);

-- Exactly one active bet per player per market
create unique index special_bets_one_active
  on special_bets(league_member_id, market_id)
  where status = 'active';

create trigger special_bets_updated_at
  before update on special_bets
  for each row execute function handle_updated_at();

-- ─── special_wallet_transactions ─────────────────────────────
-- Ledger for special_wallet movements.
-- Mirrors the structure of match_wallet_transactions.
-- The authoritative balance is league_members.special_wallet.

create table special_wallet_transactions (
  id               uuid                    primary key default gen_random_uuid(),
  league_member_id uuid                    not null references league_members(id) on delete restrict,
  amount           int                     not null,
  type             special_wallet_tx_type  not null,
  special_bet_id   uuid                    references special_bets(id) on delete set null,
  created_at       timestamptz             not null default now()
);

create index on special_wallet_transactions(league_member_id);
create index on special_wallet_transactions(special_bet_id);

-- ─── RLS ─────────────────────────────────────────────────────

alter table special_markets             enable row level security;
alter table special_bets                enable row level security;
alter table special_wallet_transactions enable row level security;

-- special_markets: all authenticated users can read (needed to display odds in UI)
create policy "special_markets: authenticated can read"
  on special_markets for select to authenticated using (true);

create policy "special_markets: admin can write"
  on special_markets for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

-- special_bets: players see only their own rows; admin sees all.
-- Deadline-based visibility (all players see others after deadline) is
-- enforced in the application layer (fas 7B), not in RLS.
create policy "special_bets: member sees own"
  on special_bets for select to authenticated
  using (
    league_member_id in (
      select id from league_members where user_id = auth.uid() and is_active = true
    )
  );

create policy "special_bets: admin sees all"
  on special_bets for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

-- special_wallet_transactions: players see only their own; admin sees all
create policy "special_wallet_tx: member sees own"
  on special_wallet_transactions for select to authenticated
  using (
    league_member_id in (
      select id from league_members where user_id = auth.uid() and is_active = true
    )
  );

create policy "special_wallet_tx: admin sees all"
  on special_wallet_transactions for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());
