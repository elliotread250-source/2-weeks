// Entry point: lobby, settings/keybinds screen, then the match.
import { Game } from '../client/game.js';
import { NetHost } from '../client/nethost.js';
import { initAccount } from './account.js';
import { initAudio } from '../audio/audio.js';
import { ACTIONS, binds, settings, setBind, resetBinds, setSetting, keyLabel, label } from '../client/binds.js';

const $ = (s) => document.querySelector(s);
let game = null;
let listening = null; // action currently waiting for a new key
let swallowClick = false; // the mouse press that set a bind shouldn't re-open listening

// ---------------------------------------------------------------- lobby summary

function renderControls() {
  const rows = [
    [`${label('forward')} ${label('left')} ${label('back')} ${label('right')}`, 'Move'],
    [label('sprint'), 'Sprint'],
    [label('jump'), 'Jump / leave bus / open glider'],
    [`${label('fire')} / ${label('aim')}`, 'Fire or place / aim down sights'],
    [label('pickaxe'), 'Pickaxe'],
    [['slot1', 'slot2', 'slot3', 'slot4', 'slot5'].map(label).join(' '), 'Inventory slots (or mouse wheel)'],
    [label('build'), 'Toggle build mode'],
    [['wall', 'floor', 'ramp', 'cone'].map(label).join(' '), 'Wall, floor, ramp, cone'],
    [`${label('matCycle')} / ${label('aim')}`, 'Change material (build mode)'],
    [label('edit'), settings.confirmEditOnRelease
      ? `Edit: hold ${label('fire')} over tiles, let go to confirm. ${label('editReset')} resets`
      : `Edit: click tiles, ${label('edit')} again to confirm. ${label('editReset')} resets`],
    [label('interact'), 'Pick up / hold to open chests'],
    [label('reload'), 'Reload'],
    [label('map'), 'Map'],
  ];
  $('#controls-table').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}

// ---------------------------------------------------------------- settings screen

function renderBinds() {
  const counts = {};
  for (const a of ACTIONS) counts[binds[a.id]] = (counts[binds[a.id]] || 0) + 1;
  // Aim and reset-edit share right click on purpose (they never clash).
  const sharedOk = (a) => (a.id === 'aim' || a.id === 'editReset') && binds.aim === binds.editReset && counts[binds[a.id]] === 2;
  let html = '';
  let group = '';
  for (const a of ACTIONS) {
    if (a.group !== group) { group = a.group; html += `<div class="bind-group">${group}</div>`; }
    const dupe = counts[binds[a.id]] > 1 && !sharedOk(a);
    const cls = `bind-key${listening === a.id ? ' listening' : ''}${dupe ? ' dupe' : ''}`;
    const text = listening === a.id ? 'Press a key...' : keyLabel(binds[a.id]);
    html += `<div class="bind-row"><span>${a.label}</span><button class="${cls}" data-action="${a.id}" title="${dupe ? 'Also bound to another action' : 'Click to rebind'}">${text}</button></div>`;
  }
  $('#bind-list').innerHTML = html;
}

function openSettings() {
  $('#sens').value = settings.sensitivity;
  $('#sens-out').textContent = Number(settings.sensitivity).toFixed(2);
  $('#shake').value = settings.shake ?? 1;
  $('#confirm-release').checked = !!settings.confirmEditOnRelease;
  $('#graphics').checked = settings.shadows !== false;
  $('#detail').value = settings.detail || 'high';
  listening = null;
  renderBinds();
  $('#settings').classList.remove('hidden');
  if (game) game.rebinding = false;
}

function closeSettings() {
  listening = null;
  if (game) game.rebinding = false;
  $('#settings').classList.add('hidden');
  renderControls();
initAccount();
}

function finishListen(code) {
  if (!listening) return;
  if (code) setBind(listening, code);
  listening = null;
  if (game) game.rebinding = false;
  renderBinds();
}

