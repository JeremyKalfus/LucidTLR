alter table sessions
add constraint sessions_participant_local_session_id_key
unique (participant_id, local_session_id);

alter table cue_events
add constraint cue_events_participant_local_event_id_key
unique (participant_id, local_event_id);

alter table movement_events
add constraint movement_events_participant_local_event_id_key
unique (participant_id, local_event_id);

alter table watch_epochs
add constraint watch_epochs_participant_local_epoch_id_key
unique (participant_id, local_epoch_id);

alter table morning_reports
add constraint morning_reports_participant_local_report_id_key
unique (participant_id, local_report_id);

alter table questionnaire_responses
add constraint questionnaire_responses_participant_local_response_id_key
unique (participant_id, local_response_id);

alter table dream_journals
add constraint dream_journals_participant_local_journal_id_key
unique (participant_id, local_journal_id);
