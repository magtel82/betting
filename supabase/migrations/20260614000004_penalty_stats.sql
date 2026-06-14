-- ─── Straffspel: utökad statistik ─────────────────────────────────────────────
-- Lägger till sämsta resultat per spelare + en logg över varje spelat spel så vi
-- kan visa "dagens bästa" och "dagens sämsta" (Stockholm-dygn).

-- Worst score per player (best fanns redan). Befintliga rader: sätt worst = best.
alter table penalty_scores add column if not exists worst_score int;
update penalty_scores set worst_score = best_score where worst_score is null;

-- Per-game log — behövs för dygnsvisa topp/botten.
create table if not exists penalty_games (
  id               uuid        primary key default gen_random_uuid(),
  league_member_id uuid        not null references league_members(id) on delete cascade,
  score            int         not null check (score >= 0),
  played_at        timestamptz not null default now()
);
create index if not exists penalty_games_member_idx on penalty_games(league_member_id);
create index if not exists penalty_games_played_idx  on penalty_games(played_at);

alter table penalty_games enable row level security;

create policy "penalty_games: league members can read"
  on penalty_games for select to authenticated
  using (
    is_league_member(
      (select league_id from league_members where id = penalty_games.league_member_id)
    )
  );

create policy "penalty_games: admin can do all"
  on penalty_games for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

grant select on penalty_games to authenticated;


-- Submit: logga varje spel + uppdatera best/worst/antal.
create or replace function submit_penalty_score(p_score int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_prev      int;
  v_best      int;
begin
  if p_score is null or p_score < 0 or p_score > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_score');
  end if;

  select id into v_member_id
  from league_members
  where user_id = auth.uid() and is_active = true
  limit 1;

  if v_member_id is null then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;

  select best_score into v_prev
  from penalty_scores
  where league_member_id = v_member_id;

  insert into penalty_scores (league_member_id, best_score, worst_score, games_played, updated_at)
  values (v_member_id, p_score, p_score, 1, now())
  on conflict (league_member_id) do update
    set best_score   = greatest(penalty_scores.best_score, excluded.best_score),
        worst_score  = least(coalesce(penalty_scores.worst_score, penalty_scores.best_score), excluded.worst_score),
        games_played = penalty_scores.games_played + 1,
        updated_at   = now()
  returning best_score into v_best;

  insert into penalty_games (league_member_id, score) values (v_member_id, p_score);

  return jsonb_build_object(
    'ok',        true,
    'best',      v_best,
    'score',     p_score,
    'is_record', (v_prev is null and p_score > 0) or (v_prev is not null and p_score > v_prev)
  );
end;
$$;

revoke all     on function submit_penalty_score(int) from public;
grant  execute on function submit_penalty_score(int) to authenticated;


-- Overview: per-spelare best/worst/antal + dagens bästa & sämsta enskilda spel.
create or replace function get_penalty_overview(p_league_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with mem as (
    select id from league_members where league_id = p_league_id and is_active = true
  ),
  players as (
    select ps.league_member_id, ps.best_score, ps.worst_score, ps.games_played
    from penalty_scores ps join mem on mem.id = ps.league_member_id
  ),
  today as (
    select pg.league_member_id, pg.score
    from penalty_games pg join mem on mem.id = pg.league_member_id
    where (pg.played_at at time zone 'Europe/Stockholm')::date
        = (now()       at time zone 'Europe/Stockholm')::date
  ),
  tb as (select league_member_id, score from today order by score desc, league_member_id limit 1),
  tw as (select league_member_id, score from today order by score asc,  league_member_id limit 1)
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', league_member_id, 'best', best_score,
        'worst', coalesce(worst_score, best_score), 'games', games_played))
      from players), '[]'::jsonb),
    'today_best',  (select jsonb_build_object('member_id', league_member_id, 'score', score) from tb),
    'today_worst', (select jsonb_build_object('member_id', league_member_id, 'score', score) from tw)
  )
  where is_league_member(p_league_id);
$$;

revoke all     on function get_penalty_overview(uuid) from public;
grant  execute on function get_penalty_overview(uuid) to authenticated;
