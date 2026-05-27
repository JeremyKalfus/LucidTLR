alter table participants enable row level security;
alter table consents enable row level security;
alter table sessions enable row level security;
alter table cue_events enable row level security;
alter table movement_events enable row level security;
alter table watch_epochs enable row level security;
alter table morning_reports enable row level security;
alter table questionnaire_responses enable row level security;
alter table dream_journals enable row level security;

create policy "participants_own_rows"
on participants
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "consents_own_rows"
on consents
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = consents.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = consents.participant_id
    and p.user_id = auth.uid()
  )
);

create policy "sessions_own_rows"
on sessions
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = sessions.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = sessions.participant_id
    and p.user_id = auth.uid()
  )
);

create policy "cue_events_own_rows"
on cue_events
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = cue_events.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = cue_events.participant_id
    and p.user_id = auth.uid()
  )
);

create policy "movement_events_own_rows"
on movement_events
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = movement_events.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = movement_events.participant_id
    and p.user_id = auth.uid()
  )
);

create policy "watch_epochs_own_rows"
on watch_epochs
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = watch_epochs.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = watch_epochs.participant_id
    and p.user_id = auth.uid()
  )
);

create policy "morning_reports_own_rows"
on morning_reports
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = morning_reports.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = morning_reports.participant_id
    and p.user_id = auth.uid()
  )
);

create policy "questionnaire_responses_own_rows"
on questionnaire_responses
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = questionnaire_responses.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = questionnaire_responses.participant_id
    and p.user_id = auth.uid()
  )
);

create policy "dream_journals_own_rows"
on dream_journals
for all
using (
  exists (
    select 1 from participants p
    where p.participant_id = dream_journals.participant_id
    and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from participants p
    where p.participant_id = dream_journals.participant_id
    and p.user_id = auth.uid()
  )
);
