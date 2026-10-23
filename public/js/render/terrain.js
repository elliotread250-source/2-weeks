// Terrain, water and minimap rendering. The heights and landmarks themselves
// live in shared/sim/terrain.js so the server sees exactly the same island.
import * as THREE from 'three';
import { fbm, smoothstep, lerp, clamp, valueNoise } from '/shared/math/util.js';
import { WATER_LEVEL } from '/shared/config.js';
import {
  TERRAIN_SIZE, RES, STEP, heights, POIS, GROUND_COLORS, distToRoad, terrainHeight, poiAt,
} from '/shared/sim/terrain.js';

const groundColor = {};
for (const [k, v] of Object.entries(GROUND_COLORS)) groundColor[k] = new THREE.Color(v);

export function buildTerrainMesh() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color('#f3dc95');
  const wetSand = new THREE.Color('#d9bd73');
  const grassA = new THREE.Color('#5ccc46');
  const grassB = new THREE.Color('#3fae3a');
  const rock = new THREE.Color('#9a9488');
  const rockDark = new THREE.Color('#7b766d');
  const meadow = new THREE.Color('#86d957');
  const clover = new THREE.Color('#2f9a3c');
  const dirt = new THREE.Color('#a8865a');
  const foam = new THREE.Color('#f4fbff');
  const seabed = new THREE.Color('#5aa6b3');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ix = Math.round((x + TERRAIN_SIZE / 2) / STEP);
    const iz = Math.round((z + TERRAIN_SIZE / 2) / STEP);
    const h = heights[iz * (RES + 1) + ix];
    pos.setY(i, h);

    const hx = heights[iz * (RES + 1) + Math.min(RES, ix + 1)] - heights[iz * (RES + 1) + Math.max(0, ix - 1)];
    const hz = heights[Math.min(RES, iz + 1) * (RES + 1) + ix] - heights[Math.max(0, iz - 1) * (RES + 1) + ix];
    const slope = Math.sqrt(hx * hx + hz * hz) / (2 * STEP);

    const n = fbm(x * 0.05, z * 0.05, 2) * 0.5 + 0.5;
    c.copy(grassA).lerp(grassB, n);
    // Lighter meadow patches, darker clover and the odd bare dirt patch.
    const m = fbm(x * 0.013 + 40, z * 0.013 - 12, 3);
    c.lerp(meadow, smoothstep(0.15, 0.45, m) * 0.55);
    c.lerp(clover, smoothstep(-0.2, -0.5, m) * 0.5);
    c.lerp(dirt, smoothstep(0.42, 0.6, fbm(x * 0.03 - 9, z * 0.03 + 21, 2)) * 0.75);
    c.multiplyScalar(0.94 + valueNoise(x * 0.9, z * 0.9) * 0.06);
    if (h < 2.2) c.copy(sand).lerp(c, smoothstep(1.2, 2.2, h));
    if (h < 0.3) c.copy(wetSand);
    if (h < 0.35 && h > -0.5) c.lerp(foam, smoothstep(-0.5, 0.05, h) * smoothstep(0.35, 0.05, h) * 0.7);
    if (h < -0.5) c.copy(wetSand).lerp(seabed, smoothstep(-0.5, -6, h));
    c.lerp(rock, smoothstep(0.55, 0.95, slope));
    c.lerp(rockDark, smoothstep(0.95, 1.4, slope) * 0.6);
    // Worn verges along the roads.
    const rd = distToRoad(x, z);
    if (rd < 6 && h > 0.6) c.lerp(dirt, smoothstep(6, 3.5, rd) * 0.55);

    for (const p of POIS) {
      const d = Math.hypot(x - p.x, z - p.z);
      const t = smoothstep(p.pad + 6, p.pad - 4, d);
      if (t > 0) c.lerp(groundColor[p.ground], t * 0.92);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWater() {
  // Subdivided near the island so the waves have vertices to move; the far
  // ocean is a flat skirt.
  const geo = new THREE.PlaneGeometry(900, 900, 150, 150);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({
    color: '#27b3e6', transparent: true, opacity: 0.8, shininess: 110, specular: '#d8f6ff',
  });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vWave;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float w1 = sin(position.x * 0.08 + uTime * 1.3) * 0.18;
        float w2 = sin(position.z * 0.11 - uTime * 1.1) * 0.14;
        float w3 = sin((position.x + position.z) * 0.21 + uTime * 2.1) * 0.06;
        transformed.y += w1 + w2 + w3;
        vWave = w1 + w2 + w3;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWave;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb += vec3(0.10, 0.16, 0.18) * smoothstep(0.18, 0.36, vWave);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = true;
  const skirt = new THREE.Mesh(
    new THREE.RingGeometry(440, 2400, 48, 1).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: '#1f9fd6', shininess: 60, specular: '#bdeeff' }),
  );
  skirt.position.y = -0.05;
  mesh.add(skirt);
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// Paint the minimap once from the height grid.
export function paintMinimap(canvas) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * TERRAIN_SIZE;
      const z = (py / size - 0.5) * TERRAIN_SIZE;
      const h = terrainHeight(x, z);
      let r, g, b;
      if (h < WATER_LEVEL) {
        const deep = clamp(-h / 9, 0, 1);
        r = lerp(70, 20, deep); g = lerp(200, 120, deep); b = lerp(235, 200, deep);
      } else if (h < 2) {
        r = 240; g = 218; b = 150;
      } else {
        const shade = clamp(h / 40, 0, 1);
        r = lerp(95, 70, shade); g = lerp(200, 150, shade); b = lerp(75, 60, shade);
      }
      const poi = poiAt(x, z);
      if (poi && Math.hypot(x - poi.x, z - poi.z) < poi.pad - 2 && h >= WATER_LEVEL) {
        const gc = groundColor[poi.ground];
        r = lerp(r, gc.r * 255, 0.6); g = lerp(g, gc.g * 255, 0.6); b = lerp(b, gc.b * 255, 0.6);
      }
      const i = (py * size + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
