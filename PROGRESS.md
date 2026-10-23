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

## Phase 2: online multiplayer (done 2026-10-23)

Done:
- `server/` (rooms, matchmaker, rate limits), `shared/net/` (binary protocol, wire events), `public/js/client/nethost.js` (replica match, prediction, reconcile, interpolation, predicted building).
- PLAY ONLINE in the lobby with a name box and queue status. Sessions resume for 30 seconds. `/health/full` reports rooms and tick times.
- Lag compensation (server rewinds up to 200 ms), command budget against speed hacks, sanitising, kicks.
- Tools: `tools/netsim.mjs` (latency, jitter, loss proxy), `tools/soak.mjs`, `tools/smoke-online.mjs`.
- Tests: 43 total. Protocol round trips, real WebSocket rooms, flood kick, resume, speed-hack bound, lag compensation, deterministic reconcile, and the real client against the real server through the lossy proxy at 50/150/250 ms.

Not done / to check:
- Not yet exercised on Railway (the sandbox cannot reach railway.app). First thing to do next session: open the live URL in two tabs and press PLAY ONLINE.
- Edits are not predicted (placement is). Spectating follows the killer but has no UI to cycle yet.
- A room starts with whoever is in the lobby; nobody can join a match in progress except by resuming.
- Party codes are Phase 6 or later.

## Phase 3: accounts and the database (done 2026-10-23)

Done:
- `server/db.js` (pg pool, numbered SQL migrations under an advisory lock, never throws, retries every 15 s), `server/migrations/001_init.sql` (users, sessions, wallets, coin_ledger, owned_items, loadouts, challenge_progress, matches, match_players, shop_rotations, stats), all in the `twoweeks` schema so the shared Railway Postgres is not polluted.
- `server/accounts.js`: username + 6 to 12 digit PIN, scrypt with a per-user salt, HMAC-hashed session tokens (30 days), lockout after 8 bad PINs for 15 minutes, identical error for unknown user and wrong PIN. Coin ledger: every award or purchase is one transaction, idempotent on (user, reason, ref), wallet always equals the ledger (tested under concurrency and triple-click purchases).
- `server/api.js`: `/api/register|login|logout|me`, httpOnly SameSite=Lax cookie (Secure over https), same-origin check, body limit, per-IP rate limits, 503 "Can't reach the server right now" when the DB is down.
- `server/names-filter.js`: shape, slur filter that survives leetspeak, reserved staff words.
- Online matches save results and career stats for signed-in players. WebSocket joins use the account name when the cookie is present.
- Lobby account bar and sign-in/create dialog. Guests still play everything.
- 60 tests pass (17 new, run against a real Postgres; skipped automatically without one).

Not done / to check:
- Not yet verified on Railway. Env vars set: DATABASE_URL (reference to the shared Postgres), SESSION_SECRET, NODE_ENV.
- The end-of-match "make an account to keep your coins" prompt arrives with coins in Phase 6.
- No password-upgrade path yet (brief calls it optional).

## Phase 4: characters, rig and animation (done 2026-10-23)

Done:
- Skinned 18-bone characters built in code (rig.js), 127 baked clips (anims/), animator state machine with upper/lower layers, additive recoil and hit reactions, aim offset, foot IK, skydive tilt, LOD, canvas faces with expressions, voxel elimination effect.
- Sim: crouch, emotes (25), hit/fire/place timers, shoulder swap. Protocol records carry the animation flags.
- Camera shake, sprint FOV, shoulder swap. Bind keys: crouch Ctrl, emote B (cycles through all 25 until the locker wheel exists), swap shoulder G.
- Viewer page and screenshot tool; glb retarget scaffolding.
- Tests: 72 total (clips, loops, bones, rig weights, state machine, IK, flags).

Not done / to check:
- Knocked/DBNO clips exist; the sim has no downed state yet (Duos and Squads, later).
- Visual polish was judged from software renders only. Gun models are still the old boxes (Phase 7).
- 18k vertices per character is on the heavy side; revisit with the quality presets in Phase 10.

## Phase 5: cosmetics, locker, skin customisation (done 2026-10-23)

Done:
- Catalog in `shared/cosmetics/` (68 outfits in 12 archetypes with styles and palette recolours, 31 back blings, 25 pickaxes, 20 gliders, 12 contrails, 20 weapon wraps, 25 emotes, 30 banners, 10 loading screens). Everything is drawn in code from small recipes; prices by rarity; some Rare+ items are challenge-only.
- `sanitizeLoadout` checks ownership on both sides: signed-in loadouts live in Postgres (`POST /api/loadout`), guests keep free items in localStorage. The server uses the account loadout when it seats you in a match; bots get random loadouts.
- Renderers: rig back blings, hair and outfit variants, pickaxe and glider meshes, weapon wraps, contrails, neon glow. Offscreen icon renderer with an IndexedDB cache.
- Locker screen (LOCKER button in the lobby): slots, live 3D preview (drag to spin, scroll to zoom, hover to try an item or play an emote), rarity/owned/search filters, styles and colour swatches.
- In-game emote wheel: hold B, move the mouse, release; a quick tap plays slot 1.
- Tests: 87 pass. `tools/smoke-locker.mjs` drives the locker through real Chromium.

Not done / to check:
- Items you do not own cannot be bought yet (shop is Phase 6). Banners and loading screens are equippable and shown as icons only; they appear in the end-of-match card in Phase 11.
- All visuals judged from software renders. The held pickaxe pose in the locker preview is rough.

## Next: Phase 6 (coins, item shop, challenges)

Not started.

## Known bugs

None logged. Software-rendered headless runs at about 1 fps, so all performance numbers are untested on real hardware.
