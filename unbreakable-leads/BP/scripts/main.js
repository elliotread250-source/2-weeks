import { system, world } from "@minecraft/server";

// Vanilla snaps a lead once the mob is ~10 blocks from whatever holds it.
// We pull the mob back well before that, and if the game still snaps it
// (ender pearl, /tp, a portal), we tie it straight back on.
//
// Everything runs on the server, so it covers every player on a Realm or
// multiplayer world at once. Boats work at both ends: a boat can be on a
// lead, hold a lead, or carry the player or mob that's on one.
const PULL_DISTANCE = 6;
const RESCAN_TICKS = 20;
// How long after a player clicks a mob (or a fence) we treat a lead coming off as on purpose.
const TOUCH_WINDOW = 20;
// How long we wait after a lead comes off before deciding it snapped.
const SNAP_GRACE = 2;
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

// entity id -> what it was tied to last tick
/** @type {Map<string, { entity: import("@minecraft/server").Entity, holder: import("@minecraft/server").Entity | undefined, location: import("@minecraft/server").Vector3, dimension: import("@minecraft/server").Dimension, pending?: boolean }>} */
const tracked = new Map();
/** entity ids a player deliberately interacted with recently (unleash, shears, fence, etc.) */
const touched = new Map();
/** lead items that just dropped, so we only ever delete the one a snap made */
/** @type {Map<string, { item: import("@minecraft/server").Entity, tick: number }>} */
const freshLeads = new Map();

/** @param {import("@minecraft/server").Entity} entity @returns {import("@minecraft/server").EntityLeashableComponent | undefined} */
function leashOf(entity) {
  try {
    return entity.getComponent("minecraft:leashable");
  } catch {
    return undefined;
  }
}

/** The boat (or other vehicle) at the bottom of whatever this entity is sitting in. */
/** @param {import("@minecraft/server").Entity} entity */
function rootVehicle(entity) {
  let current = entity;
  for (let i = 0; i < 8; i++) {
    let below;
    try {
      below = current.getComponent("minecraft:riding")?.entityRidingOn;
    } catch {
      break;
    }
    if (!below?.isValid) break;
    current = below;
  }
  return current;
}

/** @param {import("@minecraft/server").Entity | undefined} entity */
function isSneaking(entity) {
  try {
    return entity.typeId === "minecraft:player" && entity.isSneaking;
  } catch {
    return false;
  }
}

/** @param {string} id */
function markTouched(id) {
  touched.set(id, system.currentTick);
}

