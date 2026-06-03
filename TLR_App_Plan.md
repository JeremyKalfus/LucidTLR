# TLR Lucid Dream App Plan

## IDEA

Build a public lucid-dream induction app using **targeted lucidity reactivation (TLR)**. The app is consumer-facing first, with a strong optional research-data pathway. It is aligned with two guiding implementation papers:

- **Konkoly et al. 2024**: phone-based at-home TLR without PSG.
- **Mallela/Mallett 2024**: iPhone/watchOS TLR with Apple Watch-derived real-time REM estimation.

These papers are included as full PDFs in the repo. You may also refer to Jeremy's emails with the CNL lab using the Gmail MCP. When in doubt, always ask Jeremy or refer to the included papers / emails.

## Modes

### Phone Mode

- iPhone or Android.
- Uses presleep TLR training, scheduled late-night cueing, phone accelerometer movement detection, cue logs, and morning reports.
- User places phone **on the mattress beside the pillow**.

### Watch Mode

- iPhone + Apple Watch.
- Apple Watch owns the overnight Watch Mode runtime: sensor collection, experimental REM probability, cue timing, cue delivery, movement gates, and local logs.
- iPhone prepares and syncs the pre-sleep session plan, cue assets, and bundled Watch REM model before sleep, then imports Watch logs after waking.
- WatchConnectivity is for pre-sleep plan/assets/model sync and morning log sync, not live cue timing.
- Watch Mode also supports Log Sleep Only / No TLR nights: the Watch still owns overnight sensing and local log sync, but cue delivery is disabled.
- Watch uses heart rate, motion, and elapsed session time for REM-informed cueing.
- Watch Mode does not use GPS, SensorKit, live Apple sleep stages, wrist temperature, respiratory rate, or SpO2.
- Android watch support is excluded for now.

## Supported Devices

### iOS Phone Mode

- iPhone 11 or later, or iPhone SE 2nd generation or later.
- iOS 26+.

### Watch Mode

- iPhone 11 or later, or iPhone SE 2nd generation or later.
- iOS 26+.
- Apple Watch Series 6 or later, Apple Watch SE 2 or later, or Apple Watch Ultra or later.
- watchOS 26+.

### Android Phone Mode

- Android 10+.
- No Android watch integration.

---

## USER FLOW

## Onboarding

Use a single data-driven `OnboardingWizard`, not separate standalone intro,
consent, and setup screens. Store answers in generic questionnaire responses so
future CNL questionnaires do not force schema churn.

Wizard steps:

1. Welcome.
2. TLR explanation.
3. Mode selection.
4. Baseline sleep profile.
5. Dream/lucidity profile.
6. Sound sensitivity + sleep environment.
7. Goals.
8. Consent/privacy.
9. Permissions.
10. Ready.

Consent remains explicit within the wizard. Structured research upload and dream
journal upload are separate opt-ins, and dream journal upload defaults off.
Permission requests are mode-specific:

- Phone Mode:
  - audio,
  - motion,
  - local notifications if needed.
- Watch Mode:
  - audio,
  - motion,
  - HealthKit,
  - WatchConnectivity / watch app setup,
  - local notifications if needed.

Do not request location, contacts, texts, or advertising IDs. Tell users the app
may help induce lucid dreams, but do not claim guaranteed induction or medical
treatment.

## Presleep Training

- User starts a session before bed.
- App plays training audio.
- Training teaches the user to associate the cue with a lucid mindset:
  - notice the signal,
  - observe thoughts,
  - observe body and sensations,
  - observe breath,
  - critically inspect whether the experience differs from normal waking.
- Exact script is **TBD** and should be approved by CNL before implementation.

## Overnight Use

### Phone Mode

- Phone goes on mattress beside pillow.
- Notifications off.
- Phone remains plugged in if possible.
- Cueing begins around the late-night target window.
- Movement pauses cueing.

### Watch Mode

- iPhone nearby before sleep for WatchConnectivity sync, then charging near bed.
- Apple Watch charged and worn.
- iPhone syncs the session plan, cue assets, and Watch REM model before sleep.
- Watch app owns overnight sensor collection, experimental REM probability, cue timing, cue delivery, movement gates, and local logs.
- Watch Mode does not depend on live iPhone messages for cue timing.
- iPhone imports Watch epoch, cue, and movement logs after waking.
- Watch-detected movement pauses cueing to reduce arousal/awakening risk.
- If movement occurs shortly after a cue, cueing is suppressed for a pause window before resuming.

## Morning Review

- Ask whether user remembers any dreams.
- Ask whether any dream was lucid.
- Ask whether cues were heard, incorporated, or caused awakening.
- Optional dream journal text/audio entry.
- Show timeline:
  - Phone Mode: cue events + movement/arousal events.
  - Watch Mode: estimated REM/cue timeline + movement/arousal pauses.
