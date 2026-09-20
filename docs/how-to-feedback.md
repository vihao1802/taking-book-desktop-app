# How to give feedback after a feature ships

Personal notes: what to do, where, and with which command once you have used the app and have feedback.
This applies to every feature, for example the Notes feature (the spec is issue #2, the tickets are #3 to #12).

## General rules

- **Feedback always lives in GitHub Issues** of `vihao1802/taking-book-desktop-app`, handled with `gh`. Command details: `docs/agents/issue-tracker.md`.
- **One issue, one thing.** Bundling several things into one issue means `/implement` cannot fit it in a single context window.
- **Do not edit finished issues** (the spec or its tickets). They are history. Feedback is always a new issue, which may point to a related ticket ("related to #7").
- **Handle each piece of feedback in a fresh session** (`/clear`), not in a session that is already long.
- **If the feedback contradicts `CONTEXT.md` or an ADR**, do not change the code directly. Update the documents first with `/grill-with-docs`, so code and documents never drift apart.
- The triage labels used in this repo (see `docs/agents/triage-labels.md`): `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

## Choosing an approach by kind of feedback

| Kind of feedback | Example | What to do |
|---|---|---|
| Plain bug | "Clicking a note does not jump to its page" | Create an issue with reproduction steps, then `/triage`, then `/implement #number` |
| Hard bug | Only happens sometimes; sync loses a note | `/diagnosing-bugs` |
| Small tweak | Change a color, a label, or an order | Create a small issue, then `/implement #number` |
| Changing a decision already made | Wanting the sidebar to overlay instead of push the page; adding export | `/grill-with-docs`, then `/to-spec` and `/to-tickets` |
| New big idea | An entirely new feature | Restart the main flow from `/grill-with-docs` |
| Many pieces of feedback piled up | A week of use produced 10 observations | Create one issue each, then run `/triage` once over all of them |

The full command prefix is `/mattpocock-skills:<name>`; if you forget a name, use `/mattpocock-skills:ask-matt`.

## Step by step for each kind

### 1. Plain bug or small tweak

1. Create an issue (template below):
   ```
   gh issue create --title "..." --label needs-triage --body "..."
   ```
2. New session: `/triage` to classify it; an issue with enough information gets `ready-for-agent`, one that lacks information gets `needs-info`.
3. New session: `/implement #number`.
4. `/implement` drives TDD one slice at a time, runs `/code-review`, runs `npm run build`, `typecheck`, `lint` and `test`, and commits.

Note: `/triage` is only for issues someone else created, or raw feedback. Tickets produced by `/to-tickets` are already agent-ready and need no triage.

### 2. Hard bug

New session: `/diagnosing-bugs` with a short description. It refuses to guess a cause before it has **one command that reliably reproduces the bug**, and adds a regression test with the fix. If it concludes that "there is no good seam to pin the bug down with a test", it will suggest `/improve-codebase-architecture`.

### 3. Changing a decision or a new idea

1. New session: `/grill-with-docs` with a description of what you want.
2. If a question can only be answered by running something (looking at the UI, seeing behavior): `/handoff` out to a new session, `/prototype`, then `/handoff` the result back.
3. Once settled, `/to-spec` then `/to-tickets` (in the same context as step 1).
4. For each ticket: `/clear`, then `/implement #number`.

## Bug issue template

```
## What happens
Clicking a note card in the sidebar does not jump to its page.

## How to reproduce
1. Open book X in reflow mode.
2. Create a note on page 3, then go to page 20.
3. Open the Notes sidebar and click the note card.

## Expected
Jumps to page 3 and flashes the highlight.

## Actual
Nothing happens.

## Environment
Theme (light/dark/sepia), page mode or reflow mode, whether the Reader sidebar is open.

## Related
#7
```

## Before calling a feature done

- Review the whole set of changes once, against the fixed commit just before the first ticket:
  ```
  /mattpocock-skills:code-review since <commit>
  ```
  It checks Standards (per `AGENTS.md`) and Spec (per the issue). For Notes, the fixed point is `0c6e0b0`.
- Run the app yourself (`TB_DISABLE_GPU=1 npm start` when there is no GPU) and check:
  - the three themes: light, dark, sepia;
  - page mode and reflow mode (the reader has two separate render branches);
  - the Reader sidebar and the Notes sidebar open at the same time.
