// Username rules: shape, a profanity/slur filter that survives leetspeak and
// separators, and reserved words so nobody can pass as staff.

const BAD = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'rape', 'rapist', 'nazi', 'hitler', 'whore',
  'slut', 'dick', 'cock', 'penis', 'vagina', 'tits', 'retard', 'kys', 'molest',
];
// Long words are banned anywhere in the name; short ones only as a whole word.
const RESERVED_ANYWHERE = ['admin', 'administrator', 'moderator', 'staff', 'support', 'system', 'owner', 'developer', 'official', 'fortnite'];
const RESERVED_WORD = ['mod', 'mods', 'epic', 'gm', 'dev'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };

// Lower-case, undo leetspeak, drop separators: "Ad_M1n" -> "admin".
export function squash(name) {
  return [...name.toLowerCase()].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
}

export function validateUsername(raw) {
  const name = String(raw ?? '').trim();
  if (name.length < 3 || name.length > 16) return { ok: false, error: 'Username must be 3 to 16 characters' };
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return { ok: false, error: 'Use letters, numbers, _ . - only' };
  if (!/[A-Za-z0-9]/.test(name.replace(/[_.-]/g, ''))) return { ok: false, error: 'Pick a real name' };
  const s = squash(name);
  if (BAD.some((w) => s.includes(w))) return { ok: false, error: 'That name is not allowed' };
  const words = name.split(/[_.\-\d]+/).map(squash).filter(Boolean);
  if (RESERVED_ANYWHERE.some((w) => s.includes(w)) || RESERVED_WORD.some((w) => s === w || words.includes(w))) return { ok: false, error: 'That name is reserved' };
  return { ok: true, name, key: name.toLowerCase() };
}

export function validatePin(raw) {
  const pin = String(raw ?? '');
  if (!/^\d{6,12}$/.test(pin)) return { ok: false, error: 'PIN must be 6 to 12 digits' };
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return { ok: false, error: 'Pick a less obvious PIN' };
  return { ok: true, pin };
}
