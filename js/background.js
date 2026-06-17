import {
  Clock, Mesh, OrthographicCamera, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer
} from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// ===== CONFIG =====
const CONFIG = {
  linesGradient: ['#ff00ff', '#4B0082', '#00ffff'],
  enabledWaves: ['top', 'middle', 'bottom'],
  lineCount: [6, 6, 6],
  lineDistance: [5, 5, 5],
  topWavePosition:    { x: 10.0, y:  0.5, rotate: -0.4 },
  middleWavePosition: { x:  5.0, y:  0.0, rotate:  0.2 },
  bottomWavePosition: { x:  2.0, y: -0.7, rotate: -1.0 },
  animationSpeed: 1,
  interactive: true,
  bendRadius: 5.0,
  bendStrength: -0.5,
  mouseDamping: 0.05,
  parallax: true,
  parallaxStrength: 0.2,
};

const MAX_GRADIENT_STOPS = 8;
function hexToVec3(hex) {
  let v = hex.trim().replace('#','');
  let r=255, g=255, b=255;
  if (v.length===3) { r=parseInt(v[0]+v[0],16); g=parseInt(v[1]+v[1],16); b=parseInt(v[2]+v[2],16);
  } else if (v.length===6) { r=parseInt(v.slice(0,2),16); g=parseInt(v.slice(2,4),16); b=parseInt(v.slice(4,6),16); }
  return new Vector3(r/255, g/255, b/255);
}

const getLineCount = (waveType) => {
  if (!CONFIG.enabledWaves.includes(waveType)) return 0;
  const i = CONFIG.enabledWaves.indexOf(waveType);
  return Array.isArray(CONFIG.lineCount) ? (CONFIG.lineCount[i] ?? 6) : CONFIG.lineCount;
};

const getLineDistance = (waveType) => {
  if (!CONFIG.enabledWaves.includes(waveType)) return 0.01;
  const i = CONFIG.enabledWaves.indexOf(waveType);
  const d = Array.isArray(CONFIG.lineDistance) ? (CONFIG.lineDistance[i] ?? 5) : CONFIG.lineDistance;
  return d * 0.01;
};

const vertexShader = `precision highp float; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fragmentShader = `
precision highp float;
uniform float iTime; uniform vec3 iResolution; uniform float animationSpeed;
uniform bool enableTop; uniform bool enableMiddle; uniform bool enableBottom;
uniform int topLineCount; uniform int middleLineCount; uniform int bottomLineCount;
uniform float topLineDistance; uniform float middleLineDistance; uniform float bottomLineDistance;
uniform vec3 topWavePosition; uniform vec3 middleWavePosition; uniform vec3 bottomWavePosition;
uniform vec2 iMouse; uniform bool interactive; uniform float bendRadius; uniform float bendStrength; uniform float bendInfluence;
uniform bool parallax; uniform float parallaxStrength; uniform vec2 parallaxOffset;
uniform vec3 lineGradient[8]; uniform int lineGradientCount;

const vec3 BLACK = vec3(0.0);
const vec3 PINK = vec3(233.0, 71.0, 245.0) / 255.0;
const vec3 BLUE = vec3(47.0, 75.0, 162.0) / 255.0;

