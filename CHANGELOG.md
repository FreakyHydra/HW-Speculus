# Speculus Changelog

Speculus uses a human-readable release version plus a 7-character Git build id shown in the terminal, for example `v0.2.0+211e216`.

## [0.2.0] - 2026-09-10

### Added
- Project changelog and visible build/version identity.
- Smart roleplay composer helpers for action, dialogue, and thought formatting.
- Context-aware formatting buttons and Tab escape for smart pairs.
- Diagnostics side-panel visibility control and resizable workstation panels.
- Raw session import/export support.

### Changed
- Tab escape now inserts one separator space after the closing smart-pair marker when whitespace is not already present.

### Planned for this release line
- Draft autosave and recovery.
- AI-assisted "Format My Text" that preserves wording.
- Hard entity typing and knowledge-boundary diagnostics.
- Context inspector and per-turn context meter.
- Reroll comparison and session checkpoints.
- More precise model-call fault reporting.
