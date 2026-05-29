alter table sessions
add column guided_training_skipped integer not null default 0;
