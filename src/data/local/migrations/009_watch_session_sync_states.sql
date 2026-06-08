create table if not exists watch_session_sync_states (
  session_id text primary key,
  participant_id text not null,
  plan_id text not null,
  plan_hash text not null,
  package_id text,
  package_hash text,
  status text not null,
  last_known_watch_state text,
  last_status_at text,
  started_at text,
  committed_at text,
  sealed_at text,
  imported_at text,
  ack_eligible_at text,
  ack_sent_at text,
  unresolved_reason text,
  metadata_json text not null default '{}',
  updated_at text not null
);

create index if not exists idx_watch_session_sync_states_participant_status
on watch_session_sync_states(participant_id, status);
