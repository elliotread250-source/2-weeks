# Two Weeks

A third-person build-and-shoot battle royale that runs in the browser. Drop from the Drop Bus onto an 840 m island with four biomes and 17 named places, farm materials, build and edit, loot rarity-coloured guns, and be the last one standing. Play offline against bots, or online in a shared room with a server-authoritative simulation.

Everything you see is generated in code: characters, outfits, pickaxes, gliders, icons, sounds and music. There are no art or audio files to download, and no third-party names or artwork.

Live: https://two-weeks-production.up.railway.app

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm test           # node:test suite (database tests need Postgres, see below)
```

No build step. `server.js` serves `/public`, the shared simulation at `/shared` and three.js from `node_modules` at `/vendor/three`, so the game never depends on a CDN.

Smoke tests (headless Chromium, software rendering, so slow but real):

```bash
node tools/smoke.mjs http://localhost:3000 /tmp/shot.png --deep   # scripted offline match through the real client
node tools/smoke-online.mjs                                        # two browsers against one server
node tools/smoke-locker.mjs                                        # locker, shop and challenge screens, then a match
node tools/smoke-quality.mjs http://localhost:3000 low epic        # each graphics preset
node tools/soak.mjs 32 10                                          # headless 32-bot, 10 minute match: tick cost and memory
```

Set `CHROMIUM_PATH` if Playwright cannot find a browser.

## Deploying (Railway)

Push to GitHub, open a pull request into the default branch, merge. Railway builds from the repo (`railway.json`, Railpack) and health-checks `/health`. Then check the deploy logs and the live URL.

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3000 | HTTP and WebSocket port (Railway sets it) |
| `DATABASE_URL` | none | Postgres. Without it the game works; accounts, coins and the shop show "Can't reach the server right now" |
| `SESSION_SECRET` | none | Signs session tokens. Set it, or sessions end on every restart |
| `NODE_ENV` | | `production` makes the session cookie `Secure` |
| `MAX_PLAYERS_PER_ROOM` | 32 | Humans plus bots per match |
| `LOBBY_SECONDS` | 60 | How long a lobby waits before bots fill it |
| `HUMAN_TARGET` | room capacity | Start at once when this many humans have joined |

The tick rate (30 Hz) is a shared constant, not an environment variable: the client predicts with the same number, so changing it on the server alone would break prediction.

`/health` answers `ok`. `/health/full` lists live rooms with average and worst tick time and the database state. Database tables live in the `twoweeks` schema, so the Postgres can be shared with other games.

Hobby plan sizing, measured with `node tools/loadtest.mjs 32 40` (the real server, 32 WebSocket clients sprinting and shooting, on a shared sandbox core): about 10% of one CPU core, 125 MB of RAM, 2.1 ms average tick (6% of the 33 ms budget, worst 18 ms) and 13 KB/s of downstream per player. A bots-only room costs less (`tools/soak.mjs`: 0.2 ms per tick). Those are sandbox numbers; Railway's shared vCPU will differ, so watch `/health/full`. Set a spending limit on the Railway project.

## Architecture in one paragraph

`shared/` is the whole game simulation with no rendering and no DOM; it runs in Node (server, tests) and in the browser (offline play, and client prediction online). `server/` runs one authoritative `Match` per room at 30 Hz, accepts binary commands over a WebSocket, sends delta snapshots at 20 Hz, and owns accounts, the coin ledger, the shop and challenges in Postgres. `public/js/` draws sim state (`render/`), turns input into commands and events into visuals and sound (`client/`), and runs the menus and HUD (`ui/`). Read `ARCHITECTURE.md` for the details and `PROGRESS.md` for what each phase did and did not finish.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Ctrl | Move / sprint / crouch |
| Space | Jump, leave the bus, open the glider |
| Mouse | Look. LMB fire, place or select tiles; RMB aim down sights |
| 1 to 6 or wheel | Pickaxe and inventory slots |
| Q, then Z X C V | Build mode, then wall, floor, ramp, cone |
| T or RMB in build mode | Cycle wood / brick / metal |
| F | Edit the build you look at; hold LMB over tiles and release to confirm |
| E | Pick up; hold to open chests |
| R | Reload |
| H / hold Tab | Drop the selected item / inventory |
| Hold B | Emote wheel: move the mouse, release |
| G | Swap camera shoulder |
| M | Full map |
| F3 | FPS, ping and draw-call overlay |

Controller (standard layout): left stick move, right stick look, RT fire, LT aim, A jump, B crouch, X interact and reload, Y build, LB/RB slots (or material in build mode), D-pad wall/floor/ramp/cone, L3 sprint, R3 edit, Back map. Click once in the game so the browser locks the pointer, then the pad works.

Every keyboard bind can be changed in Settings.

## What is in it

**The island.** 840 m across, 17 places over four biomes: Prison Peaks, Control Corner, Bio Bluffs, Chem Cove, Factory Flats, Hazy Harbor, Lazy Lanes, HQ Heights, Decon Docks, Salty Shore, Security Sands, Crane Corner (temperate); Frostbite Lodge and Mine Mouth (snow); Dusty Mesa and Rusty Ranch (desert); Mossy Ruins (jungle). A lighthouse on the west coast. Resurgence: you redeploy after dying until the third storm circle starts.

**Building.** Walls, floors, ramps and cones on a 5 m by 3.75 m grid, 10 materials each, wood/brick/metal with different health and build time. Pieces need support and collapse without it. Hold fire to build fast. Edits on a 3x3 (walls), 2x2 (floors, cones) grid.

**Weapons.** Assault Rifle, Burst Rifle, SMG, Pistol, Revolver, Pump Shotgun, Tactical Shotgun, Marksman Rifle, Bolt-Action Sniper, Rocket Launcher; Frag Grenades. Five rarities, headshots, falloff, bloom, recoil. Supply drops fall into the next circle when a storm phase begins.

**Cosmetics.** About 250 items: 68 outfits (with styles and recolours), back blings, pickaxes, gliders, contrails, weapon wraps, 25 emotes, banners, loading screens. The Locker previews them on a live 3D character.

**Coins.** Eliminations, assists, placement and survival pay Coins. The Item Shop rotates at 00:00 UTC. 46 challenges (daily, weekly, milestones). Offline matches pay half, with a daily cap.

**Graphics.** Auto, Low, Medium, High, Epic, plus dynamic resolution. Auto never picks Epic.

## Honest limits

The game is verified by 112 automated tests and headless-browser smoke runs, but the renderer has only been seen through software rendering. Performance on real GPUs, weapon balance, and bot behaviour on the bigger island are untested by a human. Edits are not predicted online (placement is). Bots do not use grenades. There is one map; Resurgence is a rule on it, not a separate island.