- Dream journal content stays local by default unless the user separately consents to research upload.

---

## SCIENCE SOURCE OF TRUTH

The app should follow the two guiding implementation papers unless explicitly changed:

### Konkoly et al. 2024

**Paper:** “Provoking lucid dreams at home with sensory cues paired with pre-sleep cognitive training”

Use this as the source for **Phone Mode**.

Relevant implementation points:

- Smartphone-only at-home TLR.
- No PSG.
- Presleep cue-lucid-mindset training.
- Cueing begins about **6 hours after training ends**.
- Phone accelerometer movement is used as an arousal/disruption proxy.
- Movement pauses cueing.
- Morning dream/lucidity reports are collected.
- The mechanism is not merely “do a reality check.” It is cue-paired reactivation of a lucid mindset.

### Mallela/Mallett 2024

**Paper:** “Targeted lucidity reactivation implemented in an open source watchOS app”

Use this as the source for **Watch Mode**.

Relevant implementation points:

- iPhone + Apple Watch.
- Apple Watch collects:
  - heart rate,
  - triaxial motion,
  - elapsed time.
- Data is processed in **30-second epochs**.
- REM cueing uses `lucidcue-watch-rem-v1`: a bundled random-forest
  experimental REM-probability signal plus LucidCue safety gates. This is
  REM-informed cueing, not validated sleep staging. Do not claim exact Mallela
  feature parity or scientific validation from this implementation alone.
- Watch owns overnight cue timing and cue delivery during likely REM.
- iPhone involvement is pre-sleep plan/assets/model sync and morning log import.
- WatchConnectivity is not a live cue-timing dependency.
- Watch Mode does not use GPS, SensorKit, live Apple sleep stages, wrist
  temperature, respiratory rate, or SpO2.
- Beginning with the fifth consecutive likely-REM epoch, suppress additional cues until the REM period ends.
- Watch motion should also gate cueing:
  - large movement pauses cueing,
  - movement shortly after a cue triggers a longer pause,
  - cueing resumes only after a stable low-movement period.

### Background Papers

- **Carr et al. 2023** is the scientific anchor for TLR: presleep cue association with a lucid mindset, then cue replay during REM.
- **Tan & Fan 2023** is background for the mixed state of lucid-dream induction evidence and should be used to avoid overclaiming.

### Paller Lab / CNL Constraints from Project Correspondence

The core technical priorities are:

1. Sleep staging / REM detection.
2. Stopping sound presentation during arousal or movement.
3. Simple volume behavior that avoids waking the user.

Additional constraints:

- App is public-facing first with a strong optional research-data pathway.
- Jeremy should not engage participants or access identifiable participant data unless CNL/IRB explicitly changes scope.
- Prefer deidentified data only.
- Do not publicly share lab/IRB materials.
- Do not make therapeutic claims.
- Do not add control/no-cue/untrained-cue conditions for now.
- Do not silently rename TLR to TMR.

### Lucid Mindset

The app should train users to:

- notice the cue,
- observe thoughts,
- observe body and sensations,
- observe breath,
- critically inspect whether the current experience differs from normal waking.

The exact training script is **TBD** and must be approved before final implementation.

---

## SCIENCE

## Core Mechanism

The app implements TLR:

1. Before sleep, pair a distinctive cue with entering a lucid mindset.
2. During sleep, replay the same cue to reactivate that mindset.

Konkoly et al. show this can be translated to phone-only home use. Mallela/Mallett show an Apple Watch-based real-time REM-informed implementation.

## Cue

Default cue:

- **3-second soft harp/melodic cue**.
- Fade-in/fade-out.
- Non-startling.
- Same cue used every night for a user.

Do not use harsh beeps by default. Morse-code “dream” can remain a replication-style option, not the standard cue.

## Phone Mode Cueing

Faithful to Konkoly et al. 2024:

- Cueing begins about **6 hours after training ends**.
- Cues repeat every **20–40 seconds** during active cueing.
- Phone accelerometer detects movement.
- Movement pauses cueing.
- Cueing resumes after the pause window.
- Keep volume behavior simple: use a standard default volume/ramp.
- Hide sensitivity controls in settings.

## Watch Mode Cueing

Aligned with Mallela/Mallett 2024, with LucidCue product safety gates:

- Apple Watch collects:
  - heart rate,
  - triaxial motion,
  - elapsed session time.
- Watch Mode does not use GPS, SensorKit, live Apple sleep stages, wrist
  temperature, respiratory rate, or SpO2.
- Processing occurs in **30-second epochs** on the Watch.
- REM cueing uses `lucidcue-watch-rem-v1`: a bundled random-forest
  experimental REM-probability signal plus LucidCue safety gates. This is
  REM-informed cueing, not validated sleep staging or exact Mallela feature
  parity.
