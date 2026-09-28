/* Greyline - atmospheric effects.

   The light shafts are the main event: a half-resolution raymarch through the
   sun's shadow map, composited back with a depth-aware upsample. Indoors it
   turns a window into a visible beam, which is most of what separates a lit
   room from a room with lighting in it. */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/* three stores a directional light's shadow as a DepthTexture with a
   comparison function attached, so it must be read through a sampler2DShadow.
   That type only exists in GLSL ES 3.0, hence glslVersion: GLSL3 below - and
   in GLSL3 three no longer defines gl_FragColor, so the output is declared
   by hand. */
const MARCH_FRAG = /* glsl */`
precision highp float;
precision highp sampler2DShadow;

layout(location = 0) out vec4 fragColor;

varying vec2 vUv;

uniform sampler2D tDepth;
uniform sampler2DShadow tShadow;
uniform mat4 uShadowMatrix;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;          // normalised, pointing towards the sun
uniform float uSigma;      // extinction per metre in open air
uniform vec3 uVolMin;      // interior fog volume, world space
uniform vec3 uVolMax;
uniform float uVolScale;   // how much denser the interior medium is
uniform float uGain;       // look control applied after scattering
uniform float uMaxDistance;
uniform float uPhaseG;
uniform float uGroundY;
uniform float uHeightFalloff;
uniform float uTime;
uniform int uSteps;
uniform int uDebug;   // 0 off; see VolumetricLightPass.debug

const int MAX_STEPS = 48;

/* Henyey-Greenstein: dust scatters forward, so looking towards the sun should
   glow far more than looking away from it. */
float phaseHG(float cosT, float g) {
  float gg = g * g;
  float d = 1.0 + gg - 2.0 * g * cosT;
  return (1.0 - gg) / (4.0 * 3.14159265 * pow(max(d, 1e-4), 1.5));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float depth = texture(tDepth, vUv).x;

  /* Reconstruct the world position this pixel landed on. At the far plane
     there is no geometry, so the march still runs but is clamped by
     uMaxDistance rather than by a surface. */
  vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * clip;
  world.xyz /= world.w;

  vec3 ro = uCameraPos;
  vec3 toFrag = world.xyz - ro;
  float dist = min(length(toFrag), uMaxDistance);
  vec3 rd = normalize(toFrag);

  float stepLen = dist / float(uSteps);
  /* Jitter the first sample per pixel and per frame. Without it the march
     bands into visible shells; the upsample blur then hides the noise. */
  float jitter = hash(gl_FragCoord.xy + fract(uTime) * 91.7);

  /* Accumulate in-scattered light with Beer-Lambert extinction rather than
     summing lit samples.

     Summing is what a first pass reaches for, and it is unusable here: the
     total grows without bound with the length of the lit path, so the 60m of
     sunlit air outdoors came out about a hundred times the 10m of a shaft
     indoors. No single density serves both - the value that made a corridor
     shaft visible turned the street pure white. Carrying transmittance makes
     the sum saturate, so a long path approaches a limit instead of running
     away, and one setting covers both. */
  float inscatter = 0.0;
  float transmittance = 1.0;
  float litCount = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uSteps) break;
    vec3 p = ro + rd * ((float(i) + jitter) * stepLen);

    vec4 sc = uShadowMatrix * vec4(p, 1.0);
    vec3 suv = sc.xyz / sc.w;

    /* Outside the shadow frustum counts as lit: the alternative is a hard
       dark box around the cascade, which reads as a bug. */
    float lit = 1.0;
    if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0 && suv.z < 1.0) {
      lit = texture(tShadow, suv);
    }

    /* Haze settles, so keep it thicker near the ground. */
    float h = exp(-max(p.y - uGroundY, 0.0) * uHeightFalloff);

    /* A denser medium inside the compound. Outdoors a ray travels sixty
       metres of sunlit air, indoors a shaft is ten metres of it, so a single
       extinction either washes the street out or leaves the shaft invisible.
       Treating the interior as its own fog volume is what the difference
       actually is: still air full of dust, against clear air outside. */
    vec3 inside = step(uVolMin, p) * step(p, uVolMax);
    float interior = inside.x * inside.y * inside.z;
    float sigma = uSigma * h * mix(1.0, uVolScale, interior);
    float stepT = exp(-sigma * stepLen);
    inscatter += lit * (1.0 - stepT) * transmittance;
    transmittance *= stepT;
    litCount += lit;
  }

  float acc = inscatter * phaseHG(dot(rd, uSunDir), uPhaseG) * uGain;

  /* Debug taps. Each stage of this pass fails silently - a wrong shadow
     matrix and a shader that never ran both read as a black buffer - so the
     intermediates are inspectable rather than guessed at. */
  if (uDebug == 1) { fragColor = vec4(1.0); return; }
  if (uDebug == 2) { fragColor = vec4(vec3(depth), 1.0); return; }
  if (uDebug == 3) { fragColor = vec4(vec3(dist / uMaxDistance), 1.0); return; }
  if (uDebug == 4) {
    vec4 sc = uShadowMatrix * vec4(ro + rd * 2.0, 1.0);
    fragColor = vec4(sc.xyz / sc.w, 1.0); return;
  }
  if (uDebug == 5) {
    vec4 sc = uShadowMatrix * vec4(ro + rd * 2.0, 1.0);
    vec3 suv = sc.xyz / sc.w;
    fragColor = vec4(vec3(texture(tShadow, suv)), 1.0); return;
  }
  if (uDebug == 6) { fragColor = vec4(vec3(phaseHG(dot(rd, uSunDir), uPhaseG)), 1.0); return; }
  if (uDebug == 7) { fragColor = vec4(vec3(litCount / float(uSteps)), 1.0); return; }

  fragColor = vec4(vec3(min(acc, 2.0)), 1.0);
}
`;

