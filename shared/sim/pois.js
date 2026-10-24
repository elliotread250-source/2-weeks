// Hand-built layouts for every point of interest, plus the scattered trees,
// rocks, cars and wild chests between them. These are World methods (they use
// its builder, colliders and loot spots); they live here to keep world.js small.
import { POIS, TERRAIN_SIZE, distToRoad, biomeAt } from './terrain.js';

// Same seeded stream the World build uses; set by bindPoiRandom() at build time.
let R = null;
let rr = null;

export function bindPoiRandom(random) {
  R = random;
  rr = (a, b) => a + R() * (b - a);
}

class PoiBuilders {
  buildPrison() {
    this.sb.mat = 'brick';
    // Rebirth's landmark: a hilltop cell block inside a walled yard.
    const pp = POIS.find((q2) => q2.id === 'prison');
    const cx = pp.x, cz = pp.z;
    this.building({ x: cx, z: cz - 12, w: 46, d: 18, floors: 3, color: '#cfc8b8', trim: '#8a8172', roofColor: '#7d776d', doors: ['s', 'e', 'w'], poi: 'prison' });
    this.building({ x: cx - 30, z: cz + 12, w: 14, d: 22, floors: 2, color: '#c2b8a3', trim: '#827765', doors: ['e', 'n'], poi: 'prison' });
    this.building({ x: cx + 28, z: cz + 14, w: 16, d: 14, floors: 2, color: '#b8c4c9', trim: '#6b7a80', doors: ['w', 'n'], poi: 'prison' });
    this.perimeter(cx, cz, 104, 84, 5.5, 1.2, '#9c968a', ['n', 's', 'e', 'w']);
    this.tower(cx - 50, cz - 40, 9, '#7b7468', '#c0392b');
    this.tower(cx + 50, cz - 40, 9, '#7b7468', '#c0392b');
    this.tower(cx - 50, cz + 40, 9, '#7b7468', '#c0392b');
    this.tower(cx + 50, cz + 40, 9, '#7b7468', '#c0392b');
    // Yard: basketball court and cover.
    const g = this.ground(cx, cz + 18);
    this.sb.box(cx - 8, g + 0.01, cz + 12, cx + 8, g + 0.06, cz + 26, '#d86f3a', false);
    for (let i = 0; i < 6; i++) this.crate(cx + rr(-14, 14), cz + rr(10, 32));
    for (let i = 0; i < 4; i++) this.sb.box(cx - 18 + i * 12, g, cz + 6, cx - 15 + i * 12, g + 1.2, cz + 7, '#a7a399');
    this.lootSpots.push({ x: cx, y: g, z: cz + 20, type: 'chest', poi: 'prison' });
  }

  buildControl() {
    this.sb.mat = 'brick';
    const p = POIS.find((q2) => q2.id === 'control');
    this.building({ x: p.x, z: p.z, w: 26, d: 16, floors: 2, color: '#e3ddd0', trim: '#5c6f7b', roofColor: '#536470', doors: ['n', 's'], poi: 'control' });
    const b = this.buildings[this.buildings.length - 1];
    this.sb.cylinder(p.x + 7, b.top, p.z, 0.25, 4, '#cccccc', false);
    this.sb.sphere(p.x + 7, b.top + 4.6, p.z, 1.3, '#f2f2f2');
    this.sb.cylinder(p.x - 9, b.top, p.z - 4, 0.12, 7, '#d0d0d0', false, 6);
    this.building({ x: p.x + 20, z: p.z + 10, w: 10, d: 10, floors: 1, color: '#d8cbb5', trim: '#7d6e58', doors: ['w'], pitched: { color: '#2e86de' }, poi: 'control' });
    for (let i = 0; i < 3; i++) this.car(p.x + rr(-18, 18), p.z + rr(12, 20));
  }

