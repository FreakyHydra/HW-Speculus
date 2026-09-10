# Speculus Changelog

Speculus uses a human-readable release version plus a 7-character Git build id shown in the terminal, for example `v0.2.0+5890c7b`.

## [0.4.1] - 2026-09-10

### Fixed
- The resizable Debug inspector is docked beside the terminal again. Dragging the divider now resizes both panels together instead of allowing the inspector to cover terminal content.
- The same docked behavior works whether the Package panel is visible or collapsed.

## [0.4.0] - 2026-09-10

### Added
- Display menu with Blue Moon, Green Phosphor, Amber, Violet, and Monochrome palettes.
- Independent Night, Day, and System brightness selection for every palette.
- Persistent per-browser phosphor color preference.

### Changed
- Debug now opens as a resizable overlay inspector and no longer compresses the transcript or composer.
- Replaced the horizontally scrolling diagnostic navigation with a compact 3-by-3 view grid.
- Shortened the visible Relationship diagnostic label to Relations while preserving its underlying data view.
- Moved display theme and CRT motion controls out of the package rail into the dedicated Display menu.

## [0.3.0] - 2026-09-10

### Added
- Terminal-first workstation mode with independently collapsible Package and Debug panels.
- Compact header view controls and an explicit Debug mode indicator.
- Progressive-disclosure sections for the package manifest and control deck.

### Changed
- The terminal now owns the available workspace whenever either side panel is closed.
- Debug tools are hidden by default for new sessions and remain available in a dedicated inspector.
- Package essentials remain visible while low-frequency metadata and display/model controls stay collapsed until needed.
- Reduced panel widths, header height, control padding, transcript spacing, diagnostic density, and composer-tool footprint.
- Diagnostics tabs now use a compact scrollable instrument strip instead of oversized wrapped button tiles.
- Reorganized raw transfer, buffer copy, and exit controls into a compact inspector action bank.

## [0.2.0] - 2026-09-10

### Added
- Project changelog and visible build/version identity in the terminal footer.
- Smart roleplay composer helpers for action, dialogue, and thought formatting.
- AI-assisted `FORMAT MY TEXT`, constrained to repair formatting without rewriting the draft.
- Per-session draft autosave and automatic recovery after refresh/navigation.
- Local `SAVE CHECKPOINT` / `RESTORE LAST` simulator checkpoints.
- Response calibration control: Concise, Normal, Long, and Adaptive.
- Per-turn context/token meter in the composer and Diagnostics panel.
- Knowledge-boundary diagnostics showing observed/available versus filtered information.
- Reroll comparison diagnostics retaining the replaced answer for inspection while keeping the reroll canonical.
- Regression coverage for non-character entity routing and response calibration.

### Changed
- Tab escape now jumps past the closing smart-pair marker and inserts one separator space when whitespace is not already present.
- Pasted curly double quotes are normalized to straight roleplay dialogue quotes.
- Provider failures are classified as authorization, timeout, context-size, rate-limit, network/bridge, empty-generation, or invalid-response faults instead of collapsing into one generic error.
- Non-character Orbis assets are routed through a neutral simulation narrator rather than being converted into characters. The compiled context explicitly preserves the primary entity type and forbids personifying places, items, factions, worlds, and other non-character records.
- Unknown information is explicitly required to remain unknown in compiled model context.
- Response calibration now affects both generation instructions and output token limits.

### Existing in this release line
- Diagnostics side-panel visibility control and resizable workstation panels.
- Exact compiled-context inspector with manifest data.
- Raw session import/export support.