const MARCH_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* The march output is jittered noise at half resolution, so it gets a
   depth-aware blur before it is upsampled. Weighting each tap by how close its
   depth is to the centre pixel keeps the beam from bleeding across geometry
   edges.

   This runs at half resolution into a target of its own rather than as part of
   the composite, and that is deliberate: the composite writes into one of the
   composer's ping-pong buffers, and those share the scene depth texture as
   their depth attachment. Sampling that texture while rendering into a
   framebuffer it is attached to is a feedback loop. Blurring here keeps every
   depth read on a target that has no depth attachment at all. */
const BLUR_SHADER = {
  uniforms: {
    tVolume: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2() }
  },
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tVolume;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;

    void main() {
      float centre = texture2D(tDepth, vUv).x;
      float sum = 0.0;
      float wsum = 0.0;
      for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
          vec2 off = vec2(float(x), float(y)) * uTexel;
          float d = texture2D(tDepth, vUv + off).x;
          float w = 1.0 / (1.0 + abs(d - centre) * 800.0);
          sum += texture2D(tVolume, vUv + off).r * w;
          wsum += w;
        }
      }
      gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
    }
  `
};

/* Bilinear upsample and add. No depth is read here - see BLUR_SHADER above. */
const COMPOSITE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tVolume: { value: null },
    uSunColor: { value: new THREE.Color(0xffe9c8) },
    uIntensity: { value: 1.0 },
    uOnly: { value: 0 }
  },
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tVolume;
    uniform vec3 uSunColor;
    uniform float uIntensity;
    uniform int uOnly;

    void main() {
      vec3 vol = texture2D(tVolume, vUv).rgb;
      /* uOnly shows the volume buffer on its own. Reading a half-float target
         back on the CPU needs a matching typed array and quietly returns
         zeros when it does not match, so the buffer is inspected on screen
         instead. */
      if (uOnly == 1) { gl_FragColor = vec4(vol, 1.0); return; }
      gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + uSunColor * vol.r * uIntensity, 1.0);
    }
  `
};

