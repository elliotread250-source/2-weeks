// Third-person camera: over-the-shoulder follow with a collision spring arm,
// ADS zoom, sniper scope, bus and skydive views and spectating. Pure client:
// it reads the sim but never changes it.
import * as THREE from 'three';
import { WEAPONS } from '/shared/config.js';

const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.camera.rotation.order = 'YXZ';
  }

  // lp: interpolated position of the local fighter. busPos/spectate optional.
  update(f, lp, yaw, pitch, ctx) {
    const cam = this.camera;
    const { match, spectate } = ctx;
    let pivot, dist, shoulder, fov = 75;
    const lpv = new THREE.Vector3(lp.x, lp.y, lp.z);

    if (match.phase === 'bus' && f.state === 'bus') {
      const b = match.bus.pos;
      pivot = new THREE.Vector3(b.x, b.y + 5, b.z);
      dist = 34; shoulder = 0;
    } else if (!f.alive) {
      const t = spectate && spectate.alive ? spectate.pos : f.pos;
      pivot = new THREE.Vector3(t.x, t.y + 1.6, t.z);
      dist = 9; shoulder = 0;
    } else if (f.airborne) {
      pivot = lpv.clone().add(new THREE.Vector3(0, 1.4, 0));
      dist = 6.5; shoulder = 0;
      fov = f.state === 'skydive' ? 85 : 78;
    } else {
      pivot = lpv.clone().add(new THREE.Vector3(0, 1.65, 0));
      dist = 3.4; shoulder = 0.75;
      if (f.ads) {
        dist = 1.9; shoulder = 0.62;
        fov = 75 / WEAPONS[f.weapon.type].zoom;
      }
      if (f.buildMode || f.editMode) dist = 3.8;
    }

    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dir = new THREE.Vector3(-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    if (f.scoped) {
      // First-person scope view.
      cam.position.copy(lpv).add(new THREE.Vector3(0, 1.75, 0)).addScaledVector(dir, 0.3);
      fov = 75 / WEAPONS.sniper.zoom;
    } else {
      const start = pivot.clone().addScaledVector(right, shoulder * 0.5);
      const desired = pivot.clone().addScaledVector(right, shoulder).addScaledVector(dir, -dist).addScaledVector(UP, 0.25);
      const toCam = desired.clone().sub(start);
      const len = toCam.length();
      toCam.normalize();
      const hit = match.collision.raycast(start, toCam, len);
      if (hit) desired.copy(start).addScaledVector(toCam, Math.max(0.3, hit.t - 0.25));
      cam.position.copy(desired);
    }
    cam.rotation.set(pitch, yaw, 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * 0.35;
      cam.updateProjectionMatrix();
    }
    this.pos.copy(cam.position);
    this.dir.copy(dir);
  }
}