mat2 rotate(float r) { return mat2(cos(r), sin(r), -sin(r), cos(r)); }
vec3 background_color(vec2 uv) {
  vec3 col = vec3(0.0);
  float y = sin(uv.x - 0.2) * 0.3 - 0.1;
  float m = uv.y - y;
  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
  return col * 0.5;
}
vec3 getLineColor(float t, vec3 baseColor) {
  if (lineGradientCount <= 0) return baseColor;
  float clampedT = clamp(t, 0.0, 0.9999);
  float scaled = clampedT * float(lineGradientCount - 1);
  int idx = int(floor(scaled));
  return mix(lineGradient[idx], lineGradient[min(idx + 1, lineGradientCount - 1)], fract(scaled)) * 0.5;
}
float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {
  float time = iTime * animationSpeed;
  float y = sin(uv.x + offset + time * 0.1) * (sin(offset + time * 0.2) * 0.3);
  if (shouldBend) {
    float influence = exp(-dot(screenUv - mouseUv, screenUv - mouseUv) * bendRadius);
    y += (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
  }
  return 0.0175 / max(abs(uv.y - y) + 0.01, 1e-3) + 0.01;
}
void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  baseUv.y *= -1.0;
  if (parallax) baseUv += parallaxOffset;
  vec3 col = vec3(0.0);
  vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);
  vec2 mouseUv = interactive ? (2.0 * iMouse - iResolution.xy) / iResolution.y : vec2(0.0);
  if (interactive) mouseUv.y *= -1.0;
  if (enableBottom) {
    for (int i = 0; i < 16; ++i) { if (i >= bottomLineCount) break;
      float fi = float(i);
      vec2 ruv = baseUv * rotate(bottomWavePosition.z * log(length(baseUv) + 1.0));
      col += getLineColor(fi/max(float(bottomLineCount-1),1.0), b) * wave(ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y), 1.5 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.2;
    }
  }
  if (enableMiddle) {
    for (int i = 0; i < 16; ++i) { if (i >= middleLineCount) break;
      float fi = float(i);
      vec2 ruv = baseUv * rotate(middleWavePosition.z * log(length(baseUv) + 1.0));
      col += getLineColor(fi/max(float(middleLineCount-1),1.0), b) * wave(ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y), 2.0 + 0.15 * fi, baseUv, mouseUv, interactive);
    }
  }
  if (enableTop) {
    for (int i = 0; i < 16; ++i) { if (i >= topLineCount) break;
      float fi = float(i);
      vec2 ruv = baseUv * rotate(topWavePosition.z * log(length(baseUv) + 1.0));
      ruv.x *= -1.0;
      col += getLineColor(fi/max(float(topLineCount-1),1.0), b) * wave(ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y), 1.0 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.1;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const container = document.getElementById('floating-lines-container');
const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
container.appendChild(renderer.domElement);

const uniforms = {
  iTime: { value: 0 }, iResolution: { value: new Vector3(1, 1, 1) }, animationSpeed: { value: CONFIG.animationSpeed },
  enableTop: { value: CONFIG.enabledWaves.includes('top') }, enableMiddle: { value: CONFIG.enabledWaves.includes('middle') }, enableBottom: { value: CONFIG.enabledWaves.includes('bottom') },
  topLineCount: { value: Math.min(getLineCount('top'), 8) }, middleLineCount: { value: Math.min(getLineCount('middle'), 8) }, bottomLineCount: { value: Math.min(getLineCount('bottom'), 8) },
  topLineDistance: { value: getLineDistance('top') }, middleLineDistance: { value: getLineDistance('middle') }, bottomLineDistance: { value: getLineDistance('bottom') },
  topWavePosition: { value: new Vector3(CONFIG.topWavePosition.x, CONFIG.topWavePosition.y, CONFIG.topWavePosition.rotate) },
  middleWavePosition: { value: new Vector3(CONFIG.middleWavePosition.x, CONFIG.middleWavePosition.y, CONFIG.middleWavePosition.rotate) },
  bottomWavePosition: { value: new Vector3(CONFIG.bottomWavePosition.x, CONFIG.bottomWavePosition.y, CONFIG.bottomWavePosition.rotate) },
  iMouse: { value: new Vector2(-1000, -1000) }, interactive: { value: CONFIG.interactive }, bendRadius: { value: CONFIG.bendRadius },
  bendStrength: { value: CONFIG.bendStrength }, bendInfluence: { value: 0 }, parallax: { value: CONFIG.parallax },
  parallaxStrength: { value: CONFIG.parallaxStrength }, parallaxOffset: { value: new Vector2(0, 0) },
  lineGradient: { value: Array.from({ length: MAX_GRADIENT_STOPS }, () => new Vector3(1,1,1)) }, lineGradientCount: { value: 0 }
};

if (CONFIG.linesGradient) {
  uniforms.lineGradientCount.value = CONFIG.linesGradient.length;
  CONFIG.linesGradient.forEach((hex, i) => { uniforms.lineGradient.value[i].copy(hexToVec3(hex)); });
}

scene.add(new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ uniforms, vertexShader, fragmentShader })));
const clock = new Clock();
const targetMouse = new Vector2(-1000, -1000), currentMouse = new Vector2(-1000, -1000);
const targetParallax = new Vector2(0, 0), currentParallax = new Vector2(0, 0);
let targetInfluence = 0, currentInfluence = 0;

function setSize() {
  const w = container.clientWidth || 1, h = container.clientHeight || 1;
  renderer.setSize(w, h, false);
  uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height, 1);
}
window.addEventListener('resize', setSize); setSize();

window.addEventListener('pointermove', e => {
  targetMouse.set(e.clientX * renderer.getPixelRatio(), (window.innerHeight - e.clientY) * renderer.getPixelRatio());
  targetInfluence = 1.0;
  targetParallax.set(((e.clientX - window.innerWidth/2) / window.innerWidth) * CONFIG.parallaxStrength, -((e.clientY - window.innerHeight/2) / window.innerHeight) * CONFIG.parallaxStrength);
});

let lastFrameTime = 0;
const fpsLimit = 30;

function renderLoop(time) {
  requestAnimationFrame(renderLoop);
  
  if (time - lastFrameTime < 1000 / fpsLimit) return;
  lastFrameTime = time;

  uniforms.iTime.value = clock.getElapsedTime();
  currentMouse.lerp(targetMouse, CONFIG.mouseDamping); uniforms.iMouse.value.copy(currentMouse);
  currentInfluence += (targetInfluence - currentInfluence) * CONFIG.mouseDamping; uniforms.bendInfluence.value = currentInfluence;
  currentParallax.lerp(targetParallax, CONFIG.mouseDamping); uniforms.parallaxOffset.value.copy(currentParallax);
  renderer.render(scene, camera);
}
requestAnimationFrame(renderLoop);