export class VolumetricLightPass extends Pass {
  /**
   * @param camera the scene camera
   * @param light  the shadow-casting directional light to march against
   */
  constructor(camera, light, width, height) {
    super();
    this.camera = camera;
    this.light = light;
    this.intensity = 1.0;

    this.marchMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDepth: { value: null },
        tShadow: { value: null },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uInvViewProj: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3() },
        /* Extinction is roughly physical (clear air with dust in it); uGain
           is the artistic control on top of it. */
        uSigma: { value: 0.02 },
        uVolMin: { value: new THREE.Vector3(-1e6, -1e6, -1e6) },
        uVolMax: { value: new THREE.Vector3(-1e6, -1e6, -1e6) },
        uVolScale: { value: 5.0 },
        uGain: { value: 6.0 },
        uMaxDistance: { value: 60 },
        uPhaseG: { value: 0.35 },
        uGroundY: { value: 0 },
        uHeightFalloff: { value: 0.22 },
        uTime: { value: 0 },
        uSteps: { value: 28 },
        uDebug: { value: 0 }
      },
      vertexShader: MARCH_VERT,
      fragmentShader: MARCH_FRAG,
      depthTest: false,
      depthWrite: false
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(BLUR_SHADER.uniforms),
      vertexShader: MARCH_VERT,
      fragmentShader: BLUR_SHADER.fragmentShader,
      depthTest: false,
      depthWrite: false
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(COMPOSITE_SHADER.uniforms),
      vertexShader: MARCH_VERT,
      fragmentShader: COMPOSITE_SHADER.fragmentShader,
      depthTest: false,
      depthWrite: false
    });

    this.marchQuad = new FullScreenQuad(this.marchMaterial);
    this.blurQuad = new FullScreenQuad(this.blurMaterial);
    this.compositeQuad = new FullScreenQuad(this.compositeMaterial);

    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, format: THREE.RGBAFormat };
    this.halfTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.blurTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.setSize(width, height);

    this._invViewProj = new THREE.Matrix4();
    this._sunDir = new THREE.Vector3();
  }

  setSize(width, height) {
    this._width = width;
    this._height = height;
    /* Half resolution in each axis: the march is the expensive part and its
       output is low-frequency enough to survive the reduction. */
    const hw = Math.max(1, Math.ceil(width / 2));
    const hh = Math.max(1, Math.ceil(height / 2));
    this.halfTarget.setSize(hw, hh);
    this.blurTarget.setSize(hw, hh);
    this.blurMaterial.uniforms.uTexel.value.set(1 / hw, 1 / hh);
  }

  setQuality(q) {
    this.marchMaterial.uniforms.uSteps.value = q === 'high' ? 32 : 20;
  }

  render(renderer, writeBuffer, readBuffer) {
    const shadow = this.light.shadow;
    /* The shadow map does not exist until the first shadow render, and the
       pass is useless without it. */
    if (!shadow || !shadow.map || !shadow.map.depthTexture) {
      this._passthrough(renderer, writeBuffer, readBuffer);
      return;
    }

    const u = this.marchMaterial.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    u.tShadow.value = shadow.map.depthTexture;
    u.uShadowMatrix.value.copy(shadow.matrix);

    this._invViewProj
      .multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
      .invert();
    u.uInvViewProj.value.copy(this._invViewProj);
    this.camera.getWorldPosition(u.uCameraPos.value);

    /* A directional light points from its position towards its target. */
    this._sunDir.copy(this.light.position).sub(this.light.target.position).normalize();
    u.uSunDir.value.copy(this._sunDir);

    renderer.setRenderTarget(this.halfTarget);
    renderer.clear();
    this.marchQuad.render(renderer);

    const b = this.blurMaterial.uniforms;
    b.tVolume.value = this.halfTarget.texture;
    b.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.blurTarget);
    renderer.clear();
    this.blurQuad.render(renderer);

    const c = this.compositeMaterial.uniforms;
    c.tDiffuse.value = readBuffer.texture;
    c.tVolume.value = this.blurTarget.texture;
    c.uIntensity.value = this.intensity;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.compositeQuad.render(renderer);
  }

  _passthrough(renderer, writeBuffer, readBuffer) {
    const c = this.compositeMaterial.uniforms;
    c.tDiffuse.value = readBuffer.texture;
    c.tVolume.value = null;
    c.uIntensity.value = 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.compositeQuad.render(renderer);
  }

  /** The interior behaves as its own fog volume; see the march shader. */
  setInteriorVolume(min, max) {
    this.marchMaterial.uniforms.uVolMin.value.copy(min);
    this.marchMaterial.uniforms.uVolMax.value.copy(max);
  }

  setTime(t) {
    this.marchMaterial.uniforms.uTime.value = t;
  }

  dispose() {
    this.halfTarget.dispose();
    this.blurTarget.dispose();
    this.marchMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.marchQuad.dispose();
    this.blurQuad.dispose();
    this.compositeQuad.dispose();
  }
}

/* Motes drifting in the air. They are what makes a light shaft read as volume
   rather than as a gradient, so they follow the camera: a fixed cloud over the
   whole level would need far more points to reach the same density here. */
export class DustMotes {
  constructor(scene, { count = 900, radius = 14, height = 6 } = {}) {
    this.radius = radius;
    this.height = height;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * radius * 2;
      positions[i * 3 + 1] = Math.random() * height;
      positions[i * 3 + 2] = (Math.random() - 0.5) * radius * 2;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 1.7 },
        uOpacity: { value: 0.3 },
        uColor: { value: new THREE.Color(0xfff2dc) },
        uPixelRatio: { value: 1 }
      },
      vertexShader: /* glsl */`
        attribute float aPhase;
        uniform float uTime;
        uniform float uSize;
        uniform float uPixelRatio;
        varying float vFade;
        void main() {
          vec3 p = position;
          /* Slow, uncorrelated drift: dust does not fall, it wanders. */
          p.x += sin(uTime * 0.13 + aPhase) * 0.35;
          p.y += sin(uTime * 0.09 + aPhase * 1.7) * 0.28;
          p.z += cos(uTime * 0.11 + aPhase * 0.7) * 0.35;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          /* Fade the nearest motes out so they do not smear across the lens. */
          vFade = smoothstep(0.4, 2.5, -mv.z) * (1.0 - smoothstep(10.0, 18.0, -mv.z));
          gl_PointSize = uSize * uPixelRatio * (8.0 / max(-mv.z, 0.4));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d));
          gl_FragColor = vec4(uColor, a * vFade * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  /* Re-centre on the camera in whole steps so motes do not slide with the
     player, which would read as the whole world moving. */
  update(cameraPos, time) {
    this.material.uniforms.uTime.value = time;
    const step = this.radius;
    this.points.position.set(
      Math.round(cameraPos.x / step) * step,
      0,
      Math.round(cameraPos.z / step) * step
    );
  }

  setPixelRatio(r) {
    this.material.uniforms.uPixelRatio.value = r;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    if (this.points.parent) this.points.parent.remove(this.points);
  }
}
