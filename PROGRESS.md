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

## Phase 6: coins, item shop, challenges (done 2026-10-23)

Done:
- `shared/economy/`: coin table (elim 10, assist 4, placement 5/20/35/100, survival 1/min capped 15, offline pays 50% with a 500/day cap, daily login 25), seeded daily/featured shop rotation (00:00 UTC), 46 data-driven challenges (22 daily, 14 weekly on a Thursday 13:00 UTC reset, 10 lifetime milestones that unlock the challenge-only items).
- Sim counters (assists, headshots, chests, materials harvested, pieces built) per fighter, folded into progress on the server only.
- `server/economy.js`: online match payout and challenge progress inside the match-recording transaction (idempotent on the ledger), buying (one transaction, shelf check, ownership check, parallel clicks charge once), 1 reroll a day, daily login on first `/api/me` of the UTC day, offline results with plausibility checks, 60 s gap and the daily cap. Migration 002 adds reroll bookkeeping.
- Client: ITEM SHOP and CHALLENGES screens (guests see a sign-in note), toasts, end-of-match coin card (real payout when signed in online; estimate plus "make an account to keep these Coins" for guests).
- Tests: 98 pass (11 new, five of them against real Postgres). `npm test` now runs files one at a time because the DB tests share a schema.

Not done / to check:
- Offline matches pay coins but do not advance challenges (a client report cannot be trusted for that). Party codes are not built; they depend on a private-room flow in the matchmaker and land with the lobby rework in Phase 11.
- Challenge text/rewards are first-pass numbers; tune after real play.

## Phase 7: weapons and combat (done 2026-10-24)

Done:
- Four new guns, all data in `shared/config.js`: Tactical Shotgun (semi-auto), Burst Rifle (3-round bursts, gap 85 ms, cancelled by switching or reloading), Marksman Rifle, Revolver. Each has per-rarity damage/reload, falloff where it matters, recoil values, a code-built model, an icon, a reticle, an animation class and sounds (aliased onto the existing synth guns until Phase 11).
- Frag Grenade: a throwable consumable (arcs, bounces off the map, 2.2 s fuse, 5.5 m splash that also hurts builds and props). Projectiles (rockets and grenades) now reach clients as `projSpawn`/`projEnd` events, which also fixes rockets being invisible to online players.
- Camera recoil: weapon-specific view kick that decays; it is visual only and never changes where bullets go.
- Supply drops: at each storm phase from the second on, a balloon crate falls into the next circle (beam visible from afar), cannot be opened until it lands, then holds an Epic+ gun, ammo, shield potions, grenades and metal/brick. Synced to online clients (including late joiners).
- Drop item (H) and a hold-Tab inventory overlay (slots, ammo reserves, materials).
- Tests: 8 new (data completeness, loot rolls, burst timing and cancel, grenade lifecycle, supply drop rules, drop command).

Not done / to check:
- Bots do not throw grenades or use the new weapons smartly (they pick them up and shoot like any gun). Grenade bounces are simulated on the server only; clients draw a simple arc and snap to the blast point.
- Weapon feel (spread, damage, fire rates) is set from memory of similar games and unplaytested on real hardware. Expect a tuning pass.
- No weapon-specific hit sounds or shell ejection yet (Phase 11 audio).

## Phase 8: building feel (done 2026-10-24)

Audit result: most of this phase's list already existed from Phase 1 (turbo building by holding fire at 16 pieces a second, material auto-switch, 3x3 wall / 2x2 floor edit tiles with confirm-on-release, support graph with collapse, tumbling debris, per-material HP and build time).

Added:
- Grow-in pop: placed pieces rise from their base with an overshoot over 0.28 s, plus a dust puff. Late joiners skip it.
- Nothing in the sim changed, so the 106 tests are unaffected; offline and online smoke runs exercise placement, editing and destruction through the real client.

Not done (honest list):
- Edits are still not predicted online (placement is). On a 150 ms link an edit shows up a round trip late.
- No edit presets or double-tap shapes, no pre-fab auto-pyramid, no trap pieces. These need a design pass with real play to decide what is worth building.

## Phase 9: the bigger island (done 2026-10-24)

Done:
- The island is 840 m across (was 560): same 2 m terrain grid, 17 places instead of 12, scaled roads, four biomes (temperate, snow in the north, desert in the east, jungle in the south west) as soft weights so ground colour blends across the border. Five new places: Frostbite Lodge, Mine Mouth (snow), Dusty Mesa, Rusty Ranch (desert), Mossy Ruins (jungle). The lighthouse now finds the west coast itself.
- Biome-aware nature: snowy pines, cacti in the desert, darker jungle canopy, tinted rocks. Trees 720, rocks 190, cars 26, wild chests 44. Instancing pools sized up to match (trunks 1100, pines 1800, canopies 2000).
- Storm circles, bus route (38 s) and world bounds scaled to the new size. Minimap and full map paint the biomes and label all 17 places.
- Measured on this sandbox: 32-bot 5 minute match averages 0.21 ms per tick, worst 7.5 ms, 125 MB RSS (build 70 ms).
- Tests: 107 pass (new test checks 17 places, all four biomes, and that every place sits in its declared biome).

Not done / to check:
- No separate Resurgence island and no pre-game lobby island: Resurgence is still a rule on the same map. A second map needs the terrain module to become instantiable (it is a module-level singleton baked at import), which is a real refactor, so I did not fake it.
- New places use the existing building helpers, so they are less hand-crafted than the originals. Needs a visual pass on real hardware.
- On the bigger map 32 bots spread out; matches take longer to produce kills early. Tune bot drop spots and storm timing after real play.

## Next: Phase 10 (look and feel, performance presets)

Not started.

## Known bugs

None logged. Software-rendered headless runs at about 1 fps, so all performance numbers are untested on real hardware.
