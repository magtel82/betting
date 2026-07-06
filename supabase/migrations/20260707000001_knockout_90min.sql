-- ============================================================
-- Migration — Settlement på 90-minutersresultatet
-- ============================================================
-- Körs MANUELLT i Supabase SQL Editor. Verifiera affected rows.
--
-- Bakgrund: settle_match avgör utfall från matchens lagrade
-- home_score/away_score. Slutspelsmatcher som avgörs på
-- förlängning/straffar har alltid en vinnare i slutresultatet,
-- så oavgjort-bet på 90 minuter förlorade felaktigt.
--
-- Fix: lagra 90-minutersresultatet separat (reg_home_score/
-- reg_away_score, alltid oavgjort) plus decided_by. settle_match
-- avgör nu på coalesce(reg_home_score, home_score) — dvs 90-min
-- för förlängning/straffar, ordinarie resultat annars.
--
-- Inga befintliga rader berörs: alla nya kolumner är NULL, och
-- coalesce(NULL, home_score) = tidigare beteende.
-- ============================================================

-- ─── Schema ──────────────────────────────────────────────────
alter table matches
  add column reg_home_score int  null,  -- resultat efter 90 min (satt när decided_by != 'regular')
  add column reg_away_score int  null,
  add column decided_by     text null
    check (decided_by in ('regular', 'extra_time', 'penalties'));

-- ─── settle_match — avgör på 90-minutersresultatet ───────────
-- Enda ändringen mot föregående version: utfallet beräknas från
-- coalesce(reg_*_score, *_score) i stället för *_score direkt.
create or replace function settle_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match              record;
  v_settle_home        int;
  v_settle_away        int;
  v_outcome            text;
  v_sel                record;
  v_new_sel_status     bet_status;
  v_slip_id            uuid;
  v_slip               record;
  v_member             record;
  v_all_settled        boolean;
  v_all_void           boolean;
  v_any_lost           boolean;
  v_final_odds         numeric(10,4);
  v_payout             int;
  v_selections_settled int := 0;
  v_slips_won          int := 0;
  v_slips_lost         int := 0;
  v_slips_void_count   int := 0;
  v_total_payout       int := 0;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then
    return jsonb_build_object('error', 'match_not_found');
  end if;

  if v_match.status not in ('finished', 'void') then
    return jsonb_build_object('error', 'match_not_settleable',
                              'status', v_match.status::text);
  end if;

  -- Avgör på 90-minutersresultatet när det finns (förlängning/straffar),
  -- annars på ordinarie slutresultat.
  v_settle_home := coalesce(v_match.reg_home_score, v_match.home_score);
  v_settle_away := coalesce(v_match.reg_away_score, v_match.away_score);

  if v_match.status = 'finished' and
     (v_settle_home is null or v_settle_away is null) then
    return jsonb_build_object('error', 'scores_missing');
  end if;

  if v_match.status = 'void' then
    v_outcome := null;
  elsif v_settle_home > v_settle_away then
    v_outcome := 'home';
  elsif v_settle_away > v_settle_home then
    v_outcome := 'away';
  else
    v_outcome := 'draw';
  end if;

  for v_sel in
    select bss.id, bss.outcome
    from bet_slip_selections bss
    join bet_slips bs on bs.id = bss.slip_id
    where bss.match_id = p_match_id
      and bss.status   = 'open'
      and bs.status    in ('open', 'locked')
    for update of bss
  loop
    if v_outcome is null then
      v_new_sel_status := 'void';
    elsif v_sel.outcome = v_outcome then
      v_new_sel_status := 'won';
    else
      v_new_sel_status := 'lost';
    end if;

    update bet_slip_selections
    set status = v_new_sel_status, updated_at = now()
    where id = v_sel.id;

    v_selections_settled := v_selections_settled + 1;
  end loop;

  for v_slip_id in
    select distinct bss.slip_id
    from bet_slip_selections bss
    join bet_slips bs on bs.id = bss.slip_id
    where bss.match_id = p_match_id
      and bs.status     in ('open', 'locked')
  loop
    select
      bool_and(bss.status != 'open') as all_settled,
      bool_and(bss.status  = 'void') as all_void,
      bool_or (bss.status  = 'lost') as any_lost
    into v_all_settled, v_all_void, v_any_lost
    from bet_slip_selections bss
    where bss.slip_id = v_slip_id;

    if not v_all_settled then
      continue;
    end if;

    select * into v_slip from bet_slips where id = v_slip_id for update;
    if v_slip.status not in ('open', 'locked') then
      continue;
    end if;

    select * into v_member from league_members
    where id = v_slip.league_member_id for update;

    if v_all_void then
      update bet_slips
      set status     = 'void',
          settled_at = now(),
          final_odds = null,
          updated_at = now()
      where id = v_slip_id;

      update league_members
      set match_wallet = match_wallet + v_slip.stake
      where id = v_member.id;

      insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
      values (v_member.id, v_slip.stake, 'bet_refund', v_slip_id);

      v_slips_void_count := v_slips_void_count + 1;

    elsif v_any_lost then
      update bet_slips
      set status     = 'lost',
          settled_at = now(),
          final_odds = null,
          updated_at = now()
      where id = v_slip_id;

      v_slips_lost := v_slips_lost + 1;

    else
      select exp(sum(ln(bss.odds_snapshot::float8)))::numeric(10,4)
      into v_final_odds
      from bet_slip_selections bss
      where bss.slip_id = v_slip_id and bss.status = 'won';

      v_payout := floor(v_slip.stake * v_final_odds);

      update bet_slips
      set status     = 'won',
          settled_at = now(),
          final_odds = v_final_odds,
          updated_at = now()
      where id = v_slip_id;

      update league_members
      set match_wallet = match_wallet + v_payout
      where id = v_member.id;

      insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
      values (v_member.id, v_payout, 'bet_payout', v_slip_id);

      v_slips_won    := v_slips_won + 1;
      v_total_payout := v_total_payout + v_payout;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',                 true,
    'match_id',           p_match_id,
    'match_status',       v_match.status::text,
    'outcome',            v_outcome,
    'selections_settled', v_selections_settled,
    'slips_won',          v_slips_won,
    'slips_lost',         v_slips_lost,
    'slips_void',         v_slips_void_count,
    'total_payout',       v_total_payout
  );
end;
$$;

revoke execute on function settle_match(uuid) from public;
grant  execute on function settle_match(uuid) to service_role;
