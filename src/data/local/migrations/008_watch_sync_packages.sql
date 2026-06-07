create table if not exists watch_sync_packages (
  package_id text primary key,
  session_id text not null,
  plan_hash text not null,
  package_hash text not null,
  sealed_at text not null,
  imported_at text,
  import_status text not null,
  manifest_json text not null,
  import_error text
);

create index if not exists idx_watch_sync_packages_session
on watch_sync_packages(session_id);
