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
const STRUCTURE = "skrockets:rocket3";
const TEMPLATE_TAG = "skrockets_template";
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
    console.warn(`SK Rockets: couldn't place ${STRUCTURE}: ${error}`);
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

function giveRockets(player, amount) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  let remaining = amount;
  let dropped = 0;

  while (remaining > 0) {
    const count = Math.min(remaining, STACK_SIZE);
    remaining -= count;

    // addItem returns whatever didn't fit, so a full inventory spills onto the ground.
    const rockets = makeRockets(count, player);
    const leftover = inventory ? inventory.addItem(rockets) : rockets;
    if (leftover) {
      dropped += leftover.amount;
      player.dimension.spawnItem(leftover, player.location);
    }
  }

  const label = amount === 1 ? "firework rocket" : "firework rockets";
  let message = `§aGave you ${amount} ${label}`;
  if (!template) message += `\n§cCouldn't load flight duration 3, so these are flight duration 1`;
  if (dropped > 0) message += `\n§e${dropped} didn't fit and were dropped at your feet`;
  player.sendMessage(message);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  // The game also registers the un-namespaced form, so players can just type /sk.
  // GameDirectors means operators only. Players without op can't run it, and it doesn't show up when they type "/".
  customCommandRegistry.registerCommand(
    {
      name: "skrockets:sk",
      description: "Give yourself flight duration 3 firework rockets",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "amount" }],
    },
    (origin, amount) => {
      const player = origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Only players can use /sk" };
      }
      if (amount < 1 || amount > MAX_AMOUNT) {
        return { status: CustomCommandStatus.Failure, message: `Pick a number from 1 to ${MAX_AMOUNT}` };
      }

      // Command callbacks run in read-only mode, so the inventory change waits for the next tick.
      system.run(() => giveRockets(player, amount));
      return { status: CustomCommandStatus.Success };
    }
  );
});
