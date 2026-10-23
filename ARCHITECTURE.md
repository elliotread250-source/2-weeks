# Architecture

Status: Phases 1 to 5 done (sim split from renderer; online netcode; accounts; skinned characters; cosmetics and locker). Later phases below are still plans. Update this file at the end of every phase.

## Current state (end of Phase 1)

The simulation lives in `/shared` and runs headless in Node (a 6 minute 25-bot match simulates in about 2 seconds). The browser client wraps it in a `LocalHost` (fixed 30 Hz tick, render interpolation) and draws it. `server.js` is an ESM zero-dependency static server (`/public`, `/shared`, `/vendor/three/*`, `/health`). No build step. three.js 0.170.0 is served from node_modules, import map in `public/index.html`.

How the pieces talk:
1. The client samples input once per tick into a command struct (`shared/sim/controller.js`: held bitmask, edge-event bitmask, move axes, yaw/pitch, slot, piece, material step).
2. `Match.tick()` applies commands to humans, runs bot brains, then physics, combat, loot, storm, builds, world.
3. Everything the outside needs leaves as events (`match.takeEvents()`): sounds, particles, HUD messages, hits, build/loot/world changes. The client routes them in `client/game.js`. The sim never imports a renderer.
4. The world is generated from a seed (`MAP_SEED`) in `shared/sim/world.js` + `pois.js` + `decor.js`. Server and every client build identical data, so none of it crosses the network. Tests check byte-identical digests.

Known deviations from the master prompt, to fix later: bots drive their fighter directly instead of emitting command structs (they use the same combat and build rules); the sim runs on the main thread, not a Web Worker; `Fighter` ids come from a module counter (fine per process, must be per-room for the server).

Hosting: Railway project `arcade` (id f845a1d7-7352-4c4f-82c7-9beb054468a6), service `two-weeks`, production environment, source repo `elliotread250-source/2-weeks`. Live URL: https://two-weeks-production.up.railway.app. Deploys branch `claude/intelligent-heisenberg-y496j2` (commit 1325fdb). No env vars set. The same project already has a `Postgres` service (shared with the other arcade games), so Phase 3 should add a separate database inside it or a new Postgres service, not reuse the arcade tables.

## Netcode (Phase 2)

Dependencies added: `ws` (WebSocket server; Node has no built-in one).

Server (`server/`): one `Room` per match runs `shared/sim/match.js` at 30 Hz. `Matchmaker` fills lobbies, then bots top up the room unless the average tick is past 70% of budget. `index.js` attaches to the HTTP server at `/ws`.

Per client:
1. Commands (binary, 25 bytes each, up to 8 per packet) are queued. The server grants one command per tick plus a burst allowance of 8, so a client cannot run faster than real time. Each command is one tick of that player's own time: it is applied once, in order, with movement physics, and a tick with no command leaves the player where they are. That is what makes replay exact.
2. Snapshots go out at 20 Hz, binary, delta-encoded: a fighter record is only sent if its quantised bytes changed since last sent to that client, with explicit removals. Interest radius 220 m (centred on the spectated player when dead). The owner's snapshot also carries a private block (inventory, ammo, materials, timers). Sizes: about 30 bytes per changed fighter.
3. Events are JSON frames (`shared/net/wire.js`), filtered by recipient or position. Build, loot and world changes go to everyone, in order (WebSocket is TCP, so this is the reliable ordered stream).
4. A joining or resuming client gets a welcome with the seed plus everything that changed since the seed (builds, live pickups, opened chests, destroyed map chunks).

Client (`public/js/client/nethost.js`): builds a replica `Match` from the seed. The local fighter is predicted: movement is replayed from the commands the server has not acknowledged, on top of each snapshot's state; corrections under 2.5 m ease out over about 100 ms, bigger ones snap. Others render 100 ms in the past from buffered samples, extrapolating at most 250 ms. Placed pieces appear at once as predicted pieces and are swapped for the server's copy, or fizzle after 1.2 s.

Lag compensation: commands carry the server tick the shooter was viewing; the server keeps one second of positions and rewinds hitboxes to that tick, never more than 200 ms back. Projectiles run on the server only.

Anti-cheat (server): damage, ammo, fire rate, build range and cost are all computed in the sim, so a client can only send inputs. Commands are sanitised (axes clamped, bit masks masked, angles finite), consumption is rate-limited as above, messages are token-bucketed, repeated violations kick, names are cleaned. Honest limit: a client can still use legitimate inputs perfectly (aim bots); nothing here detects that.

