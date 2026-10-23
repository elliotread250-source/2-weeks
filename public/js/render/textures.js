// Procedural canvas textures, so the repo ships with zero image assets.
import * as THREE from 'three';

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function woodTex() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#b5763d';
    g.fillRect(0, 0, s, s);
    const planks = 4;
    for (let i = 0; i < planks; i++) {
      const y = (i * s) / planks;
      g.fillStyle = i % 2 ? '#c4864a' : '#a96c35';
      g.fillRect(0, y + 2, s, s / planks - 4);
      g.strokeStyle = 'rgba(80,40,10,0.35)';
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        const yy = y + 6 + k * 6;
        g.moveTo(0, yy);
        g.bezierCurveTo(s * 0.3, yy + 3, s * 0.6, yy - 3, s, yy + 1);
        g.stroke();
      }
    }
    g.strokeStyle = '#5a3414';
    g.lineWidth = 6;
    g.strokeRect(3, 3, s - 6, s - 6);
    g.fillStyle = '#4a2a10';
    for (const [x, y] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  });
}

function brickTex() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#d8cfc0';
    g.fillRect(0, 0, s, s);
    const rows = 8, bw = s / 4, bh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < 5; c++) {
        const shade = 150 + ((r * 7 + c * 13) % 5) * 10;
        g.fillStyle = `rgb(${shade + 40},${shade - 70},${shade - 95})`;
        g.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
    g.strokeStyle = '#7d756a';
    g.lineWidth = 5;
    g.strokeRect(2, 2, s - 4, s - 4);
  });
}

function metalTex() {
  return canvasTex(128, (g, s) => {
    const grad = g.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#a9b3bd');
    grad.addColorStop(1, '#7c8792');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x, 0, 4, s);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(x + 8, 0, 4, s);
    }
    g.strokeStyle = '#4c555e';
    g.lineWidth = 8;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.fillStyle = '#d6dde3';
    for (let i = 12; i < s; i += 26) {
      for (const y of [10, s - 10]) { g.beginPath(); g.arc(i, y, 3, 0, Math.PI * 2); g.fill(); }
    }
  });
}

function blueprintTex() {
  return canvasTex(64, (g, s) => {
    g.fillStyle = 'rgba(80,170,255,0.35)';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(200,235,255,0.95)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, s - 3, s - 3);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(200,235,255,0.5)';
    g.beginPath();
    g.moveTo(s / 2, 0); g.lineTo(s / 2, s);
    g.moveTo(0, s / 2); g.lineTo(s, s / 2);
    g.stroke();
  });
}

let cache = null;
export function getTextures() {
  if (cache) return cache;
  cache = {
    wood: woodTex(),
    brick: brickTex(),
    metal: metalTex(),
    blueprint: blueprintTex(),
  };
  return cache;
}

// Soft round sprite used for muzzle flashes, sparks and loot glints.
export function glowTexture(color = '#ffffff') {
  return canvasTex(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.4, color + 'aa');
    grad.addColorStop(1, color + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

// Blue harvesting weak point, like Fortnite's critical hit target.
export function weakPointTexture() {
  return canvasTex(64, (g, s) => {
    g.strokeStyle = '#7fe3ff';
    g.lineWidth = 7;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(80,200,255,0.55)';
    g.beginPath(); g.arc(s / 2, s / 2, s / 4, 0, Math.PI * 2); g.fill();
  });
}
