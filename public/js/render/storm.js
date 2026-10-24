// The purple storm wall, sized from the sim's storm circle each frame. A shader
// scrolls streaks up the wall and brightens it near the ground, so it reads as
// a churning front instead of a flat tinted cylinder.
import * as THREE from 'three';

export class StormView {
  constructor(scene) {
    const geo = new THREE.CylinderGeometry(1, 1, 400, 96, 8, true);
    geo.translate(0, 150, 0);
    this.uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color('#a64dff') }, uEdge: { value: new THREE.Color('#e3b8ff') } };
    this.wall = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform vec3 uEdge; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          float a = vUv.x * 60.0;
          float streak = n(vec2(a, vUv.y * 4.0 - uTime * 0.35)) * 0.6 + n(vec2(a * 2.3, vUv.y * 9.0 - uTime * 0.7)) * 0.4;
          float low = 1.0 - smoothstep(0.0, 0.55, vUv.y);
          float alpha = 0.2 + streak * 0.28 + low * 0.25;
          vec3 c = mix(uColor, uEdge, streak * 0.5 + low * 0.4);
          gl_FragColor = vec4(c, alpha);
        }`,
    }));
    this.wall.renderOrder = 5;
    scene.add(this.wall);
  }

  sync(storm, time = 0) {
    const r = Math.max(0.5, storm.radius);
    this.wall.scale.set(r, 1, r);
    this.wall.position.set(storm.center.x, -20, storm.center.y);
    this.uniforms.uTime.value = time;
  }
}
