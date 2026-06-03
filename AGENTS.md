# AGENTS.md

You are working on LucidCue, a React Native + native iOS/watchOS app for
targeted lucidity reactivation (TLR). Keep work small, truthful, and grounded in
the current repo.

## Read First

- `TLR_App_Plan.md` is the product/science contract.
- `docs/llm-orientation.md` is the current implementation briefing.
- `docs/decisions/001-watch-mode-is-watch-owned.md` locks Watch Mode ownership.
- `docs/decisions/002-phone-mode-is-phone-owned.md` locks Phone Mode ownership.

For Watch Mode work, read the orientation and Watch ADR before coding. For Phone
Mode work, read the orientation and Phone ADR before coding.

## Non-Negotiable Invariants

- Phone Mode is phone-owned.
- Watch Mode is watch-owned.
- In Watch Mode, the iPhone is sleep audio plus sync/status UI only.
- Do not implement live iPhone-driven Watch cue timing.
- Do not add research-control, no-cue, untrained-cue, sham, or placebo nights.
- Do not make therapeutic, diagnostic, medical-efficacy, or guaranteed-induction
  claims.
- Do not upload dream journal text/audio by default.
- Do not create Supabase auth or user-facing research upload unless Jeremy
  explicitly asks.
- Do not add Android watch support.
- Do not rename TLR to TMR.

## Jeremy Decision Boundary

Ask Jeremy whenever you are uncertain about anything nontechnical: UI flow,
copy intent, product behavior, science/protocol, consent/privacy, research
posture, claims, or user-facing defaults.

For technical tradeoffs, try to solve them yourself. If you need Jeremy, explain
the high-level tradeoff and the practical consequence of each option.

## Engineering Rules

- Prefer repo patterns over new abstractions.
- Keep edits surgical; every changed line should trace to the request.
- Do not refactor unrelated code.
- Remove imports, variables, and files made unused by your own changes.
- Do not revert user changes unless explicitly asked.
- Do not improvise protocol constants inside UI components.
- For UI work, preserve the existing visual system and ask before changing flows,
  wording intent, or design direction.

## Handoff Rule

Use `.agent_work/current.md` for native iOS/watch work, multi-agent work,
protocol/science/session behavior changes, tasks crossing more than three major
areas, interrupted long-running work, or work that cannot be finished in one
clean pass. Keep it concise and update it before stopping.

Durable architectural decisions belong in `docs/decisions/`, not in the handoff
file.

## Definition Of Done

- JS/docs-only changes: run `npm run typecheck`, `npm test`, and
  `git diff --check`.
- Native iOS/watch changes: also run the relevant iPhone and Watch simulator
  builds when available.
- Watch Mode changes: run the Watch source-of-truth/legacy-string tests and
  scan for old phone-owned Watch runtime strings.
- Final responses must mention verification run, verification not run with
  reason, remaining risks, and the main files changed.

## Science/Data Guardrails

Phone Mode follows Konkoly et al. 2024. Watch Mode follows Mallela/Mallett 2024.
Carr et al. 2023 is the presleep TLR/lucid-mindset anchor. Tan & Fan 2023 is
evidence context only. Peters et al. is background only for expectation effects,
dream journaling, association training, and lucidity measures.

When uncertain, preserve the current plan and ask Jeremy.
