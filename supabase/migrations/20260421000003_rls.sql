-- ============================================================
-- Migration 0003 — Row Level Security
-- ============================================================

alter table profiles         enable row level security;
alter table invite_whitelist enable row level security;
alter table tournaments      enable row level security;
alter table teams            enable row level security;
alter table matches          enable row level security;
alter table leagues          enable row level security;
alter table league_members   enable row level security;
alter table audit_log        enable row level security;

-- ─── profiles ────────────────────────────────────────────────
create policy "profiles: authenticated can read all"
  on profiles for select to authenticated using (true);

create policy "profiles: user can update own row"
  on profiles for update to authenticated
  using     (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── invite_whitelist ────────────────────────────────────────
create policy "whitelist: admin full access"
  on invite_whitelist for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

-- ─── tournaments ─────────────────────────────────────────────
create policy "tournaments: authenticated can read"
  on tournaments for select to authenticated using (true);

create policy "tournaments: admin can write"
  on tournaments for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

-- ─── teams ───────────────────────────────────────────────────
create policy "teams: authenticated can read"
  on teams for select to authenticated using (true);

create policy "teams: admin can write"
  on teams for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

-- ─── matches ─────────────────────────────────────────────────
create policy "matches: authenticated can read"
  on matches for select to authenticated using (true);

create policy "matches: admin can write"
  on matches for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

-- ─── leagues ─────────────────────────────────────────────────
-- Members see their own league; admin can write.
create policy "leagues: members can read own league"
  on leagues for select to authenticated
  using (is_league_member(id));

create policy "leagues: admin can update"
  on leagues for update to authenticated
  using     (is_league_admin(id))
  with check (is_league_admin(id));

-- ─── league_members ──────────────────────────────────────────
create policy "league_members: members can read their league"
  on league_members for select to authenticated
  using (is_league_member(league_id));

create policy "league_members: admin can manage"
  on league_members for all to authenticated
  using     (is_league_admin(league_id))
  with check (is_league_admin(league_id));

-- ─── audit_log ───────────────────────────────────────────────
create policy "audit_log: admin can read"
  on audit_log for select to authenticated
  using (is_any_admin());

-- Server-side code (service role) bypasses RLS for inserts.
-- Authenticated insert policy provided for direct client calls only.
create policy "audit_log: authenticated can insert own actions"
  on audit_log for insert to authenticated
  with check (actor_id = auth.uid());
