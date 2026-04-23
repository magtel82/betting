-- ============================================================
-- Migration 0008 — Slip-låsning, inaktivitetsavgift, gruppbonus (fas 6B)
-- ============================================================
-- Schema:
--   match_wallet_transactions.fee_date date — for fee/bonus idempotency
--
-- RPCs:
--   lock_started_slips()                        — lock open slips
--   apply_inactivity_fee(league_id, fee_date)   — daily fee
--   apply_group_bonus(league_id)                — post-group-stage bonus
--
-- All three RPCs are revoked from public; callable only via service_role.
-- ============================================================

-- ─── Schema addition ─────────────────────────────────────────
-- fee_date: the Swedish calendar date this transaction was generated for.
-- Used to prevent duplicate inactivity charges for the same day.
-- NULL for slip-related transactions (bet_stake, bet_payout, bet_refund).

alter table match_wallet_transactions
  add column fee_date date;

create index on match_wallet_transactions(league_member_id, type, fee_date);

-- ─── lock_started_slips ──────────────────────────────────────
-- Sets status='locked' on every open slip where at least one match
-- in the slip has scheduled_at <= now().
--
-- Idempotent: only touches slips with status='open'.
-- Race-safe: single UPDATE statement — DB handles concurrency.
-- Callable any time; designed to run from syncResults() or cron later.

create or replace function lock_started_slips()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked int;
begin
  with slips_to_lock as (
    select distinct bs.id
    from bet_slips bs
    join bet_slip_selections bss on bss.slip_id = bs.id
    join matches m              on m.id          = bss.match_id
    where bs.status   = 'open'
      and m.scheduled_at <= now()
  )
  update bet_slips
  set status     = 'locked',
      locked_at  = now(),
      updated_at = now()
  where id in (select id from slips_to_lock)
    and status = 'open'; -- re-check prevents race from double-locking

  get diagnostics v_locked = row_count;

  return jsonb_build_object('ok', true, 'locked', v_locked);
end;
$$;

-- ─── apply_inactivity_fee ────────────────────────────────────
-- Charges 50 coins (capped at balance — no negatives) from match_wallet
-- for every inactive league member on the given matchday.
--
-- p_fee_date: Swedish calendar date of the matchday (e.g. '2026-06-12').
--
-- Active if at least one of:
--   1. Placed a new slip on p_fee_date (Swedish time)
--   2. Has an open or locked slip containing a match on p_fee_date
--
-- Idempotent: fee_date + league_id uniqueness checked in ledger.
-- Skips silently if not a matchday for the league.
-- Skips members with match_wallet = 0.

