// Deterministic check of the reconcile logic with no network: the "server" is a
// real Match, the "client" a replica that loads the quantised snapshot state and
// replays the commands the server has not applied yet. Positions must agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/sim/match.js';
import { Fighter } from '../shared/sim/fighter.js';
import { applyMovement, emptyCommand, ACT, HELD } from '../shared/sim/controller.js';
import { TICK_DT } from '../shared/config.js';
import { encodeSnapshot, decodeSnapshot } from '../shared/net/protocol.js';

function script(i, f) {
  const cmd = { ...emptyCommand(), seq: i + 1, yaw: Math.sin(i / 40) * 1.5, pitch: f.airborne ? -1.1 : 0, mz: 1, held: HELD.FORWARD };
  if (i === 70) cmd.act = ACT.JUMP; // leave the bus (doors open at 1.5 s)
  if (f.state === 'ground') { cmd.held |= HELD.SPRINT | (i % 50 < 6 ? HELD.JUMP : 0); cmd.mx = i % 90 < 45 ? 1 : -1; }
  return cmd;
}

for (const lag of [0, 3, 8]) {
  test(`replay matches the server with ${lag} ticks of command latency`, () => {
    const server = new Match({ seed: 9, botCount: 0, keepHistory: true });
    const me = server.addHuman('me');
    server.start();
    const replica = new Match({ seed: 9, botCount: 0, replica: true });
    const cf = new Fighter('me', {}, { human: true });
    cf.id = me.id;
    replica.fighters.push(cf);

    const sent = []; // commands the client has sent, in order
    const inFlight = []; // [arrivalTick, cmd]
    let ack = 0, worst = 0, checks = 0;
    const predicted = []; // client positions after replay, to compare with the server later
    const serverAfter = new Map(); // seq -> where the server stood after applying it
    for (let i = 0; i < 900; i++) {
      // Client makes a command and predicts it (once it can: after the bus).
      const cmd = script(i, cf);
      sent.push(cmd);
      inFlight.push([i + lag, cmd]);
      if (cf.alive && cf.state !== 'bus') { applyMovement(replica, cf, cmd, TICK_DT); replica.physics(cf, TICK_DT); }
      // Server receives commands whose time has come, then ticks.
      while (inFlight.length && inFlight[0][0] <= i) { const [, c] = inFlight.shift(); server.setCommand(me.id, c); ack = c.seq; }
      server.tick();
      server.takeEvents();
      serverAfter.set(ack, { x: me.pos.x, y: me.pos.y, z: me.pos.z });
      // Snapshot back to the client every 3rd tick, arriving `lag` ticks later (uses current state for simplicity).
      if (i % 3 === 0 && i > 80) {
        const snap = decodeSnapshot(encodeSnapshot({ tick: server.tickCount, ackSeq: ack, match: server, self: me, updated: [], removed: [] }));
        const r = snap.self;
        cf.state = r.state; cf.alive = r.alive; cf.onGround = r.onGround; cf.swimming = r.swimming;
        cf.ads = r.ads; cf.buildMode = r.buildMode; cf.editMode = r.editMode;
        cf.pos.set(r.x, r.y, r.z); cf.vel.set(r.vx, r.vy, r.vz);
        replica.collision.refreshGround(cf);
        for (const c of sent.filter((x) => x.seq > snap.ackSeq)) { applyMovement(replica, cf, c, TICK_DT); replica.physics(cf, TICK_DT); }
        predicted.push({ seq: sent[sent.length - 1].seq, x: cf.pos.x, y: cf.pos.y, z: cf.pos.z, st: cf.state });
        checks++;
      }
    }
    assert.ok(checks > 100);
    for (const p of predicted) {
      const truth = serverAfter.get(p.seq);
      if (!truth) continue;
      worst = Math.max(worst, Math.hypot(p.x - truth.x, p.y - truth.y, p.z - truth.z));
    }
    assert.ok(worst < 0.1, `replay disagrees with the server by ${worst.toFixed(3)} m`);
  });
}
