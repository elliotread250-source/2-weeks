// Runs the match in this browser for offline play. A host is the only thing the
// client talks to: it takes a command per tick and hands back events and sim
// state. An online host (WebSocket) will expose the same shape.
import { TICK_DT } from '/shared/config.js';
import { Match } from '/shared/sim/match.js';

const MAX_STEPS_PER_FRAME = 5;

export class LocalHost {
  constructor(opts = {}) {
    this.match = new Match({ botCount: opts.botCount, seed: opts.seed });
    this.local = this.match.addHuman('You');
    this.match.addBots();
    this.acc = 0;
  }

  start() {
    this.match.start();
  }

  // Advance by real time. `sample` supplies the command for each tick.
  // Returns the events produced and how far we are into the next tick.
  step(dt, sample) {
    const events = [];
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= TICK_DT && steps < MAX_STEPS_PER_FRAME) {
      this.match.setCommand(this.local.id, sample());
      this.match.tick(TICK_DT);
      for (const e of this.match.takeEvents()) events.push(e);
      this.acc -= TICK_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    return { events, alpha: this.acc / TICK_DT };
  }
}
