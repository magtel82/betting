-- Raise inactivity fee from 50 to 150 coins.
-- Full replacement of apply_inactivity_fee — only the charge cap changed.

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
      continue;
    end if;

    -- Charge 150 coins (capped at balance — never go below 0)
    v_charge := least(150, v_member.match_wallet);

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
