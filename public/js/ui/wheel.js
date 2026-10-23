// The in-game emote wheel: six wedges around the cursor, picked by mouse
// direction while the emote key is held. Pure DOM, no three.js.
import { item } from '/shared/cosmetics/catalog.js';

let el = null;

function build() {
  el = document.createElement('div');
  el.id = 'emote-wheel';
  el.className = 'hidden';
  el.innerHTML = Array.from({ length: 6 }, (_, i) => `<div class="wedge w${i}" data-i="${i}"><span></span></div>`).join('') + '<div class="wheel-hub"></div>';
  document.body.appendChild(el);
}

export function showWheel(w, ids) {
  if (!el) build();
  if (!w) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.querySelectorAll('.wedge').forEach((node, i) => {
    const it = ids[i] && item(ids[i]);
    node.firstChild.textContent = it ? it.name : 'Empty';
    node.classList.toggle('sel', w.sel === i);
    node.classList.toggle('empty', !it);
  });
  const hub = el.querySelector('.wheel-hub');
  hub.style.transform = `translate(${w.x * 0.5}px, ${w.y * 0.5}px)`;
}
