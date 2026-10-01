// Entry point: lobby -> match.
import { Game } from './game.js';
import { initAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
let game = null;

$('#play-btn').addEventListener('click', () => {
  initAudio();
  $('#loading').classList.add('show');
  // Let the loading screen paint before the island builds.
  setTimeout(() => {
    try {
      game = new Game($('#app'), { shadows: $('#graphics').checked });
      window.__game = game;
      game.controller.sens = parseFloat($('#sens').value) || 1;
      $('#lobby').classList.add('hidden');
      $('#loading').classList.remove('show');
      game.start();
    } catch (err) {
      console.error(err);
      $('#loading').textContent = `Failed to start: ${err.message}`;
    }
  }, 50);
});

$('#resume-btn').addEventListener('click', () => game && game.controller.lock());
$('#quit-btn').addEventListener('click', () => location.reload());
$('#again-btn').addEventListener('click', () => location.reload());
