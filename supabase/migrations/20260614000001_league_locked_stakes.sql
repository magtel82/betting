-- ─── get_league_locked_stakes ────────────────────────────────────────────────
-- Returns per-member stakes currently tied up in open/locked match slips and
-- active special bets, for every active member of a league.
--
-- Why a SECURITY DEFINER RPC:
--   The standings ranks players by net worth = free wallet + stakes in play.
--   Match slips are readable league-wide (RLS), but `special_bets` rows are only
--   readable by their owner (the pick is hidden until reveal). A regular member
--   therefore cannot read other players' special stakes directly. This function
--   exposes only the AGGREGATE stake amounts (never selection_text), so the
--   leaderboard gets correct totals without leaking anyone's picks.
--
-- Guard: caller must be an active member of the requested league.

create or replace function get_league_locked_stakes(p_league_id uuid)
returns table (
  league_member_id uuid,
  locked_match     bigint,
  locked_special   bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    lm.id,
    coalesce((
      select sum(bs.stake)
      from bet_slips bs
      where bs.league_member_id = lm.id
        and bs.status in ('open', 'locked')
    ), 0)::bigint as locked_match,
    coalesce((
      select sum(sb.stake)
      from special_bets sb
      where sb.league_member_id = lm.id
        and sb.status = 'active'
    ), 0)::bigint as locked_special
  from league_members lm
  where lm.league_id = p_league_id
    and lm.is_active = true
    and is_league_member(p_league_id);  -- caller must belong to this league
$$;

revoke all      on function get_league_locked_stakes(uuid) from public;
grant  execute  on function get_league_locked_stakes(uuid) to authenticated;
