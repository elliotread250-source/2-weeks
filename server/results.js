// Writes a finished online match to the database: the match row, each signed-in
// player's result and their career stats. Guests and bots are not recorded.

export async function recordMatch(db, room) {
  const m = room.match;
  if (!db.ready || !m) return null;
  const players = [...room.clients.values()].filter((c) => c.userId && c.fighter && c.fighter.placement);
  if (!players.length) return null;
  try {
    return await db.tx(async (c) => {
      const humans = room.clients.size;
      const { rows } = await c.query(
        'INSERT INTO matches (mode, seed, humans, bots, ended_at) VALUES ($1, $2, $3, $4, now()) RETURNING id',
        [room.mode, m.seed, humans, m.fighters.length - humans],
      );
      const matchId = Number(rows[0].id);
      const rewards = new Map();
      for (const p of players) {
        const f = p.fighter;
        const survival = Math.round(f.diedAt || m.time);
        await c.query(
          'INSERT INTO match_players (match_id, user_id, placement, kills, damage, survival_s) VALUES ($1, $2, $3, $4, $5, $6)',
          [matchId, p.userId, f.placement, f.kills, Math.round(f.damageDealt), survival],
        );
        await c.query(
          `UPDATE stats SET matches = matches + 1, wins = wins + $2, top10 = top10 + $3,
             kills = kills + $4, damage = damage + $5, time_alive_s = time_alive_s + $6 WHERE user_id = $1`,
          [p.userId, f.placement === 1 ? 1 : 0, f.placement <= 10 ? 1 : 0, f.kills, Math.round(f.damageDealt), survival],
        );
        if (db.economy) {
          const summary = {
            placement: f.placement, total: m.fighters.length, kills: f.kills, assists: f.stats.assists, survivalS: survival,
            survivalMin: Math.floor(survival / 60), damage: Math.round(f.damageDealt), headshots: f.stats.headshots,
            chests: f.stats.chests, harvested: f.stats.harvested, built: f.stats.built,
            matches: 1, wins: f.placement === 1 ? 1 : 0, top10: f.placement <= 10 ? 1 : 0,
          };
          const reward = await db.economy.rewardOnline(c, p.userId, summary, matchId);
          await c.query('UPDATE match_players SET coins_earned = $3 WHERE match_id = $1 AND user_id = $2', [matchId, p.userId, reward.coins + reward.bonus]);
          rewards.set(p.userId, reward);
        }
      }
      room.rewards = rewards;
      return matchId;
    });
  } catch (e) {
    console.error('[results] could not record match', e.message);
    return null;
  }
}