$('#bind-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.bind-key');
  if (swallowClick) { swallowClick = false; return; }
  if (!btn || listening) return;
  listening = btn.dataset.action;
  if (game) game.rebinding = true;
  renderBinds();
});

// Capture the next key or mouse button while listening.
window.addEventListener('keydown', (e) => {
  if (!listening) return;
  e.preventDefault();
  e.stopPropagation();
  finishListen(e.code === 'Escape' ? null : e.code);
}, true);
window.addEventListener('mousedown', (e) => {
  if (!listening) return;
  // The click that started listening already finished, so this is the next press.
  e.preventDefault();
  e.stopPropagation();
  swallowClick = true;
  setTimeout(() => { swallowClick = false; }, 400);
  finishListen(`Mouse${e.button}`);
}, true);
window.addEventListener('contextmenu', (e) => { if (!$('#settings').classList.contains('hidden')) e.preventDefault(); });

$('#sens').addEventListener('input', (e) => {
  setSetting('sensitivity', parseFloat(e.target.value) || 1);
  $('#sens-out').textContent = Number(settings.sensitivity).toFixed(2);
});
$('#shake').addEventListener('input', (e) => setSetting('shake', parseFloat(e.target.value)));
$('#confirm-release').addEventListener('change', (e) => setSetting('confirmEditOnRelease', e.target.checked));
$('#graphics').addEventListener('change', (e) => setSetting('shadows', e.target.checked));
$('#detail').addEventListener('change', (e) => setSetting('detail', e.target.value));
$('#binds-reset').addEventListener('click', () => { resetBinds(); renderBinds(); });
$('#settings-btn').addEventListener('click', openSettings);
$('#pause-settings-btn').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);

// ---------------------------------------------------------------- match

function launch(opts) {
  try {
    game = new Game($('#app'), { shadows: settings.shadows !== false, detail: settings.detail || 'high', ...opts });
    window.__game = game;
    $('#lobby').classList.add('hidden');
    $('#loading').classList.remove('show');
    game.start();
  } catch (err) {
    console.error(err);
    $('#loading').textContent = `Failed to start: ${err.message}`;
  }
}

$('#play-btn').addEventListener('click', () => {
  initAudio();
  $('#loading').classList.add('show');
  // Let the loading screen paint before the island builds.
  setTimeout(() => launch({}), 50);
});

// ---------------------------------------------------------------- online

const TOKEN_KEY = 'twoweeks.resume';

function wsUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

async function playOnline(resumeToken = null) {
  initAudio();
  const status = $('#online-status');
  const name = $('#player-name').value.trim();
  try { localStorage.setItem('twoweeks.name', name); } catch { /* private mode */ }
  $('#online-btn').disabled = true;
  try {
    const host = await NetHost.connect(wsUrl(), { name, resumeToken, onStatus: (t) => { status.textContent = t; } });
    try { sessionStorage.setItem(TOKEN_KEY, host.token); } catch { /* private mode */ }
    host.onClosed = () => {
      // Dropped mid-match: the server keeps our fighter for 30 s, so try to resume.
      $('#loading').textContent = 'Connection lost. Reconnecting...';
      $('#loading').classList.add('show');
      setTimeout(() => location.reload(), 2000);
    };
    status.textContent = 'Match found!';
    $('#loading').classList.add('show');
    setTimeout(() => launch({ host }), 50);
  } catch (err) {
    status.textContent = err.message;
    $('#online-btn').disabled = false;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }
}

$('#online-btn').addEventListener('click', () => playOnline());
try { $('#player-name').value = localStorage.getItem('twoweeks.name') || ''; } catch { /* private mode */ }
{
  let token = null;
  try { token = sessionStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
  if (token) playOnline(token);
}

$('#resume-btn').addEventListener('click', () => game && game.input.lock());
const leave = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } location.reload(); };
$('#quit-btn').addEventListener('click', leave);
$('#again-btn').addEventListener('click', leave);

renderControls();
initAccount();