Deviations from the master prompt: commands go out at the tick rate (30 Hz) rather than 60 Hz, because the server consumes exactly one per tick; edits are not predicted, only placement.

Measured (this sandbox, one core): a 32-bot, 10 minute match averages 0.2 ms per tick (0.6% of the 33 ms budget, p99 1 ms, max 11 ms), 104 MB RSS. Prediction error with a 2% loss proxy at 50, 150 and 250 ms RTT: mean under 1 cm, max 2 cm, no snaps. Railway numbers still to measure.

## Characters and animation (Phase 4)

`render/rig.js` builds each character in code: 18 bones (hips, 3 spine, neck, head, arms, legs; Mixamo-compatible layout), about 40 rounded low-poly parts, vertex-coloured from the outfit palette and skinned (rigid parts plus smooth chains for the torso, knees and elbows), merged into one SkinnedMesh. Sockets sit on the hands, back and head. The face is a canvas decal with five expressions. About 18k vertices; characters beyond 40 m animate at half rate and past 150 m swap to a box stand-in.

`render/anims/*` author 127 clips as pose functions baked to AnimationClips at 30 fps: locomotion, air and glider, swim, eight weapon classes (idle, move, ADS, fire, reload, equip each, with a different reload motion per class), pickaxe with three alternating swings, build and edit, five healing animations, hit reactions, knocked, revive, 25 emotes. Convention: +X rotation means forward on every bone.

`render/animator.js` is the state machine. It reads only sim state (velocity, grounded, crouch, ADS, weapon, swing timer, heal, emote, flags carried in snapshots), so remote players animate with no extra data. Two layers on one mixer: legs and pelvis run locomotion, torso and arms run the activity. Fire recoil and hit reactions are additive overlays. Aim offset bends the spine and lifts the arms with camera pitch. Planted feet use two-bone IK onto the terrain for characters within 40 m. Skydiving tilts the body belly down.

New sim state for this: crouch (held bit 128), emote command (1..25, cancelled by movement/firing/building), short fx timers (fire, hit, place) and hit direction, all carried in snapshot records. Camera: shoulder swap (G), sprint FOV, shake on explosions and heavy hits with a settings slider.

`public/viewer.html` is a developer page that plays any clip on any default outfit; `tools/shots.mjs` renders poses to PNG. `render/glb.js` loads an authored Mixamo-skeleton .glb from `public/assets/characters/` and renames its bones to ours so every clip binds; rest-pose axis corrections (`RETARGET_FIX`) are the part still to do if a real asset is dropped in. Nothing depends on it.

Caveats: crouch, emotes and the animator are verified by unit tests and software-rendered screenshots, not on a GPU. Knocked/revive clips exist but the sim has no downed state yet (Duos/Squads).

## Cosmetics and the locker (Phase 5)

`shared/cosmetics/catalog.js` is the single source of truth: every item has an id, type, rarity, price, optional `spec` (the recipe the renderer builds from) and `shop`/`unlock` flags. `sanitizeLoadout(raw, owned)` is the only way a loadout gets accepted, on the client before use and on the server before storing or seating a player; anything not owned falls back to the default. `resolveOutfit` turns a loadout into the rig recipe (outfit + style + custom palette colours + back bling).

Client: `client/loadout.js` holds the store (owned set + loadout) and persists it (server for accounts, localStorage for guests). `ui/locker.js` is the screen; `render/stage.js` is the preview canvas with its own renderer; `render/icons3d.js` renders tile icons offscreen once and caches them in IndexedDB. `ui/wheel.js` is the in-game emote wheel, fed by `InputController` (mouse deltas go to the wheel, not the camera, while it is open). Emotes travel as a clip number in the command, so no cosmetic data crosses the network except the roster loadout sent in the welcome.

## Module map: where everything moves

