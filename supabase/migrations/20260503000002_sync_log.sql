-- ============================================================
-- Migration — sync_log: persistent history of cron/manual syncs
-- ============================================================

create table sync_log (
  id          bigserial    primary key,
  type        text         not null check (type in ('odds', 'results')),
  ran_at      timestamptz  not null,
  processed   int          not null default 0,
  updated     int          not null default 0,
  skipped     int          not null default 0,
  errors      jsonb        not null default '[]',
  duration_ms int          not null default 0
);

-- Only admins can read sync history; service_role writes (bypasses RLS).
alter table sync_log enable row level security;

create policy "sync_log: admin can read"
  on sync_log for select to authenticated
  using (is_any_admin());

-- Explicit grants (service_role bypasses RLS but still needs table grants).
grant select                    on sync_log             to authenticated;
grant insert, select            on sync_log             to service_role;
grant usage                     on sequence sync_log_id_seq to service_role;
