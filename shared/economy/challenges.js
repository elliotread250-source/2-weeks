// Challenge definitions. Data only: the server tracks progress from match
// summaries, the client just displays what the server reports.
import { Rng } from '../math/util.js';
import { hashStr } from './economy.js';

// event = the match-summary field it counts. mode 'sum' adds up across matches;
// 'best' keeps the highest single-match value ("5 eliminations in one match").
const d = (id, text, event, target, coins, mode = 'sum') => ({ id, kind: 'daily', text, event, target, coins, mode });
const w = (id, text, event, target, coins, mode = 'sum') => ({ id, kind: 'weekly', text, event, target, coins, mode });

export const DAILY = [
  d('d_kills_3', 'Eliminate 3 players', 'kills', 3, 60),
  d('d_kills_5', 'Eliminate 5 players', 'kills', 5, 90),
  d('d_kills_2_match', 'Get 2 eliminations in a single match', 'kills', 2, 50, 'best'),
  d('d_kills_4_match', 'Get 4 eliminations in a single match', 'kills', 4, 90, 'best'),
  d('d_assist_3', 'Get 3 assists', 'assists', 3, 50),
  d('d_head_3', 'Land 3 headshots', 'headshots', 3, 60),
  d('d_head_8', 'Land 8 headshots', 'headshots', 8, 100),
  d('d_dmg_500', 'Deal 500 damage', 'damage', 500, 50),
  d('d_dmg_1500', 'Deal 1500 damage', 'damage', 1500, 90),
  d('d_play_2', 'Play 2 matches', 'matches', 2, 40),
  d('d_play_4', 'Play 4 matches', 'matches', 4, 80),
  d('d_top10', 'Reach the top 10', 'top10', 1, 60),
  d('d_top10_x2', 'Reach the top 10 twice', 'top10', 2, 100),
  d('d_win', 'Win a match', 'wins', 1, 150),
  d('d_chests_5', 'Open 5 chests', 'chests', 5, 50),
  d('d_chests_10', 'Open 10 chests', 'chests', 10, 80),
  d('d_harvest_500', 'Harvest 500 materials', 'harvested', 500, 50),
  d('d_harvest_1500', 'Harvest 1500 materials', 'harvested', 1500, 90),
  d('d_build_50', 'Place 50 building pieces', 'built', 50, 50),
  d('d_build_150', 'Place 150 building pieces', 'built', 150, 90),
  d('d_survive_8', 'Survive 8 minutes in a match', 'survivalMin', 8, 70, 'best'),
  d('d_survive_5', 'Survive 5 minutes in a match', 'survivalMin', 5, 50, 'best'),
];

export const WEEKLY = [
  w('w_kills_25', 'Eliminate 25 players', 'kills', 25, 300),
  w('w_kills_50', 'Eliminate 50 players', 'kills', 50, 450),
  w('w_wins_2', 'Win 2 matches', 'wins', 2, 400),
  w('w_wins_1', 'Win a match', 'wins', 1, 250),
  w('w_top10_8', 'Reach the top 10 eight times', 'top10', 8, 300),
  w('w_play_15', 'Play 15 matches', 'matches', 15, 250),
  w('w_head_30', 'Land 30 headshots', 'headshots', 30, 300),
  w('w_dmg_8000', 'Deal 8000 damage', 'damage', 8000, 300),
  w('w_chests_40', 'Open 40 chests', 'chests', 40, 250),
  w('w_harvest_8000', 'Harvest 8000 materials', 'harvested', 8000, 250),
  w('w_build_600', 'Place 600 building pieces', 'built', 600, 250),
  w('w_assist_15', 'Get 15 assists', 'assists', 15, 250),
  w('w_kills_6_match', 'Get 6 eliminations in a single match', 'kills', 6, 400, 'best'),
  w('w_survive_10', 'Survive 10 minutes in a match', 'survivalMin', 10, 300, 'best'),
];

// Lifetime milestones unlock items (the ids line up with `unlock` in the catalog).
export const MILESTONES = [
  { id: 'milestone_wins_1', text: 'Win your first match', event: 'wins', target: 1, coins: 200 },
  { id: 'milestone_wins_5', text: 'Win 5 matches', event: 'wins', target: 5, coins: 300 },
  { id: 'milestone_wins_10', text: 'Win 10 matches', event: 'wins', target: 10, coins: 500 },
  { id: 'milestone_kills_50', text: 'Eliminate 50 players', event: 'kills', target: 50, coins: 250 },
  { id: 'milestone_kills_200', text: 'Eliminate 200 players', event: 'kills', target: 200, coins: 500 },
  { id: 'milestone_matches_25', text: 'Play 25 matches', event: 'matches', target: 25, coins: 200 },
  { id: 'milestone_matches_100', text: 'Play 100 matches', event: 'matches', target: 100, coins: 500 },
  { id: 'milestone_chests_100', text: 'Open 100 chests', event: 'chests', target: 100, coins: 200 },
  { id: 'milestone_harvest_5000', text: 'Harvest 5000 materials', event: 'harvested', target: 5000, coins: 200 },
  { id: 'milestone_build_2000', text: 'Place 2000 building pieces', event: 'built', target: 2000, coins: 200 },
].map((m) => ({ ...m, kind: 'milestone', mode: 'sum' }));

export const ALL_CHALLENGES = [...DAILY, ...WEEKLY, ...MILESTONES];
export const BY_ID = new Map(ALL_CHALLENGES.map((c) => [c.id, c]));
export const REROLL_PER_DAY = 1;

// Three dailies per player per day. `nonce` changes after a reroll of that slot.
export function dailySet(userId, day, nonces = [0, 0, 0]) {
  const chosen = [];
  for (let slot = 0; slot < 3; slot++) {
    const rng = new Rng(hashStr(`daily:${userId}:${day}:${slot}:${nonces[slot] || 0}`));
    const pool = DAILY.filter((c) => !chosen.includes(c.id) && !chosen.some((id) => BY_ID.get(id).event === c.event));
    chosen.push(pool[Math.floor(rng.random() * pool.length)].id);
  }
  return chosen;
}

// Seven weeklies, the same for everyone.
export function weeklySet(weekStart) {
  const rng = new Rng(hashStr(`weekly:${weekStart}`));
  const bag = [...WEEKLY];
  const out = [];
  while (out.length < 7 && bag.length) out.push(bag.splice(Math.floor(rng.random() * bag.length), 1)[0].id);
  return out;
}

// Fold one match summary into a progress value.
export function advance(def, current, summary) {
  const v = summary[def.event] || 0;
  return Math.min(def.target, def.mode === 'best' ? Math.max(current, v) : current + v);
}
