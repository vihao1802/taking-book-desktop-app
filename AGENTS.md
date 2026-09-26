# AGENTS.md — Coding Rules for This Project

This file defines conventions any coding agent (or contributor) must follow when working in this repo. The project is a monorepo: shared core logic + Electron desktop app + React Native mobile app, backed by SQLite and cloud-drive sync.

## Project Structure Rules

- `/packages/core` contains **only** platform-agnostic logic: data models, SQLite query functions, sync/conflict logic, business rules, pure utility functions. No `import` of Electron, `react-dom`, or `react-native` is allowed here — if a function needs a platform API, it takes that API as a parameter/interface (dependency injection), not a direct import.
- `/packages/desktop` and `/packages/mobile` contain **only** UI and platform glue. They import from `/packages/core`, never the other way around, and never from each other.
- Do not duplicate a function that already exists in `/core` into a platform package "for convenience." If it needs platform-specific behavior, split it into a shared interface + two platform implementations.

## TypeScript Rules

- Strict mode on (`strict: true`) across all packages. No `any` — use `unknown` and narrow, or define a proper type.
- Every exported function has an explicit return type; don't rely on inference for public APIs.
- Prefer `interface` for object shapes that might be extended (e.g. `FileRecord`), `type` for unions/aliases.
- No implicit `null`/`undefined` — model optionality explicitly (`value: string | null`, not just leaving it off and hoping).

## Naming & Structure

- Files: `kebab-case.ts`. Components: `PascalCase.tsx`. Hooks: `useCamelCase.ts`.
- One exported component/class per file where practical; file name matches the export.
- Function names are verbs (`getLastReadPosition`, `syncLibrary`), not vague (`handleData`, `process`).
- No abbreviations that aren't obvious (`btn` no, `id` yes, `cfg` no).

## Functions & Components

- Keep functions under ~40 lines; if it's doing "and" (fetch and parse and save), split it.
- No function with more than 3-4 parameters — pass an options object instead.
- Components stay presentational where possible; data-fetching and business logic live in hooks or `/core`, not inline in JSX-heavy files.
- No business logic inside UI event handlers beyond calling a named function — `onClick={() => syncLibrary()}`, not `onClick={() => { /* 20 lines of logic */ }}`.

## State & Data

- SQLite access goes through a single data-access layer in `/core` (e.g. `filesRepository.ts`, `notesRepository.ts`) — no raw SQL scattered across UI code.
- Files/records identified by content hash, not file path — never assume path stability.
- All async data operations return a typed `Result`-style shape (data or error), not thrown strings — makes error handling consistent across desktop/mobile.

## Comments & Documentation

- Comments explain **why**, not what — don't narrate obvious code.
- All comments in English, regardless of any other language used elsewhere in the project.
- Every non-trivial exported function in `/core` gets a short doc comment describing intent, params, and return.
- No commented-out dead code committed — delete it; git history keeps it.

## Error Handling

- Never swallow errors silently (`catch {}`) — log or surface them.
- User-facing errors (e.g. sync conflict, file not found) get a clear message; internal errors get logged with context (which file, which operation).
- Sync/network operations must handle offline/failure gracefully — this app is local-first, so a failed sync should never block reading or corrupt local state.

## Styling

- No inline magic numbers/colors in components — use theme tokens (light/dark/sepia) defined centrally.
- Reader UI stays minimal by rule: any new control added to the reading view needs explicit justification in the PR/commit description for why it can't live in settings or the library view instead.

## Testing

- Every function in `/core` (data access, sync logic, position tracking) has a unit test — this is the shared logic both platforms depend on, so it's the highest-value place to catch bugs.
- UI components get tests for behavior (renders, handles tap/click), not implementation detail (internal state shape).

## Development & Verification