- If likely REM is detected, Watch delivers the cue.
- iPhone involvement is pre-sleep plan/assets/model sync and morning log import.
- WatchConnectivity is not used for live cue timing.
- Beginning with the fifth consecutive likely-REM epoch, suppress additional cues until the REM period ends to reduce awakenings.
- Watch movement data is also used for arousal gating:
  - large movement pauses cueing,
  - movement shortly after a cue triggers a longer pause,
  - cueing resumes only after a stable low-movement period.

Implementation status: the current phone-dependent Watch runtime is legacy.
Watch-owned Watch Mode v2 is the target.

## Research / Data Posture

- Public app first.
- Strong optional research element.
- No research-control nights for now.
- Everyone gets the same active TLR protocol.
- No no-cue or untrained-cue conditions.
- Deidentified data only by default.
- No names, GPS, advertising IDs, SensorKit, live Apple sleep stages, wrist
  temperature, respiratory rate, SpO2, or unnecessary identifiers.
- Dream journal text/audio is local-only unless separately consented for research upload.
- Avoid therapeutic claims unless CNL/IRB explicitly approves them.

---

## DATA / SUPABASE SETUP

## Data Model Philosophy

The app is **local-first** and **consent-gated for cloud upload**.

- The app must work without an account.
- Sleep sessions are stored locally by default.
- Cloud upload exists for research/backup only after explicit consent.
- Dream journal content is local-only by default.
- Research upload should use deidentified structured data where possible.

## Supabase Role

Use **Supabase** for non-local data.

Supabase should store only consented, deidentified app/research data. It should not become the main runtime dependency for overnight cueing. Overnight cueing must work locally even if the network is unavailable.

## Supabase Auth

Use **anonymous Supabase Auth** for users who consent to cloud upload.

Rationale:

- Avoid collecting email/name/phone by default.
- Still get a stable Supabase `auth.uid()` for Row Level Security.
- Allow optional account linking later if CNL wants account recovery.

Implementation rules:

- No email/password signup in the initial default flow.
- No social login in the initial default flow.
- If a user does not consent to upload, do not sign them into Supabase.
- If a user consents to upload, create an anonymous Supabase user and store consented records under that user ID.
- Separately maintain an app-level random `participant_id` for research exports so Supabase auth IDs do not appear in analysis exports.

## Supabase Security

- Enable Row Level Security (RLS) on every exposed table.
- Users can only insert/select/update their own rows.
- Service-role keys must never be shipped in the app.
- Research/admin exports must happen server-side or through a protected admin environment, not directly from the mobile client.
- No public read policies for participant data.
- No storage bucket public access for participant uploads.

## Cloud Upload Consent Levels

Use separate toggles/consents:

### No Upload

- All data local only.
- No Supabase account created.
- No cloud sync.

### Structured Research Upload

Allowed upload:

- anonymous participant ID,
- consent version,
- app version,
- mode,
- session timing,
- cue events,
- movement/arousal events,
- Phone Mode session summary,
- Watch Mode epoch summaries if enabled,
- morning structured report fields.

Not uploaded:

- dream journal free text,
- dream audio,
- name,
- email,
- GPS,
- advertising ID.

### Dream Journal Research Upload

Separate explicit consent.

Allowed upload:

- dream journal text/audio,
- cue incorporation descriptions,
- free-text lucid dream reports.

Default: off.

## Minimal Supabase Tables

Keep schema minimal.

### `participants`

- `id`
- `supabase_user_id`
- `participant_id`
- `created_at`
- `app_install_id_hash`
- `platform`
- `research_upload_enabled`
- `dream_upload_enabled`

### `consents`

- `id`
- `participant_id`
- `consent_type`
- `consent_version`
- `accepted_at`
- `withdrawn_at`
- `app_version`

### `sessions`

- `id`
- `participant_id`
- `mode`
- `started_at`
- `ended_at`
- `training_started_at`
- `training_ended_at`
- `cueing_started_at`
- `session_status`
- `app_version`
- `protocol_version`

### `cue_events`

- `id`
- `session_id`
- `timestamp`
- `cue_type`
- `volume_level`
- `delivery_device`
- `reason`
- `suppressed`

### `movement_events`

- `id`
- `session_id`
- `timestamp`
- `source`
- `intensity`
- `pause_started_at`
- `pause_ended_at`

### `watch_epochs`

- `id`
- `session_id`
- `epoch_start`
- `epoch_end`
- `heart_rate_summary`
- `motion_summary`
- `elapsed_time_seconds`
- `rem_probability`
- `rem_label`
- `classifier_version`

### `morning_reports`

- `id`
- `session_id`
- `remembered_dream`
- `lucid_dream`
- `heard_cue`
- `cue_incorporated`
- `cue_woke_user`
- `sleep_quality_rating`
- `submitted_at`

