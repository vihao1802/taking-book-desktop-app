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

## Git & Commits

- One logical change per commit; commit messages describe intent (`Add last-read-position tracking by file hash`), not mechanics (`update files`).
- No committing generated files, `.env`, or local SQLite `.db` files — these go in `.gitignore`.

## General

- Favor readability over cleverness — this is a small/solo-maintained codebase; optimize for "understandable in six months," not "fewest lines."
- If a rule in this file conflicts with a specific instruction given during a task, the explicit instruction wins — but flag the conflict rather than silently picking one.
