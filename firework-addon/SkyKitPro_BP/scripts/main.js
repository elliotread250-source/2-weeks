import {
  system,
  world,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EnchantmentType,
  ItemStack,
  Player,
} from "@minecraft/server";

const ROCKET = "minecraft:firework_rocket";
const XP_BOTTLE = "minecraft:experience_bottle";
const ENDER_PEARL = "minecraft:ender_pearl";
const BOOK_ENCHANTS = [
  { id: "unbreaking", name: "Unbreaking III", level: 3 },
  { id: "mending", name: "Mending", level: 1 },
];
const STRUCTURE = "skypro:rocket3";
const TEMPLATE_TAG = "skypro_template";
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
    console.warn(`Sky Kit Pro: couldn't place ${STRUCTURE}: ${error}`);
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

// Fills the inventory in full stacks (64 for most things, 16 for ender pearls). addItem returns whatever didn't fit, so a full inventory spills onto the ground.
function giveItems(player, amount, makeStack) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  let remaining = amount;
  let dropped = 0;
  const stackSize = makeStack(1).maxAmount;

  while (remaining > 0) {
    const count = Math.min(remaining, stackSize);
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

function giveEnderPearls(player, amount) {
  const dropped = giveItems(player, amount, (count) => new ItemStack(ENDER_PEARL, count));
  const label = amount === 1 ? "ender pearl" : "ender pearls";
  player.sendMessage(`§aGave you ${amount} ${label}` + droppedNote(dropped));
}

function enchantHeldItem(player) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const item = inventory?.getItem(player.selectedSlotIndex);
  if (!item) {
    player.sendMessage("§cHold the item you want to enchant");
    return;
  }

  const enchantable = item.getComponent("minecraft:enchantable");
  if (!enchantable) {
    player.sendMessage("§cThat item can't be enchanted");
    return;
  }

  const added = [];
  const skipped = [];
  for (const { id, name, level } of BOOK_ENCHANTS) {
    const type = new EnchantmentType(id);
    // Swap out a lower level (say Unbreaking I) instead of failing on the duplicate.
    const existing = enchantable.getEnchantment(type);
    if (existing) enchantable.removeEnchantment(type);

    const enchantment = { type, level };
    if (enchantable.canAddEnchantment(enchantment)) {
      enchantable.addEnchantment(enchantment);
      added.push(name);
    } else {
      if (existing) enchantable.addEnchantment(existing);
      skipped.push(name);
    }
  }

  // getItem hands back a copy, so the enchanted version has to go back into the slot.
  inventory.setItem(player.selectedSlotIndex, item);

  let message = added.length ? `§aAdded ${added.join(" and ")}` : "";
  // Mending can't go on a bow with Infinity, and some items (like a pumpkin) take neither.
  if (skipped.length) message += `${message ? "\n" : ""}§e${skipped.join(" and ")} can't go on that item`;
  player.sendMessage(message);
}

// Callbacks run in read-only mode, so the actual change waits for the next tick.
function runForPlayer(origin, commandName, action) {
  const player = origin.sourceEntity;
  if (!(player instanceof Player)) {
    return { status: CustomCommandStatus.Failure, message: `Only players can use /${commandName}` };
  }
  system.run(() => action(player));
  return { status: CustomCommandStatus.Success };
}

function runGive(origin, amount, commandName, give) {
  if (amount < 1 || amount > MAX_AMOUNT) {
    return { status: CustomCommandStatus.Failure, message: `Pick a number from 1 to ${MAX_AMOUNT}` };
  }
  return runForPlayer(origin, commandName, (player) => give(player, amount));
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  // The game also registers the un-namespaced forms, so players can just type /sk, /er, /ep and /bm.
  // GameDirectors means operators only. Players without op can't run them, and they don't show up when they type "/".
  const operatorCommand = (commandName, description, extra = {}) => ({
    name: `skypro:${commandName}`,
    description,
    permissionLevel: CommandPermissionLevel.GameDirectors,
    cheatsRequired: false,
    ...extra,
  });
  const registerGive = (commandName, description, give) =>
    customCommandRegistry.registerCommand(
      operatorCommand(commandName, description, {
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "amount" }],
      }),
      (origin, amount) => runGive(origin, amount, commandName, give)
    );

  registerGive("sk", "Give yourself flight duration 3 firework rockets", giveRockets);
  registerGive("er", "Give yourself XP bottles", giveXpBottles);
  registerGive("ep", "Give yourself ender pearls", giveEnderPearls);
  customCommandRegistry.registerCommand(
    operatorCommand("bm", "Add Unbreaking III and Mending to the item you're holding"),
    (origin) => runForPlayer(origin, "bm", enchantHeldItem)
  );
});