create or replace function apply_inactivity_fee(
  p_league_id uuid,
  p_fee_date  date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_matchday  boolean;
  v_member       record;
  v_already_done boolean;
  v_is_active    boolean;
  v_charge       int;
  v_charged      int := 0;
  v_active       int := 0;
  v_skip_zero    int := 0;
  v_skip_idem    int := 0;
begin
  -- 1. Is p_fee_date a matchday for this league?
  --    At least one non-void match must be scheduled for that day.
  select exists(
    select 1
    from matches m
    join leagues l on l.tournament_id = m.tournament_id
    where l.id     = p_league_id
      and m.status != 'void'
      and (m.scheduled_at at time zone 'Europe/Stockholm')::date = p_fee_date
  ) into v_is_matchday;

  if not v_is_matchday then
    return jsonb_build_object(
      'ok', true, 'skipped', 'not_a_matchday', 'fee_date', p_fee_date, 'charged', 0
    );
  end if;

  -- 2. For each active league member
  for v_member in
    select id, match_wallet
    from league_members
    where league_id = p_league_id and is_active = true
    for update
  loop
    -- Idempotency: already charged this date?
    select exists(
      select 1 from match_wallet_transactions
      where league_member_id = v_member.id
        and type     = 'inactivity_fee'
        and fee_date = p_fee_date
    ) into v_already_done;

    if v_already_done then
      v_skip_idem := v_skip_idem + 1;
      continue;
    end if;

    -- Skip zero balance
    if v_member.match_wallet <= 0 then
      v_skip_zero := v_skip_zero + 1;
      continue;
    end if;

    -- Activity check 1: placed any slip today (Swedish time)
    select exists(
      select 1 from bet_slips
      where league_member_id = v_member.id
        and (placed_at at time zone 'Europe/Stockholm')::date = p_fee_date
    ) into v_is_active;

    -- Activity check 2: has open/locked slip with a match today
    if not v_is_active then
      select exists(
        select 1
        from bet_slips bs
        join bet_slip_selections bss on bss.slip_id = bs.id
        join matches m              on m.id          = bss.match_id
        where bs.league_member_id = v_member.id
          and bs.status in ('open', 'locked')
          and (m.scheduled_at at time zone 'Europe/Stockholm')::date = p_fee_date
      ) into v_is_active;
    end if;

    if v_is_active then
      v_active := v_active + 1;
      continue; -- active players are exempt
    end if;

    -- Charge fee (capped at current balance — never go below 0)
    v_charge := least(50, v_member.match_wallet);

    update league_members
    set match_wallet = match_wallet - v_charge
    where id = v_member.id;

    insert into match_wallet_transactions (league_member_id, amount, type, fee_date)
    values (v_member.id, -v_charge, 'inactivity_fee', p_fee_date);

    v_charged := v_charged + 1;
  end loop;

  return jsonb_build_object(
    'ok',         true,
    'fee_date',   p_fee_date,
    'charged',    v_charged,
    'active',     v_active,
    'skip_zero',  v_skip_zero,
    'skip_idem',  v_skip_idem
  );
end;
$$;

-- ─── apply_group_bonus ───────────────────────────────────────
-- Distributes end-of-group-stage bonuses to all active members.
--
-- Prerequisites:
--   All group-stage matches must be finished or void.
--
-- Bonuses (credited to match_wallet):
--   1st place:  +500
--   2nd place:  +300
--   3rd place:  +200
--   Other:      +100
--
-- Ranking (RANK() — ties share place, next place skipped):
--   1. total_coins (match_wallet + special_wallet) desc
--   2. best single winning slip final_odds desc (0 if no wins)
--   3. won slip count desc
--   4. tied → shared placement, all get that place's bonus
--
-- Idempotent: no-op if any group_bonus transaction already exists
-- for this league.

create or replace function apply_group_bonus(p_league_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league    record;
  v_member    record;
  v_row       record;
  v_bonus     int;
  v_result    jsonb := '[]';
begin
  -- 1. Fetch league
  select * into v_league from leagues where id = p_league_id;
  if not found then
    return jsonb_build_object('error', 'league_not_found');
  end if;

  -- 2. All group-stage matches must be settled
  if exists(
    select 1 from matches
    where tournament_id = v_league.tournament_id
      and stage  = 'group'
      and status not in ('finished', 'void')
  ) then
    return jsonb_build_object('error', 'group_stage_not_complete');
  end if;

  -- 3. Idempotency: abort if bonus already distributed for this league
  if exists(
    select 1
    from match_wallet_transactions mwt
    join league_members lm on lm.id = mwt.league_member_id
    where lm.league_id = p_league_id
      and mwt.type     = 'group_bonus'
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_applied');
  end if;

  -- 4. Compute rankings and distribute bonuses
  --
  -- Tie-breaker order:
  --   1. total_coins (match_wallet + special_wallet) desc
  --   2. best_win_odds: max final_odds of any WON slip (0 if none) desc
  --   3. won_slips: count of won slips desc
  --
  -- RANK() produces 1,2,2,4 for ties — correct per spec ("nästa hoppas över").
  for v_row in
    with member_stats as (
      select
        lm.id                                                         as member_id,
        lm.match_wallet + lm.special_wallet                          as total_coins,
        coalesce(
          max(bs.final_odds) filter (where bs.status = 'won'),
          0::numeric(10,4)
        )                                                             as best_win_odds,
        count(bs.id) filter (where bs.status = 'won')::int           as won_slips
      from league_members lm
      left join bet_slips bs on bs.league_member_id = lm.id
      where lm.league_id = p_league_id
        and lm.is_active  = true
      group by lm.id, lm.match_wallet, lm.special_wallet
    )
    select
      member_id,
      total_coins,
      best_win_odds,
      won_slips,
      rank() over (
        order by total_coins desc, best_win_odds desc, won_slips desc
      )::int as placement
    from member_stats
    order by placement
  loop
    if    v_row.placement = 1 then v_bonus := 500;
    elsif v_row.placement = 2 then v_bonus := 300;
    elsif v_row.placement = 3 then v_bonus := 200;
    else                           v_bonus := 100;
    end if;

    -- Lock and credit
    select * into v_member from league_members where id = v_row.member_id for update;

    update league_members
    set match_wallet = match_wallet + v_bonus
    where id = v_row.member_id;

    insert into match_wallet_transactions (league_member_id, amount, type)
    values (v_row.member_id, v_bonus, 'group_bonus');

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'member_id',   v_row.member_id,
        'placement',   v_row.placement,
        'bonus',       v_bonus,
        'total_coins', v_row.total_coins
      )
    );
  end loop;

  return jsonb_build_object('ok', true, 'bonuses', v_result);
end;
$$;

-- ─── Permissions ─────────────────────────────────────────────
-- Only service_role may call these — admin actions enforce auth
-- in the TypeScript layer before reaching the RPC.

revoke execute on function lock_started_slips()             from public;
revoke execute on function apply_inactivity_fee(uuid, date) from public;
revoke execute on function apply_group_bonus(uuid)          from public;

grant  execute on function lock_started_slips()             to service_role;
grant  execute on function apply_inactivity_fee(uuid, date) to service_role;
grant  execute on function apply_group_bonus(uuid)          to service_role;
