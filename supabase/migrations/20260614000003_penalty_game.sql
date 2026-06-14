-- ─── Straffspel (penalty mini-game) ──────────────────────────────────────────
-- A light arcade game inside the app. One best-score row per league member,
-- plus a SECURITY DEFINER leaderboard reader (mirrors get_league_locked_stakes).
-- No coins involved — purely for fun and bragging rights.

create table if not exists penalty_scores (
  league_member_id uuid        primary key references league_members(id) on delete cascade,
  best_score       int         not null default 0 check (best_score >= 0),
  games_played     int         not null default 0 check (games_played >= 0),
  updated_at       timestamptz not null default now()
);

alter table penalty_scores enable row level security;

-- League members may read each other's scores (for the leaderboard).
create policy "penalty_scores: league members can read"
  on penalty_scores for select to authenticated
  using (
    is_league_member(
      (select league_id from league_members where id = penalty_scores.league_member_id)
    )
  );

create policy "penalty_scores: admin can do all"
  on penalty_scores for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

grant select on penalty_scores to authenticated;


-- Submit a finished game's score. Keeps the best, counts the play.
-- Returns the new best and whether this run set a personal record.
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
  -- Guard against absurd values (best legit runs are well under this).
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

  insert into penalty_scores (league_member_id, best_score, games_played, updated_at)
  values (v_member_id, p_score, 1, now())
  on conflict (league_member_id) do update
    set best_score   = greatest(penalty_scores.best_score, excluded.best_score),
        games_played = penalty_scores.games_played + 1,
        updated_at   = now()
  returning best_score into v_best;

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


-- Leaderboard for a league. SECURITY DEFINER + membership guard, same pattern
-- as get_league_locked_stakes. Names are joined in the app layer.
create or replace function get_penalty_leaderboard(p_league_id uuid)
returns table (
  league_member_id uuid,
  best_score       int,
  games_played     int
)
language sql
security definer
set search_path = public
stable
as $$
  select ps.league_member_id, ps.best_score, ps.games_played
  from penalty_scores ps
  join league_members lm on lm.id = ps.league_member_id
  where lm.league_id = p_league_id
    and lm.is_active = true
    and is_league_member(p_league_id);
$$;

revoke all     on function get_penalty_leaderboard(uuid) from public;
grant  execute on function get_penalty_leaderboard(uuid) to authenticated;
