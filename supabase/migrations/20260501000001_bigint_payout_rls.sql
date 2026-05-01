-- ============================================================
-- Migration 0012 — BUG-1: bigint potential_payout + BUG-2: specialbet RLS
-- ============================================================
-- BUG-1: potential_payout was int (32-bit). High-odds accumulators can
--        produce payouts that approach or exceed INT_MAX. Change to bigint
--        in both tables and in the three RPCs that compute/store it.
--        settle_special_market's v_total_paid also updated to bigint since
--        it accumulates bigint values from the column.
--
-- BUG-2: special_bets RLS only allowed members to see their own rows.
--        A new policy allows any active league member to read all special_bets
--        in their own league once the tournament's special_bets_deadline has
--        passed. Admin visibility is unchanged (existing policy covers all).
-- ============================================================

-- ─── BUG-1: Widen potential_payout columns ───────────────────

alter table bet_slips
  alter column potential_payout type bigint;

alter table special_bets
  alter column potential_payout type bigint;

-- ─── BUG-1: Recreate place_bet_slip with bigint v_potential_pay ──

create or replace function place_bet_slip(
  p_league_member_id uuid,
  p_stake            int,
  p_selections       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member         record;
  v_max_stake      int;
  v_slip_id        uuid;
  v_combined_odds  numeric(10,4) := 1.0;
  v_potential_pay  bigint;
  v_sel            jsonb;
  v_match          record;
  v_odds_row       record;
  v_submitted_odds numeric(6,2);
  v_current_odds   numeric(6,2);
  v_outcome        text;
  v_match_id       uuid;
  v_sel_count      int;
begin
  select * into v_member
  from league_members
  where id = p_league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if not exists(
    select 1 from leagues where id = v_member.league_id and is_open = true
  ) then
    return jsonb_build_object('error', 'league_closed');
  end if;

  v_sel_count := jsonb_array_length(p_selections);
  if v_sel_count < 1 or v_sel_count > 5 then
    return jsonb_build_object('error', 'invalid_selection_count');
  end if;

  v_max_stake := floor(v_member.match_wallet * 0.3);
  if p_stake < 10 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;
  if p_stake > v_max_stake then
    return jsonb_build_object('error', 'stake_exceeds_limit',
                              'max_stake', v_max_stake,
                              'balance',   v_member.match_wallet);
  end if;
  if p_stake > v_member.match_wallet then
    return jsonb_build_object('error', 'insufficient_balance',
                              'balance', v_member.match_wallet);
  end if;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    if v_outcome not in ('home', 'draw', 'away') then
      return jsonb_build_object('error', 'invalid_outcome', 'match_id', v_match_id);
    end if;

    select * into v_match from matches where id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'match_not_found', 'match_id', v_match_id);
    end if;

    if v_match.status != 'scheduled' or v_match.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_not_bettable', 'match_id', v_match_id);
    end if;

    select * into v_odds_row from match_odds where match_id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'no_odds', 'match_id', v_match_id);
    end if;

    case v_outcome
      when 'home' then v_current_odds := v_odds_row.home_odds;
      when 'draw' then v_current_odds := v_odds_row.draw_odds;
      when 'away' then v_current_odds := v_odds_row.away_odds;
    end case;

    v_submitted_odds := (v_sel->>'odds_snapshot')::numeric(6,2);
    if v_submitted_odds != v_current_odds then
      return jsonb_build_object(
        'error',     'odds_changed',
        'match_id',  v_match_id,
        'submitted', v_submitted_odds,
        'current',   v_current_odds
      );
    end if;

    v_combined_odds := v_combined_odds * v_current_odds;
  end loop;

  v_potential_pay := floor(p_stake::numeric * v_combined_odds);

  update league_members
  set match_wallet = match_wallet - p_stake
  where id = p_league_member_id;

  insert into bet_slips (league_member_id, stake, combined_odds, potential_payout, status)
  values (p_league_member_id, p_stake, v_combined_odds, v_potential_pay, 'open')
  returning id into v_slip_id;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    select * into v_odds_row from match_odds where match_id = v_match_id;

    case v_outcome
      when 'home' then v_current_odds := v_odds_row.home_odds;
      when 'draw' then v_current_odds := v_odds_row.draw_odds;
      when 'away' then v_current_odds := v_odds_row.away_odds;
    end case;

    insert into bet_slip_selections (slip_id, match_id, outcome, odds_snapshot)
    values (v_slip_id, v_match_id, v_outcome, v_current_odds);
  end loop;

  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (p_league_member_id, -p_stake, 'bet_stake', v_slip_id);

  return jsonb_build_object(
    'ok',              true,
    'slip_id',         v_slip_id,
    'combined_odds',   v_combined_odds,
    'potential_payout', v_potential_pay
  );
end;
$$;

-- ─── BUG-1: Recreate amend_bet_slip with bigint v_potential ──────