| Today (`public/js/`) | Lines | three.js refs | Goes to |
| --- | --- | --- | --- |
| config.js | 138 | 0 | shared/config.js (as is) |
| util.js | 78 | 0 | shared/math/ (rng, noise, helpers) |
| terrain.js | 254 | 27 | split: heightmap, POIs, roads to shared/sim/world.js; mesh and minimap painting to public/js/render/terrain.js |
| world.js | 1082 | 54 | split: layout generation to shared/sim/world.js (data only); meshes to render/world.js. Needs splitting under 800 lines |
| decor.js | 364 | 16 | render/decor.js (cosmetic, no gameplay) |
| collision.js | 359 | 0 | shared/sim/collision.js (already pure) |
| building.js | 534 | 21 | split: grid, support graph, collapse to shared/sim/building.js; meshes and textures to render/builds.js |
| combat.js | 381 | 12 | shared/sim/combat.js. Replace THREE.Raycaster use with collision.js rays |
| loot.js | 309 | 36 | split: rolls, chests, pickups to shared/sim/loot.js; floor-item meshes to render/loot.js |
| bot.js | 368 | 18 | shared/sim/bot.js, emitting the same command struct as a human |
| storm.js | 100 | 6 | shared/sim/storm.js plus render/storm.js |
| game.js | 501 | 35 | shared/sim/match.js (flow) plus public/js/client/host.js (glue) |
| character.js | 447 | 26 | fighter state to shared/sim/fighter.js; meshes replaced in Phase 4 by render/character/ |
| player.js | 443 | 15 | public/js/client/input.js and camera.js |
| hud.js, icons.js | 377, 121 | 0 | public/js/ui/ |
| fx.js, textures.js | 210, 134 | 21, 2 | render/ |
| audio.js, binds.js, main.js | 146, 89, 143 | 0 | public/js/audio/, client/binds.js, client/main.js |

Trademark renames land in `shared/names.js` during Phase 1: Battle Bus to Drop Bus, Victory Royale to #1 VICTORY!, Chug Jug to Big Jug, currency is Coins.

## Target layout

As in the master prompt: `/shared` (pure JS, runs in Node and browser), `/server` (Node only: HTTP, `/ws`, rooms, accounts, shop, migrations), `/public` (client). Offline mode runs `shared/sim` locally behind the same interface the network client uses, so renderer and UI never know which transport they have.

Dependencies, each justified:
1. three (already in): rendering. Served from `/vendor/three` so CDN-blocking school networks work.
2. ws (Phase 2): WebSockets on the same `$PORT` as HTTP. Node has no built-in server.
3. pg (Phase 3): Postgres client. Plain SQL, numbered migrations, no ORM.

Everything else stays on Node built-ins (`node:test`, `crypto.scrypt`).

## Phase 1 plan

1. Add `shared/`, move config and util, add names.js.
2. Extract collision, building, combat, loot, storm, bot into pure sim with plain-data entities. Sim state is the source of truth, meshes read it.
3. Fixed 30 Hz tick, render interpolation, command struct per tick (move axes, yaw/pitch, button bitmask, slot, build piece, edit tiles, seq).
4. Local host drives the sim in the browser. Web Worker only if the boundary comes out clean, otherwise main thread.
5. `node:test` suite: build support and collapse, edit shapes, damage falloff and headshots, shield then health, storm skipping shield, material costs, loot weights, seed determinism.
6. Play a full offline match to the end before merging.

## Risks

1. The biggest one: gameplay code is welded to THREE objects (world.js, building.js, loot.js, game.js have the most). Phase 1 is a rewrite of the seams, not a file move. Budget it as the hardest phase after the character rig.
2. Determinism: terrain noise and map generation must give byte-identical output in Node and browsers. Float math is fine on the same engine family (V8) but test it. Avoid Math.sin/cos in anything that must match exactly if a mismatch shows up; use a lookup table.
3. Server cost on Railway Hobby: 32-player rooms at 30 Hz with bots. Measure before raising capacity. No rooms means no ticking.
4. Building count: base-game builds are heavy for snapshots. Separate reliable build event stream, not snapshots.
5. Asset scope: Phase 4 and 5 (rig, 25 emotes, 200+ cosmetics) generated in code is a huge volume. Data-driven recipes, not hand-built meshes.
6. Offline coin earnings can be faked by a determined cheater. Server validates plausibility and caps at 500 coins a day. That is the mitigation, not a guarantee.
7. Shared Postgres in the `arcade` project: use a dedicated schema or database so game tables never collide with other games.
8. Branch mess: default branch is a `claude/...` branch and the repo history has unrelated Minecraft add-on commits. Fixed by creating `main` (needs your go-ahead).
