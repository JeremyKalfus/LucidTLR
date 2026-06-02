alter table watch_epochs
add column stable_low_movement_seconds real;

alter table watch_epochs
add column rough_movement_intensity text;

alter table watch_epochs
add column cue_decision_reason text;
