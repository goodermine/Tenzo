/* Greyline - renderer, sky, image-based lighting and the post chain.
   The look is built here: a Preetham sky drives both the key light and the
   environment reflections, then the frame goes through AO, bloom, filmic
   tone mapping and a grade pass. */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

/* Final grade: bleach, vignette, chromatic aberration, grain and a cheap
   camera-motion blur driven by how fast the view is turning. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVelocity: { value: new THREE.Vector2(0, 0) },
    uSaturation: { value: 0.72 },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.045 },
    uAberration: { value: 0.9 },
    uHurt: { value: 0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSaturation, uVignette, uGrain, uAberration, uHurt;
    uniform vec2 uResolution, uVelocity;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centred = uv - 0.5;

      /* motion blur: smear along the view velocity, a few taps is enough */
      vec2 vel = clamp(uVelocity, -0.03, 0.03);
      vec3 col = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 5; i++) {
        float t = float(i) / 4.0 - 0.5;
        float w = 1.0 - abs(t) * 0.7;
        vec2 off = vel * t;
        /* chromatic aberration grows towards the edges of the frame */
        float ca = uAberration * 0.0016 * dot(centred, centred);
        col.r += texture2D(tDiffuse, uv + off + centred * ca).r * w;
        col.g += texture2D(tDiffuse, uv + off).g * w;
        col.b += texture2D(tDiffuse, uv + off - centred * ca).b * w;
        total += w;
      }
      col /= total;

      /* desaturate towards a cold grey, then a gentle S-curve so the bleach
         still has shadows under it */
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma) * vec3(0.98, 1.0, 1.04), col, uSaturation);
      col = clamp(col, 0.0, 1.0);
      col = col * col * (3.0 - 2.0 * col) * 0.55 + col * 0.45;
      col = (col - 0.5) * 1.16 + 0.5 - 0.012;

      if (uHurt > 0.001) {
        col = mix(col, vec3(luma * 1.1, luma * 0.18, luma * 0.14), uHurt * 0.55);
      }

      float vig = smoothstep(0.95, 0.25, length(centred) * uVignette);
      col *= mix(0.55, 1.0, vig);

      float g = hash(gl_FragCoord.xy + fract(uTime) * 137.0);
      col += (g - 0.5) * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.78;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 600);

    this.quality = 'high';
    this._buildSky();
    this._buildLights();
    this._buildComposer();

    this._prevDir = new THREE.Vector3();
    this._velocity = new THREE.Vector2();
  }

  _buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(10000);
    const u = sky.material.uniforms;
    /* hazy, blown-out midday: high turbidity, low mie for a flat white sky */
    u.turbidity.value = 8.5;
    u.rayleigh.value = 1.15;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.75;

    this.sunPosition = new THREE.Vector3();
    /* Sun behind the spawn, so the street ahead is lit rather than
       backlit into a white wall. */
    const elevation = 42;
    const azimuth = 55;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunPosition.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunPosition);

    this.scene.add(sky);
    this.sky = sky;

    /* the same sky becomes the environment map, so metal and glass reflect
       the actual sky rather than a flat colour */
    /* Image-based lighting. The visible sky is the Preetham shell above, but
       it is not used for the env map: its sun disc carries HDR values large
       enough to overflow the PMREM blur to NaN, which renders every PBR
       surface black. A hand-built equirect keeps the range sane. */
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(this._envTexture()).texture;
    this.scene.environmentIntensity = 1.0;
    pmrem.dispose();
  }

  _envTexture() {
    const w = 512;
    const h = 256;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');

    const sky = g.createLinearGradient(0, 0, 0, h * 0.5);
    sky.addColorStop(0, '#9fc4e8');
    sky.addColorStop(0.65, '#cfdbe6');
    sky.addColorStop(1, '#e8e4dc');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h * 0.5);

    const ground = g.createLinearGradient(0, h * 0.5, 0, h);
    ground.addColorStop(0, '#b3a894');
    ground.addColorStop(0.35, '#6f675b');
    ground.addColorStop(1, '#3a352e');
    g.fillStyle = ground;
    g.fillRect(0, h * 0.5, w, h * 0.5);

    /* a broad, soft sun so reflections have somewhere bright to catch */
    const dir = this.sunPosition;
    const u = (Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5) * w;
    const v = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI * h;
    const glow = g.createRadialGradient(u, v, 0, u, v, h * 0.42);
    glow.addColorStop(0, 'rgba(255,252,240,0.95)');
    glow.addColorStop(0.25, 'rgba(255,248,228,0.35)');
    glow.addColorStop(1, 'rgba(255,245,220,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildLights() {
    const sun = new THREE.DirectionalLight(0xfff3e2, 2.6);
    sun.position.copy(this.sunPosition).multiplyScalar(120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 260;
    const s = 45;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    /* bounce: warm from the sunlit ground, cool from the sky */
    const bounce = new THREE.HemisphereLight(0xbcd2e8, 0x6b6156, 0.55);
    this.scene.add(bounce);

    this.scene.fog = new THREE.FogExp2(0xb6bab6, 0.0022);
  }

  _buildComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.updateGtaoMaterial({
      radius: 0.34,
      distanceExponent: 1.2,
      thickness: 0.6,
      scale: 1.1,
      samples: 12,
      screenSpaceRadius: false
    });
    this.gtao.blendIntensity = 0.85;
    this.composer.addPass(this.gtao);

    /* Bloom runs on linear HDR, so its threshold is in scene-referred units:
       a sunlit wall sits well above 1.0 and would otherwise bloom entirely. */
    this.bloom = new UnrealBloomPass(size, 0.28, 0.85, 2.2);
    this.composer.addPass(this.bloom);

    /* Tone map and convert to display space before grading, because the
       grade works in perceptual terms (vignette, grain, saturation). */
    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.renderToScreen = true;
    this.composer.addPass(this.fxaa);
  }

  setQuality(q) {
    this.quality = q;
    /* Ambient occlusion is the expensive pass, so it is the first thing to go;
       bloom carries most of the look and survives to medium. */
    const ratio = q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, q === 'medium' ? 1.5 : 2);
    this.renderer.setPixelRatio(ratio);
    this.gtao.enabled = q === 'high';
    this.bloom.enabled = q !== 'low';
    this.renderer.shadowMap.enabled = true;
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.resize(this._w, this._h);
  }

  resize(w, h) {
    this._w = w;
    this._h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    this.grade.uniforms.uResolution.value.set(w, h);
  }

  /* Keep the shadow frustum centred on the player so a 2k map covers the
     playable area at high resolution instead of the whole level. */
  followShadow(target) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunPosition.clone().multiplyScalar(100));
  }

  render(dt, time) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const turn = new THREE.Vector2(dir.x - this._prevDir.x, dir.y - this._prevDir.y);
    this._prevDir.copy(dir);
    /* ease the smear so a flick does not strobe */
    this._velocity.lerp(turn.multiplyScalar(0.45), 0.35);
    this.grade.uniforms.uVelocity.value.copy(this._velocity);
    this.grade.uniforms.uTime.value = time;
    this.composer.render(dt);
  }
}