/** @param {import("@minecraft/server").Entity} entity */
function isDead(entity) {
  try {
    const health = entity.getComponent("minecraft:health");
    return health ? health.currentValue <= 0 : false;
  } catch {
    return false;
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
  // If the holder is in a boat, steer by the boat, since the player's own velocity reads as zero.
  const anchor = rootVehicle(holder);
  const at = anchor.location;
  let v = { x: 0, y: 0, z: 0 };
  try {
    v = anchor.getVelocity();
  } catch {}
  const speed = Math.hypot(v.x, v.z);
  if (speed < 0.05) return at;
  // Drop the mob just behind the holder so it isn't spawned in their face.
  const spot = { x: at.x - (v.x / speed) * 2, y: at.y, z: at.z - (v.z / speed) * 2 };
  try {
    const block = anchor.dimension.getBlock(spot);
    if (block && !block.isAir && !block.isLiquid) return at;
  } catch {
    return at;
  }
  return spot;
}

/** Everyone sitting in this vehicle, and anyone sitting on them. */
/** @param {import("@minecraft/server").Entity} vehicle */
function ridersOf(vehicle) {
  /** @type {{ rider: import("@minecraft/server").Entity, seat: import("@minecraft/server").Entity }[]} */
  const out = [];
  try {
    for (const rider of vehicle.getComponent("minecraft:rideable")?.getRiders() ?? []) {
      out.push({ rider, seat: vehicle });
      out.push(...ridersOf(rider));
    }
  } catch {}
  return out;
}

/** @param {import("@minecraft/server").Entity} entity @param {import("@minecraft/server").Entity} holder */
function pullTo(entity, holder) {
  // A mob sitting in a boat gets pulled boat and all, same as vanilla does.
  const mover = rootVehicle(entity);
  if (mover.id === rootVehicle(holder).id) return;

  const spot = landingSpot(holder);
  const riders = ridersOf(mover);
  try {
    mover.teleport(spot, { dimension: holder.dimension, keepVelocity: false, checkForBlocks: false });
    if (mover.typeId !== "minecraft:boat" && mover.typeId !== "minecraft:chest_boat") {
      mover.addEffect("slow_falling", 40, { showParticles: false });
    }
  } catch {
    return;
  }
  if (riders.length === 0) return;

  // Teleporting a boat can throw its passengers out. Put them back in.
  system.run(() => {
    for (const { rider, seat } of riders) {
      if (!rider.isValid || !seat.isValid) continue;
      let ridingOn;
      try {
        ridingOn = rider.getComponent("minecraft:riding")?.entityRidingOn;
      } catch {}
      if (ridingOn?.id === seat.id) continue;
      try {
        rider.teleport(seat.location, { dimension: seat.dimension, keepVelocity: false, checkForBlocks: false });
        seat.getComponent("minecraft:rideable")?.addRider(rider);
      } catch {}
    }
  });
}

/** @param {import("@minecraft/server").Dimension} dimension @param {import("@minecraft/server").Vector3} location */
function removeDroppedLead(dimension, location) {
  for (const [id, { item }] of freshLeads) {
    if (!item.isValid) {
      freshLeads.delete(id);
      continue;
    }
    if (item.dimension.id !== dimension.id) continue;
    const a = item.location;
    if (Math.hypot(a.x - location.x, a.y - location.y, a.z - location.z) > 4) continue;
    try {
      const stack = item.getComponent("minecraft:item")?.itemStack;
      if (stack?.typeId !== "minecraft:lead") continue;
      const where = item.location;
      item.remove();
      freshLeads.delete(id);
      if (stack.amount > 1) {
        stack.amount -= 1;
        dimension.spawnItem(stack, where);
      }
      return true;
    } catch {}
  }
  return false;
}

function tick() {
  const now = system.currentTick;
  for (const [id, t] of touched) if (now - t > TOUCH_WINDOW) touched.delete(id);
  for (const [id, f] of freshLeads) if (now - f.tick > 10) freshLeads.delete(id);

  for (const [id, state] of tracked) {
    const { entity } = state;
    if (state.pending) continue;
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
      if (!holder?.isValid || isDead(holder)) continue;
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
    const onPurpose = () =>
      touched.has(id) ||
      !holder?.isValid ||
      isDead(holder) ||
      isSneaking(holder) ||
      holder.typeId === "minecraft:leash_knot" ||
      touched.has(holder.id) ||
      !!leashOf(entity)?.isLeashed;

    if (onPurpose()) {
      tracked.delete(id);
      continue;
    }

    // Give the game a couple of ticks to tell us a player clicked the mob
    // before we decide the lead snapped. Those events can land a tick late.
    state.pending = true;
    const snappedAt = state.location;
    const snappedIn = state.dimension;
    system.runTimeout(() => {
      state.pending = false;
      if (!entity.isValid || onPurpose()) {
        tracked.delete(id);
        return;
      }
      pullTo(entity, holder);
      system.run(() => {
        if (!entity.isValid || !holder.isValid) return;
        try {
          leashOf(entity)?.leashTo(holder);
        } catch {
          tracked.delete(id);
          return;
        }
        // Eat the lead item the snap dropped so nobody gets a free one.
        if (!removeDroppedLead(snappedIn, snappedAt)) {
          system.runTimeout(() => removeDroppedLead(snappedIn, snappedAt), 2);
        }
      });
    }, SNAP_GRACE);
  }
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (entity.typeId !== "minecraft:item") return;
  try {
    if (entity.getComponent("minecraft:item")?.itemStack.typeId === "minecraft:lead") {
      freshLeads.set(entity.id, { item: entity, tick: system.currentTick });
    }
  } catch {}
});

// Before-events fire the instant a player clicks, ahead of the lead coming off,
// so a deliberate unleash (empty hand, shears, handing mobs to a boat) is
// always recorded in time. The after-events are a backup.
world.beforeEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  markTouched(target.id);
  markTouched(player.id);
});

world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  markTouched(target.id);
  markTouched(player.id);
  // Someone may have just put a lead on (or tied something to their boat), start watching right away.
  system.run(() => {
    if (!target.isValid) return;
    const leash = leashOf(target);
    if (leash?.isLeashed && leash.leashHolder) track(target, leash);
  });
});

// Clicking a fence or wall ties your mobs to it. That swaps the holder, it isn't a snap.
world.beforeEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (/fence|wall/.test(block.typeId)) markTouched(player.id);
});
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (/fence|wall/.test(block.typeId)) markTouched(player.id);
});

system.runInterval(tick, 1);
system.runInterval(rescan, RESCAN_TICKS);
