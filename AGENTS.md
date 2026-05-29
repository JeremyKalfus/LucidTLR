# AGENTS.md

You are working on LucidCue, an iOS/android/apple watch app that uses TLR for
lucid dreaming. Always refer to the full "TLR_App_Plan.md" for this project
unless otherwise stated. Keep code clean and simple. Break up tasks into
micro-steps and test each step before continuing. If something fails tests, find
the reason--do not do workarounds.

For UI work, use UI skills and always ask Jeremy. ALWAYS be incredibly internally consistent with UI. Don't double-nest cards or use 100 different fonts or font sizes. Try to stick to 2 different fonts, 2-3 font sizes. You may refer to the Figma MCP connection documented in `docs/figma/FIGMA_MCP.md`, but we don't use it much anymore.

Liberally ask for clarification and user input on UI, functionality-based, or
science informed app decisions. You are not the decider of these things, Jeremy
is. His input is needed, so you should not make decisions about these behind his
back. However, for anything code-related or technical related, try to do it
entirely yourself. If you can do something on your own, do not ask him to do it
for you. For example, if you are doing something with Supabase and think you
need him to login to his account, try first to see if you can do it via CLI or
computer use. The goal should be technical automation.

Refer to the study PDFs in the repo for technical info, Jeremy's emails with the Paller lab, or ask Jeremy. [Karen R. Konkoly et al 2024.pdf](<Karen R. Konkoly et al 2024.pdf>) used phones for TLR, [Mallela et al 2024.pdf](<Mallela et al 2024.pdf>) used apple watches.

Always practice context hygiene, especially when working on longer tasks. Use
subagents liberally.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks,
use judgment.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what is confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Do not improve adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it; do not delete it.

When your changes create orphans:

- Remove imports, variables, and functions that your changes made unused.
- Do not remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass."
- "Fix the bug" -> "Write a test that reproduces it, then make it pass."
- "Refactor X" -> "Ensure tests pass before and after."

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria such as
"make it work" require constant clarification.

These guidelines are working if there are fewer unnecessary changes in diffs,
fewer rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.

## Science/data guardrails

Do not improvise the TLR protocol.

Phone Mode follows Konkoly et al. 2024.
Watch Mode follows Mallela/Mallett 2024.
Carr et al. 2023 is the presleep TLR/lucid-mindset anchor.
Tan & Fan 2023 is evidence-context only: lucid-dream induction remains mixed
and should not be overclaimed.
Peters et al. is background only for expectation effects, dream journaling,
association training, and lucidity measures. Do not add EMS/GVS.

Do not:

- add research-control nights
- add no-cue nights
- add untrained-cue nights
- add sham/placebo language
- add EMS/GVS
- add galantamine or substance suggestions
- make therapeutic claims
- rename TLR to TMR
- upload dream journal text/audio by default
- create Supabase auth before upload consent
- treat Log Sleep Only as a research control
- put protocol constants inside UI components
