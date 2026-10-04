# Firework Command (Bedrock add-on)

Type `/firework 64` and you get 64 firework rockets for elytra flight. Any number from 1 to 6400 works. Stacks go into your inventory and whatever doesn't fit drops at your feet.

Only operators can use it. Players without op don't see `/firework` when they type `/` in chat, and they can't run it. The world host is an operator by default. To give someone access, open the pause menu, pick the player and set them to Operator. Bedrock has no way to hide a command from the people who are allowed to run it, so you'll still see it in your own list.

## Install

1. Run `./build.sh` (or grab the prebuilt `FireworkCommand.mcaddon`).
2. Open the `.mcaddon` on the device running Minecraft. It imports itself.
3. World settings, Behavior Packs, activate Firework Command.
4. Leave cheats off and leave every Experiments toggle off. The pack doesn't need either.

Needs Minecraft Bedrock 1.21.90 or newer. It uses the stable Script API custom command system, so no beta APIs.

## Achievements: read this first

Minecraft Bedrock turns off achievements for any world that has a custom behavior pack active. That's a game rule enforced by Mojang, and no pack can opt out of it. Once the world is saved with the pack on, achievements stay off for that world even if you remove the pack later.

What this pack does to keep the damage as small as possible:

- The command has `cheatsRequired: false`, so you never need to turn cheats on.
- It only uses stable APIs, so no Experiments toggle is needed.

Best practice: make a copy of your world and add the pack to the copy, or use it in a separate world you don't care about achievements in.
