# ADR-0003: Annotations get a globally stable identity

Status: accepted

## Context

Annotations (highlights and the Notes attached to them) were identified by a
local `INTEGER PRIMARY KEY AUTOINCREMENT` id, and the sync manifest matched an
annotation across devices by that same number.

Two devices that are in sync and then each create an annotation while offline
both hand out the next free integer. On the next sync the two different
annotations look like one record, last-write-wins keeps one of them, and the
other is lost silently. That was tolerable for a colored highlight; it is not
for a Note, which is text the reader wrote.

The manifest also cannot simply be versioned up to fix this. `parseManifest`
treats any version other than the current one as an empty remote, and the
following sync then overwrites `manifest.json` with the older format holding
only that device's data. Any device still running an older build would
therefore clobber a `version: 2` manifest.

## Decision

1. Every annotation has a `uid`, generated once on the device that creates it
   and never changed. Sync matches annotations by `uid`. The local integer id
   stays as the local row key used by the UI and IPC layer; it no longer means
   anything across devices.
2. The manifest stays at `version: 1`. `uid` is an additive optional field on
   an annotation record, and the numeric `id` keeps being written so older
   builds still validate the record.
3. An annotation that has no `uid` — a row from before this change, or a record
   read from a manifest written by an older build — is given a deterministic
   one: `sha256(fileHash + ':' + id)`. Two devices that upgrade independently
   therefore derive the same `uid` for the same old annotation and converge
   instead of duplicating it.
4. Collisions that already happened before the upgrade are not repaired; the
   information needed to separate them is gone.
5. Conflict resolution is unchanged: last-write-wins per annotation, where a
   newer edit beats an older delete and a newer delete beats an older edit.

## Consequences

- While any device still runs an older build, that build may collide on ids and
  drop `uid` when it rewrites the manifest. New builds heal this because every
  `uid`-less record gets its deterministic `uid` again on the next read.
- `packages/core` has no platform randomness, so the `uid` generator is passed
  in by the caller rather than imported.
- The annotations table needs a `uid` column with a unique index per book and a
  one-off backfill of existing rows.

## Alternatives considered

- **Bump the manifest to `version: 2`.** Rejected: older builds treat it as an
  empty remote and overwrite it (see Context).
- **Random `uid` for pre-existing annotations.** Rejected: each upgraded device
  would mint a different `uid` for the same old annotation and sync would then
  duplicate every one of them.
- **Per-field or conflict-copy merging.** Rejected as disproportionate: editing
  the same Note on two offline devices is rare for a single reader, and the
  library records already use per-record last-write-wins.
