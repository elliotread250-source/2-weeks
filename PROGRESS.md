# Progress

Resume a session with: "continue from PROGRESS.md". Read this and ARCHITECTURE.md first.

## Phase 0: Recon (done 2026-10-23)

Findings:
- Repo branches: `claude/intelligent-heisenberg-y496j2` (default, newest game, commit 1325fdb), `claude/new-session-2ua673` (same commit, this working branch). The `ecstatic-archimedes` and `relaxed-tesla` branches named in the brief are not visible from this session's scope. No `main` exists. History shows no Minecraft commits on the visible branches.
- Railway: project `arcade`, service `two-weeks`, auto-deploys the default branch. Live at https://two-weeks-production.up.railway.app, last deploy SUCCESS 2026-10-07. Zero env vars. Postgres service already exists in this project.
- The blackjack repo branch was not touched. Arcade homepage link to be checked at the end.

Waiting on the user:
1. Create `main` from `claude/intelligent-heisenberg-y496j2`, point Railway at it, make it the default? Recommended yes. Not done.
2. Railway spend limit status: could not read it through the MCP. Please confirm one is set on the project.

## Phase 1: split simulation from renderer (done 2026-10-23)

Done:
- `shared/` holds config, names, math (Vec3, seeded Rng), terrain, collision, world generation, building, fighters, loot, combat, bots, storm, match and the command applier. No THREE imports.
- Client rebuilt around `LocalHost`: render views (`render/world|builds|loot|character|storm`), `client/input|camera|game|host`, events instead of direct calls.
- Fixed 30 Hz tick with interpolation. Look angles apply per frame so aiming feels instant.
- Trademark renames in `shared/names.js`: Drop Bus, #1 VICTORY!, Big Jug, bot names replaced with invented ones.
- 27 `node:test` tests: world determinism, building health/support/collapse/edits, shield-then-health, storm skips shield, headshots, falloff, loot weights, full seeded match determinism.
- `tools/smoke.mjs`: headless Chromium loads the page, starts a match, and `--deep` scripts jump, build, edit, shoot, pickaxe and bot fights through the real client. Zero console errors.

Not done / deferred:
- Bots do not emit command structs yet (they share combat/build rules but write fighter state directly).
- No Web Worker for the sim.
- Build "edit" is exercised only lightly in the deep smoke test; do a hands-on pass once a real GPU browser is available.

## Next: Phase 2 (online netcode)

Not started. Needs `ws`, `server/` rooms, binary protocol, prediction, interpolation, lag compensation, anti-cheat, netsim and soak tests.

## Known bugs

None logged. Software-rendered headless runs at about 1 fps, so all performance numbers are untested on real hardware.
