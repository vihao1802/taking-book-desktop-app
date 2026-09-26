# ADR-0005: Ambient sounds are bundled with the app and limited to CC0 / public domain

Status: accepted

## Context

The Focus controls offer Ambient sound: noise colors, nature recordings (rain, fire, forest, ocean) and instrumental styles (Lo-fi, Piano, Calm ambient). Noise colors and the Focus timer's chime are generated in code, so only the recordings need files. Sources were surveyed in `docs/research/ambient-sound-sources.md`.

The obvious free sources are not all free in the way a distributed app needs. Pixabay's licence forbids redistributing files "on a Standalone basis", and files inside an installer can be extracted as-is; its music also triggers YouTube Content ID claims. Kevin MacLeod / incompetech is CC-BY, requiring an exact credit line or a paid licence. Freesound, Wikimedia Commons, Musopen and Free Music Archive mix CC0 with CC-BY, BY-SA, NC and ND on a per-file basis, so a site being "free" says nothing about a given file.

## Decision

1. Every bundled recording is CC0 1.0 or public domain — never a licence that requires payment or credit, forbids commercial use, forbids modification (we trim and re-encode into loops), or requires share-alike.
2. Recordings ship inside the app rather than being downloaded on first use, so Ambient sound works offline from first launch, in keeping with the app being local-first.
3. A provenance manifest in the repo lists, for each bundled file, its source page, author, licence and download date. A test fails if a bundled sound file is missing from the manifest or lists a licence other than CC0 / public domain.
4. No credits are shown in the app; the manifest is the record of provenance.

## Consequences

- The installer grows by roughly 15–20 MB (Opus encoding at ~48–64 kbps for loops, ~96–128 kbps for music).
- The catalog is limited to what exists under CC0 / public domain; well-known CC-BY music is off the table without revisiting this decision.
- Adding a sound means recording its provenance, or the test suite goes red.
- Café ambience is deferred: CC0 café recordings can still contain copyrighted background music or intelligible speech, and need vetting by ear.

## Alternatives considered

- **Download sounds on first use.** Rejected: needs network and a cache, and a sound picked offline would fail — at odds with local-first.
- **Allow CC-BY with an in-app credits screen.** Rejected: widens the catalog but adds an attribution obligation to every release, and the user wants every sound free with no strings.
- **Pixabay.** Rejected: its standalone-redistribution clause is ambiguous for bundled apps and its music carries Content ID risk for users.
