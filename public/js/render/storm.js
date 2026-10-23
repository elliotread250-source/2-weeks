// The purple storm wall, sized from the sim's storm circle each frame.
import * as THREE from 'three';

export class StormView {
  constructor(scene) {
    const geo = new THREE.CylinderGeometry(1, 1, 400, 96, 1, true);
    geo.translate(0, 150, 0);
    this.wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: '#a64dff', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.wall.renderOrder = 5;
    scene.add(this.wall);
  }

  sync(storm) {
    const r = Math.max(0.5, storm.radius);
    this.wall.scale.set(r, 1, r);
    this.wall.position.set(storm.center.x, -20, storm.center.y);
  }
}
