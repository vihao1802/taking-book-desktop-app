# ADR-0006: Custom sounds are the reader's own files, kept on this device

Status: accepted

## Context

ADR-0005 bundles only CC0 / public domain recordings, so the catalog is limited to what the project can legally redistribute. Readers want their own music or ambience in the Ambient sound list. Those files are not ours to redistribute and cannot be vetted for licence.

## Decision

1. A reader can add a Custom sound from an audio file of their own, managed in Settings and listed after the bundled sounds in Focus controls.
2. The CC0 / public domain rule and the provenance manifest from ADR-0005 apply to bundled sounds only. The reader is responsible for the licence of their own files, which never leave their device, so the project redistributes nothing.
3. The app copies the file into its data folder and identifies it by content hash rather than path, so it keeps playing if the original moves or is deleted. Adding the same content twice reuses the existing Custom sound.
4. Custom sounds are device-local: not synced through the cloud drive, like Reading sessions. Audio files are large, and syncing would need size, quota and conflict rules.
5. One file loops as a single Ambient sound. Files that cannot be decoded, or that are over 50 MB, are rejected with a clear message.
6. Desktop only for now. The validation and catalog-merging rules go in `/packages/core` so mobile can reuse them.

## Consequences

- The Ambient sound catalog is no longer a static list in core; it is the bundled sounds plus this device's Custom sounds, and a remembered choice pointing at a deleted Custom sound falls back to none.
- Custom sounds add nothing to the installer size but use app data space.
- Existing bundled-sound tests and the provenance test are unchanged.

## Alternatives considered

- **Reference the original file path.** Rejected: breaks when the file moves, against the hash-not-path rule.
- **Sync Custom sounds across devices.** Rejected for now: large files, plus licence uncertainty about uploading them to a cloud drive.
- **Playlists of several files.** Rejected for now: one looping file covers the need; instrumental sets stay bundled.
