# Sky Kit Pro (Bedrock add-on)

Type `/sk 64` and you get 64 flight duration 3 firework rockets for elytra flight. Type `/er 64` and you get 64 XP bottles. Type `/ep 16` and you get 16 ender pearls. Any number from 1 to 6400 works for all three.

Hold a sword, pickaxe, armour piece or anything else enchantable and type `/bm`. It adds Unbreaking III and Mending. If the item already has a lower Unbreaking, it gets upgraded. Mending won't go on a bow that has Infinity, because the game doesn't allow that pair. Stacks go into your inventory and whatever doesn't fit drops at your feet.

Only operators can use them. Players without op don't see `/sk`, `/er`, `/ep` or `/bm` when they type `/` in chat, and they can't run them. The world host is an operator by default. To give someone access, open the pause menu, pick the player and set them to Operator. Bedrock has no way to hide a command from the people who are allowed to run it, so you'll still see them in your own list.

## How flight duration 3 works

The Script API can't set a rocket's flight duration, so the pack ships `structures/skypro/rocket3.mcstructure`, a structure holding one flight duration 3 rocket. The first time someone runs `/sk`, the pack places that structure (item only, no blocks), copies the rocket and deletes the item. Every rocket after that is a copy. `tools/make_structure.py` generates the structure file; `build.sh` runs it for you.

## Install

1. Run `./build.sh` (or grab the prebuilt `SkyKitPro.mcaddon`).
2. Open the `.mcaddon` on the device running Minecraft. It imports itself.
3. World settings, Behavior Packs, activate Sky Kit Pro.
4. Leave cheats off and leave every Experiments toggle off. The pack doesn't need either.

Needs Minecraft Bedrock 1.21.90 or newer. It uses the stable Script API custom command system, so no beta APIs.

## Achievements: read this first

Minecraft Bedrock turns off achievements for any world that has a custom behavior pack active. That's a game rule enforced by Mojang, and no pack can opt out of it. Once the world is saved with the pack on, achievements stay off for that world even if you remove the pack later.

What this pack does to keep the damage as small as possible:

- Every command has `cheatsRequired: false`, so you never need to turn cheats on.
- It only uses stable APIs, so no Experiments toggle is needed.

Best practice: make a copy of your world and add the pack to the copy, or use it in a separate world you don't care about achievements in.
