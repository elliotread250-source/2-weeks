# Two Weeks

A third-person build-and-shoot battle royale that runs in the browser. The map is a Rebirth Island style island (Call of Duty: Warzone's small Resurgence map) dressed up in Fortnite's look: bright greens, sandy beaches, cartoon buildings, a Battle Bus and gliders.

You drop in with a pickaxe, 100 health and 100 shield against 24 bots. Farm materials, build, edit, loot rarity-coloured guns and outlast the storm.

## Run it

```bash
npm install
npm start
# open http://localhost:3000
```

No build step. `server.js` is a zero-dependency static server that also serves three.js from `node_modules`, so the game never relies on a CDN. `/health` returns `ok` for Railway's health check.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift | Move / sprint |
| Space | Jump, leave the bus, open the glider |
| Mouse | Look. LMB fire or place, RMB aim down sights |
| 1 | Pickaxe |
| 2-6 or wheel | Inventory slots |
| Q | Toggle build mode |
| Z X C V (or F1-F4) | Wall, floor, ramp, cone |
| RMB or T in build mode | Cycle wood / brick / metal |
| G | Edit the build you're looking at. G again confirms, RMB resets |
| E | Pick up, hold to open chests and ammo boxes |
| R | Reload |
| M | Full map |

## What's in it

**Map.** Twelve POIs laid out like Rebirth Island, renamed Fortnite style: Prison Peaks (the hilltop prison block with its walled yard and guard towers), Control Corner (Control Center), Bio Bluffs (Bioweapons Labs), Chem Cove (Chemical Engineering), Factory Flats (Factory/Industry), Hazy Harbor (Harbor, with docks and container stacks), Lazy Lanes (Living Quarters as a Pleasant Park style street), HQ Heights (Headquarters with a rooftop helipad), Decon Docks (Decon Zone tents), Salty Shore, Security Sands and Crane Corner (the unfinished Construction Site). There's a lighthouse on the west coast. Every building has walkable stairs, floors and roofs.

**Building.** Grid-snapped walls, floors, ramps and cones on a 5 m x 3.75 m grid (Fortnite's 512 x 384 unit tile). Each piece costs 10 materials. Health values come from the Fortnite wiki: walls go 90 to 150 (wood), 90 to 300 (brick), 110 to 500 (metal) over 4 s, 11.5 s and 24.5 s, so wood goes up fast and metal ends up tanky. Pieces need to touch the ground or another build, and anything left floating collapses when its support is destroyed. Standing on your ramp while you build places the next ramp at the next level, so ramp rushing works.

**Editing.** Walls edit on a 3x3 tile grid (doors, windows, arches, half walls), floors on 2x2, cones on 2x2 corners, and ramps rotate by dragging across their tiles in the direction you want them to rise.

**Harvesting.** Trees give wood, rocks give brick, cars and shipping containers give metal. Hit the blue weak point for double damage and double materials, same as Fortnite. The pickaxe also tears down builds (50 per swing) and does 20 to players.

**Weapons.** Common, Uncommon, Rare, Epic and Legendary rarities with Fortnite's colours and damage curves. Assault Rifle (30 to 36), Pump Shotgun, SMG, Pistol, Bolt-Action Sniper (scoped, Rare and up) and Rocket Launcher (Epic and up, wrecks builds). Headshot multipliers, bloom, ADS accuracy and shotgun falloff are all in. Ammo types: light, medium, heavy, shells, rockets.

**Healing.** Bandages (+15 up to 75), Med Kit (to 100), Small Shield Potions (+25 up to 50), Shield Potions (+50) and the Chug Jug.

**Loot.** Floor loot, gold chests, ammo boxes, and full loot explosions when someone is eliminated. Ammo and materials auto-pick up.

**Match flow.** Battle Bus over a random route, skydive (look down and hold W to dive), glider auto-deploys near the ground. Six storm phases. Storm damage skips your shield like it does in Fortnite. Resurgence, the Rebirth Island signature, keeps redeploying you for the first three circles; after that, deaths are final. Last one standing gets the Victory Royale.

**Bots.** They pick a POI off the bus, loot, farm mats, fight with range-appropriate weapons, throw up walls and ramps when shot, heal when safe, rotate from the storm, and ramp over things they get stuck on.

## Research notes

Numbers in `public/js/config.js` are based on:

- Fortnite build health and build times: wood/brick/metal walls 90-150 / 90-300 / 110-500, floors, ramps and roofs 84-140 / 93-280 / 101-460, build times 4 / 11.5 / 24.5 seconds ([GameRevolution](https://www.gamerevolution.com/?p=410337)).
- Fortnite rarity colours and Assault Rifle damage of 30 / 31 / 33 / 35 / 36 by rarity, Pump Shotgun scaling from 90 ([Dot Esports](https://dotesports.com/news/full-stats-of-all-fortnite-battle-royale-weapons), [Pocket Gamer](https://www.pocketgamer.com/articles/077032/r/)).
- Rebirth Island's drop locations and layout: Prison Block, Control Center, Bioweapons Labs, Chemical Engineering, Factory, Harbor, Construction Site, Shore, Security Area, Living Quarters, Headquarters and Decon Zone ([Call of Duty Wiki](https://callofduty.fandom.com/wiki/Rebirth_Island_(Warzone)), [GGRecon](https://www.ggrecon.com/guides/call-of-duty-warzone-rebirth-island-guide/), [Charlie Intel](https://www.charlieintel.com/call-of-duty-warzone/all-locations-on-rebirth-island-in-call-of-duty-warzone-73147/)).

## Project layout

```
server.js            static server + /health
railway.json         Railway build/deploy config
public/index.html    HUD, lobby, menus
public/css/style.css
public/js/
  config.js          every tunable number
  terrain.js         island heightmap, POI list, minimap painter
  world.js           buildings, props, harvestables, loot spots
  collision.js       spatial hash, raycasts, character movement
  building.js        build placement, edits, structural collapse
  character.js       player/bot model and inventory
  combat.js          guns, rockets, pickaxe, heals, damage
  loot.js            chests, floor loot, pickups
  bot.js             bot AI
  player.js          input, camera, build/edit/combat modes
  storm.js           storm circles
  hud.js, fx.js, audio.js
  game.js            match flow, bus, Resurgence, win condition
```
