import {
  system,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  ItemStack,
  Player,
} from "@minecraft/server";

const ROCKET = "minecraft:firework_rocket";
const STACK_SIZE = 64;
// 100 full stacks. Anything bigger just floods the floor with item entities and lags the world.
const MAX_AMOUNT = 6400;

function giveRockets(player, amount) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  let remaining = amount;
  let dropped = 0;

  while (remaining > 0) {
    const count = Math.min(remaining, STACK_SIZE);
    remaining -= count;

    // addItem returns whatever didn't fit, so a full inventory spills onto the ground.
    const leftover = inventory ? inventory.addItem(new ItemStack(ROCKET, count)) : new ItemStack(ROCKET, count);
    if (leftover) {
      dropped += leftover.amount;
      player.dimension.spawnItem(leftover, player.location);
    }
  }

  const label = amount === 1 ? "firework rocket" : "firework rockets";
  let message = `§aGave you ${amount} ${label}`;
  if (dropped > 0) message += `\n§e${dropped} didn't fit and were dropped at your feet`;
  player.sendMessage(message);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  // The game also registers the un-namespaced form, so players can just type /sk.
  // GameDirectors means operators only. Players without op can't run it, and it doesn't show up when they type "/".
  customCommandRegistry.registerCommand(
    {
      name: "rocketkit:sk",
      description: "Give yourself firework rockets for elytra flight",
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