  buildBio() {
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'bio');
    this.building({ x: p.x, z: p.z, w: 24, d: 16, floors: 3, color: '#f0f2f2', trim: '#2f6fb3', roofColor: '#9aa7b0', upperColor: '#e6ebee', doors: ['s', 'w'], poi: 'bio' });
    this.building({ x: p.x - 20, z: p.z + 14, w: 12, d: 12, floors: 1, color: '#e9eef0', trim: '#2f6fb3', doors: ['e'], poi: 'bio' });
    for (let i = 0; i < 5; i++) {
      const x = p.x + rr(-20, 20), z = p.z + rr(10, 22);
      if (this.free(x, z, 3.2, 3.2)) this.container(x, z);
    }
    this.sb.cylinder(p.x + 16, this.ground(p.x + 16, p.z - 4), p.z - 4, 2.2, 7, '#bfe3c9');
  }

  buildChem() {
    this.sb.mat = 'brick';
    const p = POIS.find((q2) => q2.id === 'chem');
    this.building({ x: p.x + 4, z: p.z, w: 24, d: 14, floors: 2, color: '#d9d2bf', trim: '#a0522d', roofColor: '#6f6457', doors: ['s', 'e'], poi: 'chem' });
    const g = this.ground(p.x - 14, p.z + 12);
    for (const [dx, dz] of [[-16, 12], [-10, 16], [-16, 20]]) {
      this.sb.cylinder(p.x + dx, g, p.z + dz, 2.4, 8, '#e8e8e8');
      this.sb.box(p.x + dx - 2.6, g + 8, p.z + dz - 0.2, p.x + dx + 2.6, g + 8.4, p.z + dz + 0.2, '#f39c12', false);
    }
    this.sb.box(p.x - 18, g + 5, p.z + 8, p.x + 2, g + 5.5, p.z + 8.5, '#c0c0c0', false);
    for (let i = 0; i < 4; i++) this.crate(p.x + rr(-6, 14), p.z + rr(9, 18));
  }

  buildFactory() {
    this.sb.mat = 'brick';
    const p = POIS.find((q2) => q2.id === 'factory');
    this.building({ x: p.x, z: p.z, w: 36, d: 22, floors: 1, fh: 8, color: '#b45d3a', trim: '#5a5a5a', roofColor: '#5d6d7e', doors: ['e', 'w', 's'], poi: 'factory' });
    const g = this.ground(p.x, p.z);
    this.sb.cylinder(p.x - 12, g + 8.2, p.z - 6, 1.2, 14, '#8e3b26');
    this.sb.cylinder(p.x - 6, g + 8.2, p.z - 6, 1.2, 11, '#8e3b26');
    // Mezzanine catwalk inside with a ramp up.
    this.sb.box(p.x - 8, g + 4.1, p.z + 6.5, p.x + 17, g + 4.4, p.z + 10.6, '#7f8c8d');
    this.sb.rampZ(p.x + 10, p.x + 12.4, p.z, 6.5, g + 0.2, 4.2, '#7f8c8d');
    this.lootSpots.push({ x: p.x + 2, y: g + 4.4, z: p.z + 8.5, type: 'chest', poi: 'factory' });
    this.building({ x: p.x + 4, z: p.z + 22, w: 14, d: 10, floors: 2, color: '#d5c4a1', trim: '#5a5a5a', doors: ['n', 'e'], poi: 'factory' });
    for (let i = 0; i < 6; i++) {
      const x = p.x + rr(-24, 24), z = p.z + rr(-24, -14);
      if (this.free(x, z, 3.2, 3.2)) this.container(x, z, true);
    }
    for (let i = 0; i < 3; i++) this.car(p.x + rr(20, 28), p.z + rr(-10, 12), Math.PI / 2);
  }

  buildHarbor() {
    this.sb.mat = 'brick';
    const p = POIS.find((q2) => q2.id === 'harbor');
    const g = this.ground(p.x, p.z);
    this.building({ x: p.x + 8, z: p.z - 10, w: 18, d: 12, floors: 1, fh: 6, color: '#5d8aa8', trim: '#34495e', roofColor: '#2c3e50', doors: ['s', 'w'], poi: 'harbor' });
    // Wooden docks reaching out into the bay.
    this.sb.mat = 'wood';
    for (const [dx, len] of [[-14, 30], [0, 24], [14, 34]]) {
      this.sb.box(p.x + dx - 2.5, g - 0.3, p.z + 10, p.x + dx + 2.5, g + 0.1, p.z + 10 + len, '#a0703f');
      for (let k = 0; k <= len; k += 6) {
        this.sb.box(p.x + dx - 2.6, -6, p.z + 10 + k - 0.2, p.x + dx - 2.2, g - 0.3, p.z + 10 + k + 0.2, '#6e4b2a', false);
        this.sb.box(p.x + dx + 2.2, -6, p.z + 10 + k - 0.2, p.x + dx + 2.6, g - 0.3, p.z + 10 + k + 0.2, '#6e4b2a', false);
      }
      this.lootSpots.push({ x: p.x + dx, y: g + 0.1, z: p.z + 10 + len - 3, type: R() < 0.5 ? 'chest' : 'floor', poi: 'harbor' });
    }
    // Container stacks.
    for (let row = 0; row < 3; row++) {
      for (let col2 = 0; col2 < 3; col2++) {
        const x = p.x - 18 + col2 * 7, z = p.z - 14 + row * 4;
        if (!this.free(x, z, 3.1, 1.3)) continue;
        this.container(x, z, true);
        if (R() < 0.45) this.container(x, z, true, g + 2.6);
      }
    }
    // Dock crane.
    this.sb.mat = 'metal';
    this.sb.box(p.x + 20, g, p.z + 4, p.x + 21.2, g + 18, p.z + 5.2, '#f1c40f');
    this.sb.box(p.x + 20.6 - 1, g + 17, p.z - 4, p.x + 20.6 + 1, g + 18.2, p.z + 26, '#f1c40f', false);
  }

  buildLiving() {
    this.sb.mat = 'wood';
    // Pleasant Park energy: a ring of colourful two-storey houses.
    const p = POIS.find((q2) => q2.id === 'living');
    const roofs = ['#e74c3c', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085'];
    const walls = ['#f5e6c8', '#e8d5b9', '#f0f0e6', '#dfe7ec', '#f3d9d0', '#e7efd8'];
    const spots = [[-18, -14], [0, -18], [18, -14], [-18, 14], [0, 18], [18, 14]];
    spots.forEach(([dx, dz], i) => {
      this.building({
        x: p.x + dx, z: p.z + dz, w: 11, d: 10, floors: 2, fh: 3.8, color: walls[i], trim: '#7f6a55',
        floorColor: '#b7966e', doors: [dz < 0 ? 's' : 'n'], pitched: { color: roofs[i], rise: 3 }, roofAccess: false, poi: 'living',
      });
    });
    const g = this.ground(p.x, p.z);
    this.sb.box(p.x - 3, g, p.z - 3, p.x + 3, g + 0.4, p.z + 3, '#8fd16a');
    this.sb.cylinder(p.x, g + 0.4, p.z, 0.3, 4.5, '#7f8c8d', true, 8);
    for (let i = 0; i < 4; i++) this.car(p.x + rr(-24, 24), p.z + rr(-4, 4), Math.PI / 2);
    this.lootSpots.push({ x: p.x + 4, y: g, z: p.z, type: 'chest', poi: 'living' });
  }

  buildHQ() {
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'hq');
    this.building({ x: p.x, z: p.z, w: 24, d: 18, floors: 3, color: '#cdd5da', trim: '#2c3e50', roofColor: '#4b5563', upperColor: '#b9c6cf', doors: ['w', 's'], poi: 'hq' });
    const b = this.buildings[this.buildings.length - 1];
    this.sb.box(p.x - 5, b.top, p.z - 2, p.x + 5, b.top + 0.08, p.z + 6, '#f1c40f', false);
    this.sb.box(p.x - 3.6, b.top + 0.08, p.z - 0.6, p.x + 3.6, b.top + 0.12, p.z + 4.6, '#2c3e50', false);
    for (let i = 0; i < 3; i++) this.car(p.x - 20, p.z + rr(-10, 14), 0);
  }

  buildDecon() {
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'decon');
    for (const [dx, dz] of [[-10, -6], [6, -8], [-4, 10]]) {
      const x = p.x + dx, z = p.z + dz, g = this.ground(x, z);
      for (const [ox, oz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
        this.sb.box(x + ox - 0.12, g, z + oz - 0.12, x + ox + 0.12, g + 2.8, z + oz + 0.12, '#dcdcdc');
      }
      this.sb.pyramid(x - 4, z - 4, x + 4, z + 4, g + 2.8, 2.2, '#f7f7f7');
      this.lootSpots.push({ x, y: g, z, type: R() < 0.5 ? 'chest' : 'floor', poi: 'decon' });
    }
    for (let i = 0; i < 7; i++) {
      const x = p.x + rr(-20, 20), z = p.z + rr(-20, 20);
      if (this.free(x, z, 3.3, 3.3)) this.container(x, z);
    }
    for (let i = 0; i < 6; i++) {
      const x = p.x + rr(-18, 18), z = p.z + rr(-18, 18), g = this.ground(x, z);
      if (this.free(x, z, 1.6, 0.5)) this.sb.box(x - 1.5, g, z - 0.4, x + 1.5, g + 1.1, z + 0.4, '#e2b13c');
    }
  }

  buildShore() {
    this.sb.mat = 'wood';
    const p = POIS.find((q2) => q2.id === 'shore');
    const huts = ['#f8c471', '#76d7c4', '#f1948a'];
    [-14, 0, 14].forEach((dx, i) => {
      this.building({ x: p.x + dx, z: p.z - 6, w: 8, d: 8, floors: 1, fh: 3.6, color: huts[i], trim: '#a0703f', doors: ['s'], pitched: { color: '#a0703f', rise: 2 }, roofAccess: false, poi: 'shore' });
    });
    const g = this.ground(p.x, p.z + 8);
    for (let i = 0; i < 4; i++) {
      const x = p.x + rr(-16, 16), z = p.z + rr(6, 12);
      this.sb.cylinder(x, g, z, 0.06, 2.4, '#ffffff', false, 6);
      this.sb.cone(x, g + 2.6, z, 1.6, 0.7, 8, ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'][i]);
    }
    // Lifeguard tower.
    this.tower(p.x + 26, p.z + 4, 4.5, '#ffffff', '#e74c3c');
  }

  buildSecurity() {
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'security');
    this.building({ x: p.x, z: p.z, w: 18, d: 12, floors: 2, color: '#a9b7c0', trim: '#2f3e46', roofColor: '#3d4b53', doors: ['s', 'e'], poi: 'security' });
    this.building({ x: p.x + 18, z: p.z + 10, w: 6, d: 6, floors: 1, color: '#f4d03f', trim: '#2f3e46', doors: ['w'], windows: true, roofAccess: false, poi: 'security' });
    for (let i = 0; i < 4; i++) {
      const x = p.x + rr(-16, 16), z = p.z + rr(10, 18);
      if (this.free(x, z, 3.2, 3.2)) this.container(x, z);
    }
  }

  buildConstruction() {
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'construction');
    this.building({ x: p.x, z: p.z, w: 20, d: 14, floors: 3, color: '#b0a89a', trim: '#8c857a', floorColor: '#9e978b', roofColor: '#9e978b', walls: false, parapet: false, poi: 'construction' });
    const g = this.ground(p.x, p.z);
    // Tower crane.
    this.sb.box(p.x + 14, g, p.z - 10, p.x + 15.4, g + 26, p.z - 8.6, '#f39c12');
    this.sb.box(p.x - 6, g + 25, p.z - 10, p.x + 24, g + 26.4, p.z - 8.6, '#f39c12', false);
    this.sb.box(p.x + 20, g + 18, p.z - 9.8, p.x + 22, g + 19.5, p.z - 8.8, '#7f8c8d', false);
    for (let i = 0; i < 8; i++) this.crate(p.x + rr(-14, 14), p.z + rr(9, 16));
    for (let i = 0; i < 2; i++) this.container(p.x + rr(-14, -10), p.z + rr(-14, -9), true);
  }


  // ---------------------------------------------------------------- new biomes

  buildFrost() {
    this.sb.mat = 'wood';
    const p = POIS.find((q2) => q2.id === 'frost');
    // A ski lodge with a long pitched roof, a gondola station and a few cabins.
    this.building({ x: p.x, z: p.z, w: 22, d: 14, floors: 2, fh: 3.8, color: '#8a5a3c', trim: '#f4f8fa', floorColor: '#b78a5e', doors: ['s', 'e'], pitched: { color: '#eef4f8', rise: 4 }, roofAccess: false, poi: 'frost' });
    for (const [dx, dz, c] of [[-22, 10, '#9c6b45'], [20, 12, '#7d4f33'], [-20, -14, '#a1744e']]) {
      this.building({ x: p.x + dx, z: p.z + dz, w: 8, d: 8, floors: 1, fh: 3.6, color: c, trim: '#f4f8fa', doors: ['s'], pitched: { color: '#eef4f8', rise: 2.4 }, roofAccess: false, poi: 'frost' });
    }
    const g = this.ground(p.x + 8, p.z - 18);
    // Gondola station: two pylons and a platform.
    this.sb.mat = 'metal';
    this.sb.box(p.x + 6, g, p.z - 20, p.x + 8, g + 14, p.z - 18, '#9aa7b0');
    this.sb.box(p.x + 22, g, p.z - 20, p.x + 24, g + 14, p.z - 18, '#9aa7b0');
    this.sb.box(p.x + 4, g + 13, p.z - 20.6, p.x + 26, g + 13.4, p.z - 17.4, '#c0392b', false);
    for (let i = 0; i < 5; i++) this.crate(p.x + rr(-10, 12), p.z + rr(10, 18));
    this.lootSpots.push({ x: p.x, y: this.ground(p.x, p.z + 9), z: p.z + 9, type: 'chest', poi: 'frost' });
  }

  buildMines() {
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'mines');
    // A mine shaft cut into the ridge: timber frame, ore carts, a processing shed on stilts.
    const g = this.ground(p.x, p.z);
    this.sb.mat = 'wood';
    this.sb.box(p.x - 5, g, p.z + 8, p.x - 3.5, g + 5, p.z + 9.5, '#6e4b2a');
    this.sb.box(p.x + 3.5, g, p.z + 8, p.x + 5, g + 5, p.z + 9.5, '#6e4b2a');
    this.sb.box(p.x - 5.5, g + 5, p.z + 7.8, p.x + 5.5, g + 6, p.z + 9.7, '#6e4b2a');
    this.building({ x: p.x - 4, z: p.z - 8, w: 16, d: 10, floors: 2, color: '#6f6a62', trim: '#3e3a35', roofColor: '#4a4741', doors: ['s'], poi: 'mines' });
    this.sb.mat = 'metal';
    this.building({ x: p.x + 16, z: p.z + 2, w: 10, d: 8, floors: 1, color: '#b0a89a', trim: '#6b655b', doors: ['w'], pitched: { color: '#7a7d80', rise: 2 }, roofAccess: false, poi: 'mines' });
    for (let i = 0; i < 6; i++) this.sb.box(p.x - 16 + i * 4, g, p.z + 14, p.x - 14 + i * 4, g + 1.2, p.z + 15.4, '#555a5e');
    for (let i = 0; i < 4; i++) this.rock(p.x + rr(-20, 20), p.z + rr(12, 22));
    this.lootSpots.push({ x: p.x, y: g, z: p.z + 3, type: 'chest', poi: 'mines' });
    this.lootSpots.push({ x: p.x + 14, y: g, z: p.z - 4, type: 'floor', poi: 'mines' });
  }

  buildMesa() {
    this.sb.mat = 'brick';
    const p = POIS.find((q2) => q2.id === 'mesa');
    // A flat-topped plateau with an adobe fort on top and a switchback of ramps up one side.
    this.building({ x: p.x, z: p.z, w: 20, d: 16, floors: 2, color: '#d9a066', trim: '#a8693a', roofColor: '#c78850', doors: ['s', 'w'], poi: 'mesa' });
    this.building({ x: p.x + 17, z: p.z + 10, w: 9, d: 9, floors: 1, color: '#e0b27a', trim: '#a8693a', doors: ['w'], roofAccess: false, poi: 'mesa' });
    this.tower(p.x - 16, p.z - 12, 8, '#c78850', '#a8693a');
    this.tower(p.x + 16, p.z - 12, 8, '#c78850', '#a8693a');
    const g = this.ground(p.x, p.z + 14);
    for (let i = 0; i < 6; i++) this.crate(p.x + rr(-14, 14), p.z + rr(12, 20));
    this.sb.cylinder(p.x - 6, g, p.z + 16, 2, 6, '#8d6e4a');
    this.lootSpots.push({ x: p.x, y: g, z: p.z + 12, type: 'chest', poi: 'mesa' });
  }

  buildRanch() {
    this.sb.mat = 'wood';
    const p = POIS.find((q2) => q2.id === 'ranch');
    this.building({ x: p.x, z: p.z, w: 18, d: 12, floors: 2, fh: 3.8, color: '#a8452f', trim: '#f0e6d2', floorColor: '#b98a52', doors: ['s', 'n'], pitched: { color: '#6e3a2a', rise: 3.4 }, roofAccess: false, poi: 'ranch' });
    // Big barn and a windmill.
    this.building({ x: p.x - 24, z: p.z + 6, w: 16, d: 20, floors: 2, fh: 4.5, color: '#8c2f23', trim: '#f0e6d2', floorColor: '#b98a52', doors: ['e'], pitched: { color: '#5e2a21', rise: 4.5 }, roofAccess: false, poi: 'ranch' });
    const wx = p.x + 22, wz = p.z - 6, g = this.ground(wx, wz);
    this.sb.mat = 'metal';
    this.sb.cylinder(wx, g, wz, 1.4, 12, '#9aa0a6');
    this.sb.box(wx - 5, g + 11.4, wz - 0.2, wx + 5, g + 12, wz + 0.2, '#d9d4c7', false);
    this.sb.box(wx - 0.2, g + 7, wz - 0.2, wx + 0.2, g + 17, wz + 0.2, '#d9d4c7', false);
    // Fenced corral with hay.
    for (let i = 0; i < 8; i++) this.sb.box(p.x + 8 + i * 2.2, this.ground(p.x + 8 + i * 2.2, p.z + 14), p.z + 14, p.x + 8.2 + i * 2.2, this.ground(p.x + 8 + i * 2.2, p.z + 14) + 1.2, p.z + 14.2, '#7d5a36', false);
    for (let i = 0; i < 4; i++) this.crate(p.x + rr(-6, 14), p.z + rr(-14, -8));
    for (let i = 0; i < 2; i++) this.car(p.x + rr(-8, 8), p.z + rr(16, 22), 0);
    this.lootSpots.push({ x: p.x, y: this.ground(p.x, p.z + 8), z: p.z + 8, type: 'chest', poi: 'ranch' });
  }

  buildRuins() {
    this.sb.mat = 'brick';
    const p = POIS.find((q2) => q2.id === 'ruins');
    // A collapsed temple: broken walls, a central stepped platform and overgrowth.
    this.building({ x: p.x, z: p.z, w: 20, d: 20, floors: 2, color: '#8a9a82', trim: '#5a6b54', roofColor: '#6f7f68', doors: ['s', 'e', 'n'], walls: true, poi: 'ruins' });
    const g = this.ground(p.x, p.z);
    for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
      const h = rr(2.5, 6);
      this.sb.cylinder(p.x + dx, this.ground(p.x + dx, p.z + dz), p.z + dz, 1.1, h, '#98a890');
    }
    for (let i = 0; i < 5; i++) {
      const x = p.x + rr(-24, 24), z = p.z + rr(-24, 24);
      if (this.free(x, z, 2, 1)) { const gg = this.ground(x, z); this.sb.box(x - 2, gg, z - 0.5, x + 2, gg + rr(1, 3), z + 0.5, '#7d8b76'); }
    }
    for (let i = 0; i < 6; i++) this.tree(p.x + rr(-28, 28), p.z + rr(-28, 28), 'round');
    this.lootSpots.push({ x: p.x, y: g, z: p.z + 4, type: 'chest', poi: 'ruins' });
    this.lootSpots.push({ x: p.x + 8, y: g, z: p.z - 6, type: 'chest', poi: 'ruins' });
  }

  buildLighthouse() {
    this.sb.mat = 'brick';
    // On the west coast: walk in from the sea until the ground is dry and not too steep.
    const z = -105;
    let x = -TERRAIN_SIZE / 2 + 20;
    while (x < 0 && this.ground(x, z) < 2.2) x += 2;
    const g = this.ground(x, z);
    if (g < 1) return;
    this.sb.cylinder(x, g, z, 3, 16, '#f5f5f5');
    this.sb.cylinder(x, g + 5, z, 3.05, 2.5, '#e74c3c', false);
    this.sb.cylinder(x, g + 11, z, 3.05, 2.5, '#e74c3c', false);
    this.sb.box(x - 3.5, g + 16, z - 3.5, x + 3.5, g + 16.3, z + 3.5, '#34495e');
    this.sb.cylinder(x, g + 16.3, z, 1.6, 2.2, '#f9e79f', false);
    this.sb.pyramid(x - 2.2, z - 2.2, x + 2.2, z + 2.2, g + 18.5, 1.6, '#e74c3c');
    this.lootSpots.push({ x: x + 2.4, y: g + 16.3, z, type: 'chest', poi: 'lighthouse' });
  }

  scatterNature() {
    let trees = 0, rocks = 0, cars = 0;
    for (let tries = 0; tries < 16000 && (trees < 720 || rocks < 190); tries++) {
      const x = rr(-TERRAIN_SIZE / 2 + 20, TERRAIN_SIZE / 2 - 20);
      const z = rr(-TERRAIN_SIZE / 2 + 20, TERRAIN_SIZE / 2 - 20);
      const h = this.ground(x, z);
      if (h < 2.5) continue;
      if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.pad + 3)) continue;
      if (distToRoad(x, z) < 5) continue;
      const slope = Math.abs(this.ground(x + 1, z) - this.ground(x - 1, z)) + Math.abs(this.ground(x, z + 1) - this.ground(x, z - 1));
      if (slope > 2.2) continue;
      if (!this.free(x, z, 1.6, 1.6)) continue;
      // Deserts are sparse: thin out the cacti so the dunes read as open ground.
      if (biomeAt(x, z) === 'desert' && R() < 0.55) continue;
      if (rocks < 190 && R() < 0.22) { this.rock(x, z); rocks++; }
      else if (trees < 720) { this.tree(x, z); trees++; }
    }
    // A few abandoned cars along the "roads" between POIs.
    for (let i = 0; i < 90 && cars < 26; i++) {
      const a = POIS[Math.floor(R() * POIS.length)], b = POIS[Math.floor(R() * POIS.length)];
      if (a === b) continue;
      const t = rr(0.3, 0.7);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (this.ground(x, z) < 2) continue;
      if (this.car(x, z, Math.atan2(b.x - a.x, b.z - a.z))) cars++;
    }
  }

  scatterWildLoot() {
    // Chests hidden out in the trees, like Fortnite's off-POI chests.
    let n = 0;
    for (let tries = 0; tries < 1400 && n < 44; tries++) {
      const x = rr(-285, 285), z = rr(-265, 265);
      const g = this.ground(x, z);
      if (g < 3) continue;
      if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.pad + 8)) continue;
      if (!this.free(x, z, 1, 1)) continue;
      this.lootSpots.push({ x, y: g, z, type: n % 3 === 0 ? 'ammo' : 'chest', poi: null });
      n++;
    }
  }
}

export function attachPois(World) {
  for (const name of Object.getOwnPropertyNames(PoiBuilders.prototype)) {
    if (name !== 'constructor') World.prototype[name] = PoiBuilders.prototype[name];
  }
}
