// Epic-only post processing: a gentle bloom and a colour grade. Loaded lazily
// so lower presets never download the addons. Any failure returns null and the
// game renders directly, so post FX can never stop a match from starting.
import * as THREE from 'three';

export async function createPost(renderer, scene, camera) {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    const size = renderer.getSize(new THREE.Vector2());
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(size, 0.28, 0.6, 0.88));
    // Warm highlights, slightly richer colour, soft vignette.
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          c.rgb = mix(vec3(l), c.rgb, 1.12);
          c.rgb *= mix(vec3(1.0), vec3(1.04, 1.0, 0.95), smoothstep(0.55, 1.0, l));
          vec2 d = vUv - 0.5;
          c.rgb *= 1.0 - dot(d, d) * 0.55;
          gl_FragColor = c;
        }`,
    }));
    composer.addPass(new OutputPass());
    return {
      render: () => composer.render(),
      resize: (w, h) => composer.setSize(w, h),
      setPixelRatio: (r) => composer.setPixelRatio(r),
    };
  } catch (e) {
    console.warn('post processing unavailable:', e.message);
    return null;
  }
}