create or replace function amend_bet_slip(
  p_old_slip_id uuid,
  p_stake       int,
  p_selections  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_slip      record;
  v_member        record;
  v_effective_bal int;
  v_max_stake     int;
  v_combined      numeric(10,4) := 1.0;
  v_slip_id       uuid;
  v_potential     bigint;
  v_sel           jsonb;
  v_match         record;
  v_odds_row      record;
  v_submitted     numeric(6,2);
  v_current       numeric(6,2);
  v_outcome       text;
  v_match_id      uuid;
  v_sel_count     int;
begin
  select * into v_old_slip from bet_slips where id = p_old_slip_id for update;
  if not found then
    return jsonb_build_object('error', 'slip_not_found');
  end if;

  select * into v_member
  from league_members
  where id = v_old_slip.league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if v_old_slip.status != 'open' then
    return jsonb_build_object('error', 'slip_not_open', 'status', v_old_slip.status::text);
  end if;

  for v_sel in
    select bss.match_id, m.scheduled_at
    from bet_slip_selections bss
    join matches m on m.id = bss.match_id
    where bss.slip_id = p_old_slip_id
  loop
    if v_sel.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_already_started', 'match_id', v_sel.match_id);
    end if;
  end loop;

  if not exists(select 1 from leagues where id = v_member.league_id and is_open = true) then
    return jsonb_build_object('error', 'league_closed');
  end if;

  v_sel_count := jsonb_array_length(p_selections);
  if v_sel_count < 1 or v_sel_count > 5 then
    return jsonb_build_object('error', 'invalid_selection_count');
  end if;

  v_effective_bal := v_member.match_wallet + v_old_slip.stake;
  v_max_stake     := floor(v_effective_bal * 0.3);

  if p_stake < 10 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;
  if p_stake > v_max_stake then
    return jsonb_build_object('error', 'stake_exceeds_limit', 'max_stake', v_max_stake);
  end if;
  if p_stake > v_effective_bal then
    return jsonb_build_object('error', 'insufficient_balance');
  end if;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    if v_outcome not in ('home', 'draw', 'away') then
      return jsonb_build_object('error', 'invalid_outcome', 'match_id', v_match_id);
    end if;

    select * into v_match from matches where id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'match_not_found', 'match_id', v_match_id);
    end if;

    if v_match.status != 'scheduled' or v_match.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_not_bettable', 'match_id', v_match_id);
    end if;

    select * into v_odds_row from match_odds where match_id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'no_odds', 'match_id', v_match_id);
    end if;

    case v_outcome
      when 'home' then v_current := v_odds_row.home_odds;
      when 'draw' then v_current := v_odds_row.draw_odds;
      when 'away' then v_current := v_odds_row.away_odds;
    end case;

    v_submitted := (v_sel->>'odds_snapshot')::numeric(6,2);
    if v_submitted != v_current then
      return jsonb_build_object(
        'error',     'odds_changed',
        'match_id',  v_match_id,
        'submitted', v_submitted,
        'current',   v_current
      );
    end if;

    v_combined := v_combined * v_current;
  end loop;

  v_potential := floor(p_stake::numeric * v_combined);

  update bet_slips set status = 'cancelled' where id = p_old_slip_id;

  update league_members
  set match_wallet = match_wallet + v_old_slip.stake - p_stake
  where id = v_member.id;

  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, v_old_slip.stake, 'bet_refund', p_old_slip_id);

  insert into bet_slips (league_member_id, stake, combined_odds, potential_payout, status)
  values (v_member.id, p_stake, v_combined, v_potential, 'open')
  returning id into v_slip_id;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    select * into v_odds_row from match_odds where match_id = v_match_id;

    case v_outcome
      when 'home' then v_current := v_odds_row.home_odds;
      when 'draw' then v_current := v_odds_row.draw_odds;
      when 'away' then v_current := v_odds_row.away_odds;
    end case;

    insert into bet_slip_selections (slip_id, match_id, outcome, odds_snapshot)
    values (v_slip_id, v_match_id, v_outcome, v_current);
  end loop;

  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, -p_stake, 'bet_stake', v_slip_id);

  return jsonb_build_object(
    'ok',               true,
    'slip_id',          v_slip_id,
    'combined_odds',    v_combined,
    'potential_payout', v_potential,
    'refunded',         v_old_slip.stake
  );
end;
$$;

-- ─── BUG-1: Recreate place_special_bet with bigint v_payout ─────

