// Account widget and sign-in dialog. Guests can play everything; an account
// keeps coins, items and stats. If the server's database is down the widget
// says so instead of failing silently.

import { toast } from './toast.js';

const $ = (s) => document.querySelector(s);

export const account = { profile: null, down: false, listeners: [] };

function render() {
  const p = account.profile;
  $('#account-name').textContent = p ? p.user.username : (account.down ? "Can't reach the server right now" : 'Guest');
  $('#account-btn').textContent = p ? 'SIGN OUT' : 'SIGN IN';
  $('#account-btn').classList.toggle('hidden', account.down && !p);
  const coins = $('#account-coins');
  coins.classList.toggle('hidden', !p);
  if (p) coins.textContent = `${p.wallet.coins} coins`;
  const name = $('#player-name');
  if (name) {
    name.disabled = !!p;
    if (p) name.value = p.user.username;
  }
  for (const fn of account.listeners) fn(p);
}

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

export async function refreshAccount() {
  try {
    const { status, data } = await api('/api/me');
    account.down = status === 503;
    account.profile = data.guest || account.down ? null : data;
    if (account.profile && data.dailyLogin > 0) toast(`Daily login: +${data.dailyLogin} Coins`, 'good');
  } catch {
    account.down = false; // offline or no server: just a guest
    account.profile = null;
  }
  render();
}

let mode = 'login';
function setMode(m) {
  mode = m;
  $('#tab-login').classList.toggle('on', m === 'login');
  $('#tab-register').classList.toggle('on', m === 'register');
  $('#auth-submit').textContent = m === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT';
  $('#auth-pin').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#auth-error').textContent = '';
}

export function openAuth(m = 'login') {
  setMode(m);
  $('#auth').classList.remove('hidden');
  $('#auth-user').focus();
}

export function initAccount() {
  $('#account-btn').addEventListener('click', async () => {
    if (account.profile) {
      await api('/api/logout', {});
      account.profile = null;
      render();
    } else openAuth('login');
  });
  $('#tab-login').addEventListener('click', () => setMode('login'));
  $('#tab-register').addEventListener('click', () => setMode('register'));
  $('#auth-cancel').addEventListener('click', () => $('#auth').classList.add('hidden'));
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { status, data } = await api(mode === 'login' ? '/api/login' : '/api/register', {
      username: $('#auth-user').value, pin: $('#auth-pin').value,
    });
    if (status === 200) {
      account.profile = data;
      $('#auth').classList.add('hidden');
      $('#auth-pin').value = '';
      render();
      refreshAccount(); // collects the daily login bonus

    } else {
      $('#auth-error').textContent = data.error || 'Something went wrong';
    }
  });
  refreshAccount();
}