- npm workspaces at the repo root. All commands run from the root; the desktop app is run from `packages/desktop`.
- `@taking-book/core` is consumed by platforms as a **built** package (it must be `npm run build`-ed before platform typecheck/start). The desktop `start`/`package`/`make` scripts build core first automatically.
- Verification commands (from repo root): `npm run build` → `npm run typecheck` → `npm run lint` → `npm test`. Run all of these before finishing a task.
- Vitest lives in `/core`; platform packages have no test runner unless one is added explicitly.
- Environment quirks:
  - Containers/VMs with no GPU: run the desktop app as `TB_DISABLE_GPU=1 npm start`.
  - Forge's system check trips on this shell's `npm_config_user_agent=npm/undefined`; `~/.skip-forge-system-check` is the workaround — do not delete it.
- UI check: a change under `packages/desktop/src/renderer` is verified in the running app by following `docs/agents/ui-check.md` (Claude Code: the `ui-check` skill) before finishing the task and in every code review of it. It drives the real app from a throwaway profile, so it never touches the user's library, with the window pinned at the top-left of the screen.
- Smoke tests: end-to-end verification in this environment is done by temporarily instrumenting `packages/desktop/src/main.ts` with a `TB_SMOKE_EXIT_MS` hook that exercises IPC/core and then exits. The hook is removed before committing; never leave it in.

## Auto-Approved Commands

- The permission rules in `opencode.json` auto-approve a fixed set of routine commands (cat, grep, ls, find, awk, sed, node/python one-liners, `npm run build|typecheck|lint|test`, `npx vitest`, `git status|log|diff|add|commit|show`, `node scripts/ui-check/*`, and `rm -f`/`rm -rf` under `/tmp`). You still may run them freely; they are not destructive and were repeatedly authorized in prior sessions.
- **Alert, don't ask:** before running any command covered by those auto-approve rules, prefix a one-line alert with `***` (e.g. `*** running npm run typecheck`) so the user can see it happening, then proceed without waiting for approval. Do not open a permission question for these.
- Still ask for anything NOT in the allow list (e.g. `sudo`, `rm -rf` outside `/tmp`, `git push`, installing random binaries) — those keep prompting deliberately.

## Git & Commits

- One logical change per commit; commit messages describe intent (`Add last-read-position tracking by file hash`), not mechanics (`update files`).
- No committing generated files, `.env`, or local SQLite `.db` files — these go in `.gitignore`.
- **Commit after every major change.** Whenever a task introduces a completed, working unit of work (a new feature, a fixed bug, a refactor, a config change, etc.), commit it immediately so we always have a clean rollback point. Do this automatically at the end of the task, without being asked. Verify with `git status` that the work was actually committed; never leave major work sitting uncommitted.
- Do not commit broken/intermediate states — commit at natural checkpoints where the code builds and tests pass, or commit partial work with a message clearly marking it as WIP if a checkpoint is genuinely unreachable.

## General

- Favor readability over cleverness — this is a small/solo-maintained codebase; optimize for "understandable in six months," not "fewest lines."
- If a rule in this file conflicts with a specific instruction given during a task, the explicit instruction wins — but flag the conflict rather than silently picking one.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on vihao1802/taking-book-desktop-app, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: the five canonical role names used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Interview questions

When a skill interviews the user (`/grill-with-docs`, `/grill-me`, `/grilling`, `/triage`, or any round of design questions), ask through the agent's built-in structured question tool (Claude Code: `AskUserQuestion`) instead of printing a numbered list the user has to answer by typing question numbers. The user should be able to pick an option with the arrow keys, or choose the tool's free-text "Other" entry to type their own answer.

- Keep the skill's method: work in rounds, ask the whole current frontier, and give a recommended answer for every question. The recommended answer is the first option, labelled "(Recommended)".
- Put longer context (facts found in the code, findings the user must see first) in a normal message before the question, so the question text stays short.
- If the tool limits how many questions fit in one call (Claude Code: 4 questions, 2 to 4 options each), send a round as consecutive calls.
- Fall back to a numbered text list only when the agent has no such tool.
