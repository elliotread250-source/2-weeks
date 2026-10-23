# Architecture

Status: Phase 1 done (sim split from renderer). Later phases below are still plans. Update this file at the end of every phase.

## Current state (end of Phase 1)

The simulation lives in `/shared` and runs headless in Node (a 6 minute 25-bot match simulates in about 2 seconds). The browser client wraps it in a `LocalHost` (fixed 30 Hz tick, render interpolation) and draws it. `server.js` is an ESM zero-dependency static server (`/public`, `/shared`, `/vendor/three/*`, `/health`). No build step. three.js 0.170.0 is served from node_modules, import map in `public/index.html`.

How the pieces talk:
1. The client samples input once per tick into a command struct (`shared/sim/controller.js`: held bitmask, edge-event bitmask, move axes, yaw/pitch, slot, piece, material step).
2. `Match.tick()` applies commands to humans, runs bot brains, then physics, combat, loot, storm, builds, world.
3. Everything the outside needs leaves as events (`match.takeEvents()`): sounds, particles, HUD messages, hits, build/loot/world changes. The client routes them in `client/game.js`. The sim never imports a renderer.
4. The world is generated from a seed (`MAP_SEED`) in `shared/sim/world.js` + `pois.js` + `decor.js`. Server and every client build identical data, so none of it crosses the network. Tests check byte-identical digests.

Known deviations from the master prompt, to fix later: bots drive their fighter directly instead of emitting command structs (they use the same combat and build rules); the sim runs on the main thread, not a Web Worker; `Fighter` ids come from a module counter (fine per process, must be per-room for the server).

Hosting: Railway project `arcade` (id f845a1d7-7352-4c4f-82c7-9beb054468a6), service `two-weeks`, production environment, source repo `elliotread250-source/2-weeks`. Live URL: https://two-weeks-production.up.railway.app. Deploys branch `claude/intelligent-heisenberg-y496j2` (commit 1325fdb). No env vars set. The same project already has a `Postgres` service (shared with the other arcade games), so Phase 3 should add a separate database inside it or a new Postgres service, not reuse the arcade tables.

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
