create index if not exists idx_sessions_participant_started_at
on sessions(participant_id, started_at);

create index if not exists idx_cue_events_session_timestamp
on cue_events(session_id, timestamp);

create index if not exists idx_movement_events_session_timestamp
on movement_events(session_id, timestamp);

create index if not exists idx_watch_epochs_session_epoch_start
on watch_epochs(session_id, epoch_start);

create index if not exists idx_morning_reports_session
on morning_reports(session_id);

create index if not exists idx_dream_journals_participant_created_at
on dream_journals(participant_id, created_at);

create index if not exists idx_upload_queue_status_created_at
on upload_queue(status, created_at);
