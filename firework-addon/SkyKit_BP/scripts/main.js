import {
  system,
  world,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  ItemStack,
  Player,
} from "@minecraft/server";

const ROCKET = "minecraft:firework_rocket";
const XP_BOTTLE = "minecraft:experience_bottle";
const STRUCTURE = "skykit:rocket3";
const TEMPLATE_TAG = "skykit_template";
const STACK_SIZE = 64;
// 100 full stacks. Anything bigger just floods the floor with item entities and lags the world.
const MAX_AMOUNT = 6400;

// One flight duration 3 rocket. ItemStack can't set flight duration, so it comes from a structure file
// and every rocket handed out is a clone of it.
let template;

function getTemplate(player) {
  if (template) return template;

  const { x, y, z } = player.location;
  const origin = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
  try {
    // includeBlocks: false means only the item entity appears. No blocks in the world get touched.
    world.structureManager.place(STRUCTURE, player.dimension, origin, { includeBlocks: false, includeEntities: true });
  } catch (error) {
    console.warn(`Sky Kit: couldn't place ${STRUCTURE}: ${error}`);
    return undefined;
  }

  const spawned = player.dimension.getEntities({
    type: "minecraft:item",
    tags: [TEMPLATE_TAG],
    location: { x: origin.x + 0.5, y: origin.y, z: origin.z + 0.5 },
    maxDistance: 2,
  });
  for (const entity of spawned) {
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (!template && stack?.typeId === ROCKET) template = stack;
    entity.remove();
  }
  return template;
}

function makeRockets(count, player) {
  const base = getTemplate(player);
  if (!base) return new ItemStack(ROCKET, count);
  const stack = base.clone();
  stack.amount = count;
  return stack;
}

// Fills the inventory in full stacks. addItem returns whatever didn't fit, so a full inventory spills onto the ground.
function giveItems(player, amount, makeStack) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  let remaining = amount;
  let dropped = 0;

  while (remaining > 0) {
    const count = Math.min(remaining, STACK_SIZE);
    remaining -= count;

    const stack = makeStack(count);
    const leftover = inventory ? inventory.addItem(stack) : stack;
    if (leftover) {
      dropped += leftover.amount;
      player.dimension.spawnItem(leftover, player.location);
    }
  }
  return dropped;
}

function droppedNote(dropped) {
  return dropped > 0 ? `\n§e${dropped} didn't fit and were dropped at your feet` : "";
}

function giveRockets(player, amount) {
  const dropped = giveItems(player, amount, (count) => makeRockets(count, player));
  const label = amount === 1 ? "firework rocket" : "firework rockets";
  let message = `§aGave you ${amount} ${label}`;
  if (!template) message += `\n§cCouldn't load flight duration 3, so these are flight duration 1`;
  player.sendMessage(message + droppedNote(dropped));
}

function giveXpBottles(player, amount) {
  const dropped = giveItems(player, amount, (count) => new ItemStack(XP_BOTTLE, count));
  const label = amount === 1 ? "XP bottle" : "XP bottles";
  player.sendMessage(`§aGave you ${amount} ${label}` + droppedNote(dropped));
}

// Shared checks for every give command. Callbacks run in read-only mode, so the actual give waits for the next tick.
function runGive(origin, amount, commandName, give) {
  const player = origin.sourceEntity;
  if (!(player instanceof Player)) {
    return { status: CustomCommandStatus.Failure, message: `Only players can use /${commandName}` };
  }
  if (amount < 1 || amount > MAX_AMOUNT) {
    return { status: CustomCommandStatus.Failure, message: `Pick a number from 1 to ${MAX_AMOUNT}` };
  }
  system.run(() => give(player, amount));
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  // The game also registers the un-namespaced forms, so players can just type /sk and /er.
  // GameDirectors means operators only. Players without op can't run them, and they don't show up when they type "/".
  const register = (commandName, description, give) =>
    customCommandRegistry.registerCommand(
      {
        name: `skykit:${commandName}`,
        description,
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "amount" }],
      },
      (origin, amount) => runGive(origin, amount, commandName, give)
    );

  register("sk", "Give yourself flight duration 3 firework rockets", giveRockets);
  register("er", "Give yourself XP bottles", giveXpBottles);
});
