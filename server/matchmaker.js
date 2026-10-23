// Puts connecting players into rooms. A room fills from a lobby; when it is
// full or its timer runs out, bots take the remaining slots so nobody waits
// forever. If the server is already busy, fewer bots are added.
import { Room } from './room.js';
import { TICK_RATE } from '../shared/config.js';

const BUDGET_MS = 1000 / TICK_RATE;

export class Matchmaker {
  constructor(opts = {}) {
    this.capacity = opts.capacity || Number(process.env.MAX_PLAYERS_PER_ROOM) || 32;
    this.lobbySeconds = opts.lobbySeconds ?? Number(process.env.LOBBY_SECONDS ?? 60);
    this.humanTarget = opts.humanTarget || Number(process.env.HUMAN_TARGET) || this.capacity;
    this.rooms = new Set();
    this.db = opts.db || null;
  }

  // Past 70% of the tick budget across live rooms, stop topping up with bots.
  botBudget() {
    const live = [...this.rooms].filter((r) => r.state === 'playing');
    if (!live.length) return Infinity;
    const avg = live.reduce((a, r) => a + r.avgTickMs, 0) / live.length;
    return avg > BUDGET_MS * 0.7 ? Math.floor(this.capacity / 4) : Infinity;
  }

  join(client, mode = 'solo') {
    let room = [...this.rooms].find((r) => r.open && r.mode === mode);
    if (!room) {
      room = new Room({
        capacity: this.capacity, lobbySeconds: this.lobbySeconds, humanTarget: this.humanTarget, mode,
        botBudget: () => this.botBudget(), onClose: (r) => this.rooms.delete(r), db: this.db,
      });
      this.rooms.add(room);
    }
    room.add(client);
    return room;
  }

  stats() {
    return { rooms: [...this.rooms].map((r) => r.stats()) };
  }
}
