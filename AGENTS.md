# AGENTS.md

You are working on LucidTLR, a React Native + native iOS/watchOS app for
targeted lucidity reactivation (TLR). Keep work small, truthful, and grounded in
the current repo.

## Read First

- `TLR_App_Plan.md` is the product/science contract.
- `docs/llm-orientation.md` is the current implementation briefing.
- `docs/decisions/003-watch-mode-reset-placeholder.md` is the current Watch
  Mode implementation status.
- `docs/decisions/001-watch-mode-is-watch-owned.md` is future architecture
  reference while Watch Mode is disabled.
- `docs/decisions/002-phone-mode-is-phone-owned.md` locks Phone Mode ownership.

For Watch Mode work, read the orientation and Watch ADR before coding. For Phone
Mode work, read the orientation and Phone ADR before coding.

## Non-Negotiable Invariants

- Phone Mode is phone-owned.
- Watch Mode is currently a visible disabled/planned placeholder.
- Future Watch Mode rebuilds must stay watch-owned.
- No current Watch Mode UI may start a Watch session or call native Watch
  runtime/import code.
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

## Graphify

Use Graphify to improve repo orientation before broad source browsing. It is a
navigation aid, not a source of truth; preserve the Read First docs and the
non-negotiable invariants above.

- For codebase, architecture, ownership, data-flow, or impact questions, when
  `graphify-out/graph.json` exists, first run `graphify query "<question>"`
  before broad `rg`/file reads. Use `--budget 1200` to keep context tight unless
  the task clearly needs more.
- Use `graphify explain "<symbol-or-concept>"` for focused orientation,
  `graphify path "<A>" "<B>"` for relationship tracing, and
  `graphify affected "<symbol-or-concept>" --depth 2` for impact checks.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when
  query/path/explain output is insufficient. Do not read
  `graphify-out/graph.json` wholesale into context.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation before raw
  source browsing.
- After modifying indexed source or test code, run `graphify update .` to
  refresh the local graph. This is AST-only and should have no API cost.
- For docs, papers, images, audio, or other semantic graph refreshes, do not run
  full Graphify extraction unless Jeremy explicitly asks; those paths can call
  model providers.
- If `graphify-out/` is missing, you may run `graphify update .` from the repo
  root to rebuild the local graph using `.graphifyignore`.
- Do not commit `graphify-out/`; it is generated local output. Keep
  `.graphifyignore` focused so vendor/generated/media files do not dominate the
  graph.
- Do not run `graphify extract`, `graphify label`, `graphify install`,
  `graphify hook install`, or Graphify project/platform installers unless Jeremy
  explicitly asks. Those paths can use API keys, mutate agent config, or install
  git hooks.
- Graphify query/path/explain calls are logged locally by Graphify; do not put
  secrets or private user data in Graphify questions.

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
