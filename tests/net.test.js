import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { attachGameServer } from '../server/index.js';
import { encodeCommands, decodeSnapshot } from '../shared/net/protocol.js';
import { emptyCommand, ACT } from '../shared/sim/controller.js';

function boot(opts) {
  const httpServer = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  const game = attachGameServer(httpServer, opts);
  return new Promise((resolve) => httpServer.listen(0, () => resolve({ httpServer, game, port: httpServer.address().port })));
}

function connect(port, name) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const c = { ws, text: [], snaps: [], welcome: null, seq: 0 };
  ws.on('message', (data, isBinary) => {
    if (isBinary) { c.snaps.push(decodeSnapshot(new Uint8Array(data))); return; }
    const m = JSON.parse(data.toString());
    c.text.push(m);
    if (m.t === 'welcome') c.welcome = m;
  });
  c.open = new Promise((res) => ws.on('open', res));
  c.send = (cmd) => ws.send(encodeCommands([{ ...emptyCommand(), seq: ++c.seq, ...cmd }]));
  c.name = name;
  return c;
}

const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('two clients join a room, get a welcome, and exchange inputs', async () => {
  const { httpServer, game, port } = await boot({ capacity: 6, lobbySeconds: 1, humanTarget: 2 });
  const a = connect(port, 'alice'), b = connect(port, 'bob');
  await Promise.all([a.open, b.open]);
  a.ws.send(JSON.stringify({ t: 'join', name: 'alice' }));
  b.ws.send(JSON.stringify({ t: 'join', name: 'bob' }));
  await until(() => a.welcome && b.welcome);
  assert.notEqual(a.welcome.self, b.welcome.self);
  assert.equal(a.welcome.fighters.length, 6, 'bots fill the remaining slots');
  assert.equal(a.welcome.seed, b.welcome.seed);

  await until(() => a.snaps.length > 3 && b.snaps.length > 3);
  const first = a.snaps[a.snaps.length - 1];
  assert.equal(first.phase, 'bus');
  assert.equal(first.self.id, a.welcome.self);
  assert.equal(first.self.state, 'bus');

  // Bus doors open after 1.5 s; alice jumps, bob stays put.
  await new Promise((r) => setTimeout(r, 1800));
  for (let i = 0; i < 6; i++) { a.send({}); b.send({}); await new Promise((r) => setTimeout(r, 34)); }
  a.send({ act: ACT.JUMP });
  await until(() => a.snaps.at(-1).self.state === 'skydive');
  assert.ok(a.snaps.at(-1).ackSeq >= a.seq - 3, 'server acknowledges applied commands');
  assert.equal(b.snaps.at(-1).self.state, 'bus', 'bob did not jump');
  // Alice appears in bob's snapshots (interest covers the whole bus route).
  await until(() => b.snaps.some((s) => s.fighters.some((f) => f.id === a.welcome.self && f.state === 'skydive')));

  const stats = game.matchmaker.stats().rooms[0];
  assert.ok(stats.avgTickMs < 20, `tick ${stats.avgTickMs} ms`);
  a.ws.close(); b.ws.close();
  httpServer.close();
  for (const r of game.matchmaker.rooms) r.close();
});

test('floods and garbage get a client kicked', async () => {
  const { httpServer, game, port } = await boot({ capacity: 4, lobbySeconds: 60 });
  const a = connect(port, 'spam');
  await a.open;
  const closed = new Promise((res) => a.ws.on('close', (code) => res(code)));
  a.ws.send(JSON.stringify({ t: 'join', name: 'spam' }));
  for (let i = 0; i < 30; i++) a.ws.send('not json {');
  assert.equal(await closed, 1008);
  httpServer.close();
  for (const r of game.matchmaker.rooms) r.close();
});

test('a dropped player can resume their session', async () => {
  const { httpServer, game, port } = await boot({ capacity: 4, lobbySeconds: 1, humanTarget: 1 });
  const a = connect(port, 'ria');
  await a.open;
  a.ws.send(JSON.stringify({ t: 'join', name: 'ria' }));
  await until(() => a.welcome);
  const { token, self } = a.welcome;
  a.ws.close();
  await new Promise((r) => setTimeout(r, 200));
  const b = connect(port, 'ria2');
  await b.open;
  b.ws.send(JSON.stringify({ t: 'resume', token }));
  await until(() => b.welcome);
  assert.equal(b.welcome.self, self);
  assert.equal(b.welcome.resumed, true);
  await until(() => b.snaps.length > 2);
  b.ws.close();
  httpServer.close();
  for (const r of game.matchmaker.rooms) r.close();
});

test('a client flooding commands cannot run faster than real time', async () => {
  const { Room } = await import('../server/room.js');
  const room = new Room({ capacity: 2, lobbySeconds: 60, humanTarget: 1 });
  const sent = [];
  const c = {
    connected: true, name: 'cheat', ws: null, sendText: (s) => sent.push(s), sendBinary() {}, violate() {},
  };
  room.add(c);
  room.start();
  clearTimeout(room.timer);
  let applied = 0;
  const orig = room.match.setCommand.bind(room.match);
  room.match.setCommand = (id, cmd) => { applied++; orig(id, cmd); };
  const cmds = [];
  for (let i = 1; i <= 300; i++) cmds.push({ ...emptyCommand(), seq: i });
  room.onCommands(c, cmds);
  for (let i = 0; i < 30; i++) room.step(); // one second of server time
  assert.ok(applied <= 40, `applied ${applied} commands in 30 ticks`);
  assert.ok(c.queue.length <= 12, 'backlog is bounded');
  room.close();
});
