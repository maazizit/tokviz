# Changelog

All notable changes to TokViz are documented here.

## [0.2.0] - 2026-06-11

### Added

- Smart shell compressors per command type (`git diff`, `docker logs`, `kubectl`, `rg`, etc.)
- Universal noise stripping for repetitive shell output
- `tokviz bench` — benchmark suite with fixtures (~81% savings on real samples)
- Fixture corpus under `packages/core/fixtures/shell/`

### Changed

- `tokviz gain` — savings percent aligned to one decimal (matches `stats` / `report`)
- Shell compression pipeline refactored (`compressors.ts`, `noise.ts`)

## [0.1.0] - 2026-06-05

### Added

- TokViz MVP: `init`, `stats`, `gain`, `report`, `compare`, `doctor`
- Hook install for Cursor, Copilot, Gemini
- Local event store at `~/.tokviz/events.json`
