import { system, world } from "@minecraft/server";

// Vanilla snaps a lead once the mob is ~10 blocks from whatever holds it.
// We pull the mob back well before that, and if the game still snaps it
// (ender pearl, /tp, a portal), we tie it straight back on.
const PULL_DISTANCE = 6;
const RESCAN_TICKS = 20;
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

// entity id -> what it was tied to last tick
/** @type {Map<string, { entity: import("@minecraft/server").Entity, holder: import("@minecraft/server").Entity | undefined, location: import("@minecraft/server").Vector3, dimension: import("@minecraft/server").Dimension }>} */
const tracked = new Map();
/** entity ids a player deliberately interacted with recently (unleash, shears, etc.) */
const touched = new Map();

/** @param {import("@minecraft/server").Entity} entity @returns {import("@minecraft/server").EntityLeashableComponent | undefined} */
function leashOf(entity) {
  try {
    return entity.getComponent("minecraft:leashable");
  } catch {
    return undefined;
  }
}

/** @param {import("@minecraft/server").Entity} entity @param {import("@minecraft/server").EntityLeashableComponent} leash */
function track(entity, leash) {
  tracked.set(entity.id, {
    entity,
    holder: leash.leashHolder,
    location: entity.location,
    dimension: entity.dimension,
  });
}

function rescan() {
  for (const id of DIMENSIONS) {
    let entities;
    try {
      entities = world.getDimension(id).getEntities();
    } catch {
      continue;
    }
    for (const entity of entities) {
      if (tracked.has(entity.id)) continue;
      const leash = leashOf(entity);
      if (leash?.isLeashed && leash.leashHolder) track(entity, leash);
    }
  }
}

/** @param {import("@minecraft/server").Entity} holder */
function landingSpot(holder) {
  const at = holder.location;
  let v = { x: 0, y: 0, z: 0 };
  try {
    v = holder.getVelocity();
  } catch {}
  const speed = Math.hypot(v.x, v.z);
  if (speed < 0.05) return at;
  // Drop the mob just behind the holder so it isn't spawned in their face.
  const spot = { x: at.x - (v.x / speed) * 1.5, y: at.y, z: at.z - (v.z / speed) * 1.5 };
  try {
    const block = holder.dimension.getBlock(spot);
    if (block && !block.isAir) return at;
  } catch {
    return at;
  }
  return spot;
}

/** @param {import("@minecraft/server").Entity} entity @param {import("@minecraft/server").Entity} holder */
function pullTo(entity, holder) {
  try {
    entity.teleport(landingSpot(holder), { dimension: holder.dimension, keepVelocity: false, checkForBlocks: false });
    entity.addEffect("slow_falling", 40, { showParticles: false });
  } catch {}
}

/** @param {import("@minecraft/server").Dimension} dimension @param {import("@minecraft/server").Vector3} location */
function removeDroppedLead(dimension, location) {
  try {
    const items = dimension.getEntities({ type: "minecraft:item", location, maxDistance: 4 });
    for (const item of items) {
      const stack = item.getComponent("minecraft:item")?.itemStack;
      if (stack?.typeId === "minecraft:lead") {
        const where = item.location;
        item.remove();
        if (stack.amount > 1) {
          stack.amount -= 1;
          dimension.spawnItem(stack, where);
        }
        return true;
      }
    }
  } catch {}
  return false;
}

function tick() {
  const now = system.currentTick;
  for (const [id, t] of touched) if (now - t > 5) touched.delete(id);

  for (const [id, state] of tracked) {
    const { entity } = state;
    if (!entity.isValid) {
      tracked.delete(id);
      continue;
    }
    const leash = leashOf(entity);
    if (!leash) {
      tracked.delete(id);
      continue;
    }

    if (leash.isLeashed) {
      const holder = leash.leashHolder;
      if (!holder?.isValid) continue;
      state.holder = holder;
      state.location = entity.location;
      state.dimension = entity.dimension;

      if (holder.dimension.id !== entity.dimension.id) {
        pullTo(entity, holder);
        continue;
      }
      const a = entity.location;
      const b = holder.location;
      const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (dist > PULL_DISTANCE) pullTo(entity, holder);
      continue;
    }

    // It was on a lead last tick and isn't now. Work out if the lead snapped
    // or if someone took it off on purpose.
    const holder = state.holder;
    const deliberate =
      touched.has(id) ||
      !holder?.isValid ||
      holder.typeId === "minecraft:leash_knot" ||
      (holder.typeId === "minecraft:player" && touched.has(holder.id));

    if (deliberate) {
      tracked.delete(id);
      continue;
    }

    pullTo(entity, holder);
    const snappedAt = state.location;
    const snappedIn = state.dimension;
    system.run(() => {
      if (!entity.isValid || !holder.isValid) return;
      try {
        leashOf(entity)?.leashTo(holder);
      } catch {
        tracked.delete(id);
        return;
      }
      // Eat the lead item the snap dropped so you don't get a free one.
      if (!removeDroppedLead(snappedIn, snappedAt)) {
        system.runTimeout(() => removeDroppedLead(snappedIn, snappedAt), 2);
      }
    });
  }
}

world.afterEvents.playerInteractWithEntity.subscribe(({ target }) => {
  touched.set(target.id, system.currentTick);
  // The player may have just put a lead on, start watching it right away.
  system.run(() => {
    if (!target.isValid) return;
    const leash = leashOf(target);
    if (leash?.isLeashed && leash.leashHolder) track(target, leash);
  });
});

// Clicking a fence or wall ties your mobs to it. That swaps the holder, it isn't a snap.
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (/fence|wall/.test(block.typeId)) touched.set(player.id, system.currentTick);
});

system.runInterval(tick, 1);
system.runInterval(rescan, RESCAN_TICKS);