create or replace function place_special_bet(
  p_member_id      uuid,
  p_market_id      uuid,
  p_selection_text text,
  p_stake          int,
  p_odds_snapshot  numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member         record;
  v_league         record;
  v_tournament     record;
  v_market         record;
  v_existing_bet   record;
  v_has_existing   boolean  := false;
  v_effective_odds numeric;
  v_effective_bal  int;
  v_new_version    int;
  v_new_bet_id     uuid;
  v_payout         bigint;
begin
  select * into v_member
  from league_members
  where id = p_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  select * into v_league from leagues where id = v_member.league_id;
  if not found or not v_league.is_open then
    return jsonb_build_object('error', 'league_closed');
  end if;

  select * into v_tournament from tournaments where id = v_league.tournament_id;
  if v_tournament.special_bets_deadline is not null
     and now() >= v_tournament.special_bets_deadline then
    return jsonb_build_object('error', 'deadline_passed');
  end if;

  if p_stake < 100 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;

  select * into v_market from special_markets where id = p_market_id;
  if not found then
    return jsonb_build_object('error', 'market_not_found');
  end if;

  if v_market.type in ('vm_vinnare', 'skyttekung') then
    if v_market.odds is null then
      return jsonb_build_object('error', 'no_odds');
    end if;
    if v_market.odds != p_odds_snapshot then
      return jsonb_build_object(
        'error',        'odds_changed',
        'current_odds', v_market.odds
      );
    end if;
    v_effective_odds := v_market.odds;
  else
    v_effective_odds := v_market.fixed_payout_factor;
  end if;

  select * into v_existing_bet
  from special_bets
  where league_member_id = p_member_id
    and market_id         = p_market_id
    and status            = 'active'
  for update;

  if found then
    v_has_existing  := true;
    v_effective_bal := v_member.special_wallet + v_existing_bet.stake;
    v_new_version   := v_existing_bet.version + 1;
  else
    v_has_existing  := false;
    v_effective_bal := v_member.special_wallet;
    v_new_version   := 1;
  end if;

  if v_effective_bal < p_stake then
    return jsonb_build_object(
      'error',   'insufficient_balance',
      'balance', v_effective_bal
    );
  end if;

  if v_has_existing then
    update special_bets set status = 'superseded' where id = v_existing_bet.id;
  end if;

  v_payout := floor(p_stake::numeric * v_effective_odds);

  insert into special_bets (
    league_member_id, market_id, version,
    selection_text, stake, odds_snapshot, potential_payout, status
  )
  values (
    p_member_id, p_market_id, v_new_version,
    p_selection_text, p_stake, v_effective_odds, v_payout, 'active'
  )
  returning id into v_new_bet_id;

  update league_members
  set special_wallet = v_effective_bal - p_stake
  where id = p_member_id;

  if v_has_existing then
    insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
    values (p_member_id, v_existing_bet.stake, 'special_refund', v_existing_bet.id);
  end if;

  insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
  values (p_member_id, -p_stake, 'special_stake', v_new_bet_id);

  return jsonb_build_object(
    'ok',               true,
    'special_bet_id',   v_new_bet_id,
    'version',          v_new_version,
    'odds_snapshot',    v_effective_odds,
    'potential_payout', v_payout
  );
end;
$$;

-- ─── BUG-1: Recreate settle_special_market with bigint v_total_paid ──
-- v_total_paid accumulates potential_payout values which are now bigint.

create or replace function settle_special_market(
  p_market_id   uuid,
  p_result_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market     record;
  v_bet        record;
  v_bets_won   int    := 0;
  v_bets_lost  int    := 0;
  v_total_paid bigint := 0;
begin
  if p_result_text is null or trim(p_result_text) = '' then
    return jsonb_build_object('error', 'result_text_empty');
  end if;

  select * into v_market
  from special_markets
  where id = p_market_id
  for update;

  if not found then
    return jsonb_build_object('error', 'market_not_found');
  end if;

  if v_market.settled_at is not null then
    return jsonb_build_object(
      'error',      'already_settled',
      'settled_at', v_market.settled_at
    );
  end if;

  update special_markets
  set result_text = trim(p_result_text),
      settled_at  = now()
  where id = p_market_id;

  for v_bet in
    select * from special_bets
    where market_id = p_market_id and status = 'active'
    for update
  loop
    if lower(trim(v_bet.selection_text)) = lower(trim(p_result_text)) then
      update special_bets set status = 'won', settled_at = now() where id = v_bet.id;

      update league_members
      set special_wallet = special_wallet + v_bet.potential_payout
      where id = v_bet.league_member_id;

      insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
      values (v_bet.league_member_id, v_bet.potential_payout, 'special_payout', v_bet.id);

      v_bets_won   := v_bets_won + 1;
      v_total_paid := v_total_paid + v_bet.potential_payout;
    else
      update special_bets set status = 'lost', settled_at = now() where id = v_bet.id;
      v_bets_lost := v_bets_lost + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',         true,
    'bets_won',   v_bets_won,
    'bets_lost',  v_bets_lost,
    'total_paid', v_total_paid
  );
end;
$$;

-- ─── BUG-2: Add post-deadline visibility policy for special_bets ──
-- After the tournament's special_bets_deadline, any active league member
-- can read all special_bets placed by members in the same league.
-- The existing "member sees own" policy continues to cover before-deadline.
-- Admin visibility is handled by the existing "admin sees all" policy.

create policy "special_bets: league members can read after deadline"
  on special_bets for select to authenticated
  using (
    exists (
      select 1
      from league_members  lm
      join leagues         l  on l.id  = lm.league_id
      join tournaments     t  on t.id  = l.tournament_id
      where lm.user_id   = auth.uid()
        and lm.is_active = true
        and t.special_bets_deadline is not null
        and now() >= t.special_bets_deadline
        and exists (
          select 1 from league_members lm2
          where lm2.id       = special_bets.league_member_id
            and lm2.league_id = lm.league_id
        )
    )
  );