### `dream_journals`

- `id`
- `session_id`
- `local_only`
- `uploaded_with_explicit_consent`
- `text`
- `audio_storage_path`
- `created_at`

## Local Storage

Use local storage for:

- active overnight session state,
- pending cue schedule,
- cue logs,
- movement logs,
- morning reports,
- dream journal,
- upload queue.

Local data should be resilient to:

- app restart,
- phone lock,
- temporary network loss,
- failed upload.

## Research Export

Research export should use the app-level `participant_id`, not direct Supabase auth IDs.

Exports should separate:

- structured event data,
- watch epoch summaries,
- morning report fields,
- dream journal text/audio only if separately consented.

---

## STACK

## App Framework

Use **React Native + TypeScript with native modules**, not a pure managed Expo app.

Meaning:

- React Native handles shared UI and ordinary app state.
- Swift handles iOS/watchOS sleep-session behavior, HealthKit, WatchConnectivity, CoreMotion, audio/background behavior.
- Kotlin handles Android overnight cueing, accelerometer monitoring, audio playback, and foreground service behavior.
- Apple Watch app is a real Swift/SwiftUI watchOS target.

## iOS / watchOS

- React Native UI for iPhone.
- Swift native modules for:
  - audio session,
  - cue playback,
  - CoreMotion,
  - HealthKit,
  - WatchConnectivity,
  - local session storage.
- watchOS Swift app for:
  - HR collection,
  - motion collection,
  - 30-second epoch processing,
  - experimental REM probability,
  - cue timing and delivery,
  - movement/arousal gating,
  - local runtime logging,
  - sleep-safe interaction pattern.

## Android

- React Native UI.
- Kotlin native module for:
  - foreground overnight service,
  - accelerometer monitoring,
  - movement/arousal gating,
  - cue scheduling,
  - audio playback,
  - local session storage.

## Backend

Use Supabase for non-local data.

- Local-first.
- Upload only after explicit consent.
- Supabase Auth should be anonymous by default.
- RLS required on all participant-data tables.
- Keep uploaded data minimal.
- Keep dream journal upload separate from structured research upload.

## REM Classifier

Status: **to be decided**.

Requirements:

- accepts Apple Watch-accessible HR + motion + elapsed-time features,
- supports real-time or near-real-time inference,
- outputs REM probability/confidence,
- can run locally if possible,
- logs enough information for later validation.

---

## DESIGN / CODEX NOTES

## Visual Source of Truth

Use the Figma model as the visual source of truth. The home screen is not just a guide for the home screen; it defines the global design system for the entire app:

- dark near-black background,
- muted gray typography,
- rounded rectangular cards with thin borders,
- pill-shaped bottom navigator,
- thin outline icons,
- large rounded primary CTA,
- subtle glow on primary actions,
- sparse nocturnal layout,
- consistent margins, spacing, radii, and card styles across screens.

Codex should use Figma MCP to inspect exact fonts, colors, sizes, radii, spacing, borders, and navigation styling. Do not guess these from screenshots if Figma data is available.

## Codex / Agent Setup

Use:

- Figma MCP,
- Expo for React Native scaffolding/shared UI,
- Make iOS apps plugin,
- Make Android apps plugin.

Use the Karpathy-style `AGENTS.md` ruleset from `multica-ai/andrej-karpathy-skills`, plus these project-specific rules:

- Read this plan before coding.
- Treat this plan as the product/science source of truth.
- Use Figma MCP before implementing UI.
- Do not overengineer.
- Do not add research controls.
- Do not add no-cue nights.
- Do not add untrained-cue nights.
- Do not add backend/auth unless explicitly requested.
- Do not replace or overclaim the Watch REM classifier without explicit Jeremy
  approval.
- Do not make therapeutic claims.
- Do not add Android watch support.
- Do not make Watch Mode depend on live iPhone cue timing.
- Use React Native + TypeScript for shared UI.
- Use native code only where required.
- Keep the first implementation minimal and working.

## Science Guardrails for Codex

Before changing any sleep, cueing, consent, privacy, or research behavior, read this plan.

Do not improvise the science protocol.

Do not:

- change cue timing,
- change movement-pause logic,
- overclaim the Watch REM classifier as scientifically validated,
- add placebo/no-cue/untrained-cue nights,
- add therapeutic claims,
- upload dream journal text by default,
- make Watch Mode depend on live iPhone cue timing,
- rename TLR to TMR,
- turn Phone Mode into a lesser fallback.

Phone Mode follows Konkoly et al. 2024.
Watch Mode follows Mallela/Mallett 2024.
Carr et al. 2023 is the TLR scientific anchor.
Tan & Fan 2023 is background for evidence limitations.

When uncertain, preserve the plan and ask.
