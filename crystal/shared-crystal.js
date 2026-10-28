import {normalizeTransform,readTransformStorage} from './focus-transform-model.js';
// Single F2 renderer used by Focus, DASH5 and the AI settings preview.
// No network calls, store writes or timer/session state live in this module.
import * as THREE from '../vendor/three.module.js';
import {LineMaterial} from '../vendor/LineMaterial.js';
import {LineSegmentsGeometry} from '../vendor/LineSegmentsGeometry.js';
import {LineSegments2} from '../vendor/LineSegments2.js';
import {visibleEdges} from './geometry.js';
import {focusModel, FOCUS_GEOMETRY_ID} from './focus-geometry.js';
import {FOCUS_CAUSTICS, focusCaustics, drawFocusCaustics, projectedFocusCausticsSVG} from './focus-caustics.js';
import {focusHalo, drawFocusHalo, projectedFocusHaloSVG} from './focus-halo.js';
import {MAX_BACKGROUND_STARS, backgroundStarCountFor, backgroundStarsSupported, backgroundStarFor,
  backgroundStarDensityFor, projectedBackgroundStarsSVG, BACKGROUND_STAR_VERTEX_GLSL,
  BACKGROUND_STAR_FRAGMENT_GLSL} from './focus-background-stars.js';
import {FOCUS_APPEARANCE_DEFAULTS, FOCUS_LIGHTING, FOCUS_LIGHTING_GLSL, focusLightingState, focusStagePalette,
  focusSaturatedTint, focusFacetTint, focusProjectionTarget, normalizeFocusAppearance} from './focus-lighting.js';

export const CRYSTAL_RENDERER_ID = 'shared-f2-teardrop-v14';
// Actual initial Euler orientation is separate from saved degrees-per-second rates.
// The pointed tip is positive model Y. Half a turn around X puts it downward
// on screen. YXZ composes world Ry(-phase) * Rx(pi); XYZ would reverse
// world-Y direction after this half-turn. X stays pi and Z stays zero.
export const CRYSTAL_INITIAL_ROTATION = Object.freeze([Math.PI, 0, 0]);
export const CRYSTAL_ROTATION_ORDER = 'YXZ';
export const CRYSTAL_ROTATION_MODE = 'y-clockwise';
// A visible resource guard only. Confirmed totals and logical counts are never capped.
export const MAX_ORBIT_STARS = 4096;
export const MAX_ORBIT_SEGMENTS = 65536;
export const crystalStarCountFor = totalMs => 2 + Math.floor(confirmedMs(totalMs) / 6000000);
const TAU = Math.PI * 2;
let crystalViewSequence = 0;
const qualityOf = value => value === 'low' ? 'low' : 'high';
const confirmedMs = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
export const crystalStageFor = totalMs => Math.min(4, Math.floor(confirmedMs(totalMs) / 6000000));
const maximums = Object.fromEntries(['high', 'low'].map(quality => {
  const model = focusModel(4, quality);
  return [quality, 2 * model.faces.length + 12 * visibleEdges(model).length];
}));
export function crystalLimits(quality = 'high') {
  const low = quality === 'low';
  return {modelTriangles: 240, actualMaxModelTriangles: 144, submittedTriangles: maximums[qualityOf(quality)],
    drawCalls: 7, crystalDrawCalls: 4, orbitDrawCalls: 1, starDrawCalls: 1, backgroundStarDrawCalls: 1, maxBackgroundStars: MAX_BACKGROUND_STARS, maxOrbitStars: MAX_ORBIT_STARS, maxOrbitSegments: MAX_ORBIT_SEGMENTS, causticCanvasLayers: 1, causticLoops: 4, haloSharedCausticLayer: true, haloGpuDrawCalls: 0, dpr: low ? 1 : 1.5, maxBufferSide: 960, fps: low ? 12 : 20};
}
const vertex = `attribute float facet; varying vec3 p; varying vec3 n; varying float id;
void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;n=normalize(mat3(modelMatrix)*normal);id=facet;gl_Position=projectionMatrix*viewMatrix*w;}`;
const fragment = `uniform vec3 eye; uniform float backside;
varying vec3 p; varying vec3 n; varying float id;
${FOCUS_LIGHTING_GLSL}
vec3 environment(vec3 d){float sky=clamp(d.y*.5+.5,0.,1.);vec3 c=mix(vec3(.025,.045,.095),vec3(.19,.32,.43),sky);float panel=pow(max(dot(d,normalize(vec3(-.75,.8,.65))),0.),130.);float softbox=pow(max(dot(d,normalize(vec3(-.22,.52,.82))),0.),130.*.28);float strip=pow(max(dot(d,normalize(vec3(.7,.18,.8))),0.),130.*.45);return c+vec3(.90,.96,1.)*(panel*1.1+softbox*.9)+vec3(.36,.46,.85)*strip*.65;}
void main(){vec3 N=normalize(n)*(backside>.5?-1.:1.);vec3 V=normalize(eye-p);float nv=clamp(dot(N,V),0.,1.);float fresnel=.04+.96*pow(1.-nv,5.);vec3 R=reflect(-V,N);vec3 T=refract(-V,N,1./1.48);vec3 reflection=environment(R),transmission=environment(T);
gl_FragColor=focusSurface(N,V,R,reflection,transmission,p,id,fresnel,backside);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function geometryFor(model) {
  const positions = [], normals = [], ids = [];
  model.faces.forEach((face, index) => face.forEach(vertex => {
    positions.push(...model.vertices[vertex]); normals.push(...model.normals[index]); ids.push(model.faceIds[index]);
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('facet', new THREE.Float32BufferAttribute(ids, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
function edgeGeometryFor(model) {
  const positions = [], normals = [];
  for (const [a, b] of visibleEdges(model)) {
    const adjacent = model.faces.flatMap((face, index) => face.includes(a) && face.includes(b) ? [model.normals[index]] : []);
    const normal = new THREE.Vector3(...adjacent[0]).add(new THREE.Vector3(...adjacent[1])).normalize();
    positions.push(...model.vertices[a], ...model.vertices[b]); normals.push(normal.x, normal.y, normal.z);
  }
  const geometry = new LineSegmentsGeometry().setPositions(positions);
  geometry.setAttribute('instanceNormal', new THREE.InstancedBufferAttribute(new Float32Array(normals), 3));
  return geometry;
}
function wideLine(geometry, backside, camera) {
  const material = new LineMaterial({color: '#9cddf6', linewidth: 0.8, worldUnits: false,
    alphaToCoverage: true, transparent: true, depthTest: true, depthWrite: false, opacity: 1});
  material.userData.edgeOpacity = {value: backside ? .075 : .4};
  material.onBeforeCompile = shader => {
    shader.uniforms.edgeEye = {value: camera.position}; shader.uniforms.edgeBack = {value: backside};
    shader.uniforms.edgeOpacity = material.userData.edgeOpacity;
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'attribute vec3 instanceNormal;varying vec3 edgeNormal;varying vec3 edgePosition;\nvoid main() {\nedgeNormal=normalize(mat3(modelMatrix)*instanceNormal);edgePosition=(modelMatrix*vec4(mix(instanceStart,instanceEnd,.5),1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 edgeEye;uniform float edgeBack;uniform float edgeOpacity;varying vec3 edgeNormal;varying vec3 edgePosition;\nvoid main() {\nfloat facing=dot(normalize(edgeNormal),normalize(edgeEye-edgePosition));if(edgeBack>.5&&facing>.06)discard;if(edgeBack<.5&&facing<-.06)discard;').replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );', 'gl_FragColor = vec4( diffuseColor.rgb, alpha * edgeOpacity );');
  };
  material.customProgramCacheKey = () => 'teamdev-v02-pdca-shared-f2-screen-edge-v8';
  return new LineSegments2(geometry, material);
}


// One dedicated visible curve per star. The first pair forms a symmetric lens;
// later nested ellipses use complementary inclinations and even proportions.
// later curves use index-only low-discrepancy seeds. Adding a star never changes
// an existing curve, star phase, or direction. These are screen-space ellipses,
// independent of the crystal's XYZ pose, and keep their aspect in every host.
export const CRYSTAL_ORBITS = Object.freeze([
  Object.freeze({radiusX: .92, radiusY: .49, tilt: Math.PI / 6}),
  Object.freeze({radiusX: .92, radiusY: .49, tilt: -Math.PI / 6}),
  Object.freeze({radiusX: .88, radiusY: .46, tilt: Math.PI / 2}),
  Object.freeze({radiusX: .84, radiusY: .43, tilt: 0}),
  Object.freeze({radiusX: .86, radiusY: .45, tilt: Math.PI / 3}),
  Object.freeze({radiusX: .86, radiusY: .45, tilt: -Math.PI / 3}),
]);
export const CRYSTAL_ORBIT_SEGMENTS = 256;
export function crystalOrbitFor(index = 0) {
  const orbit = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  return CRYSTAL_ORBITS[orbit] || {radiusX: .78 + ((orbit * .618033988749895) % 1) * .16,
    radiusY: .40 + ((orbit * .414213562373095) % 1) * .20,
    tilt: (orbit * 2.399963229728653) % Math.PI};
}
function orbitShapeFor(index) {
  const {radiusX, radiusY, tilt} = crystalOrbitFor(index);
  return [radiusX, radiusY, Math.cos(tilt), Math.sin(tilt)].map(Math.fround);
}
// Density compensation keeps normal growth clearly readable, while preventing
// thousands of overlapping full-opacity lines from washing out the crystal.
// The user controls base opacity, including fully hidden curves at zero.
export function crystalOrbitOpacityFor(count = 2, opacity = FOCUS_APPEARANCE_DEFAULTS.orbitOpacity) {
  const base = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : FOCUS_APPEARANCE_DEFAULTS.orbitOpacity;
  return crystalOrbitSegmentsFor(count) ? base * Math.min(1, Math.sqrt(7 / count)) : 0;
}
export function crystalOrbitSegmentsFor(count = 2) {
  return Number.isSafeInteger(count) && count > 0 && count <= MAX_ORBIT_STARS ?
    Math.min(CRYSTAL_ORBIT_SEGMENTS, Math.floor(MAX_ORBIT_SEGMENTS / count)) : 0;
}
// Shared verbatim by the line and point vertex shaders. Shapes are Float32 on
// both paths; a star can never silently choose a different orbit than its line.
const orbitVertexGLSL = `attribute vec4 orbitShape;uniform vec2 orbitScale;uniform float orbitSegments;
vec2 crystalOrbitVertex(float segment){float angle=segment*6.283185307179586/orbitSegments;
vec2 ellipse=vec2(cos(angle),sin(angle))*orbitShape.xy;
return vec2(ellipse.x*orbitShape.z-ellipse.y*orbitShape.w,ellipse.x*orbitShape.w+ellipse.y*orbitShape.z)*orbitScale;}
vec2 crystalOrbitPoint(float angle){float part=mod(angle,6.283185307179586)*orbitSegments/6.283185307179586;
float segment=floor(part);return mix(crystalOrbitVertex(segment),crystalOrbitVertex(segment+1.),fract(part));}`;
export function crystalOrbitScreenPoint(orbit = 0, angle = 0, width = 320, height = 360, segments = CRYSTAL_ORBIT_SEGMENTS) {
  const [a, b, c, s] = orbitShapeFor(orbit), size = Math.min(width, height) / 2;
  const part = ((angle % TAU) + TAU) % TAU / TAU * segments, segment = Math.floor(part), fraction = part - segment;
  const point = step => { const x = Math.cos(step / segments * TAU) * a, y = Math.sin(step / segments * TAU) * b;
    return [width / 2 + size * (x * c - y * s), height / 2 - size * (x * s + y * c)]; };
  const start = point(segment), end = point(segment + 1);
  return start.map((value, axis) => value + (end[axis] - value) * fraction);
}
function makeOrbitLines(count) {
  const segments = crystalOrbitSegmentsFor(count);
  if (!segments) return null;
  // One tiny angle buffer is instanced for all curves. Never allocate
  // count * 512 vertices; the GPU's total segment work is bounded as well.
  const positions = new Float32Array(segments * 2 * 3), shapes = new Float32Array(count * 4);
  for (let segment = 0; segment < segments; segment++) {
    positions[segment * 6] = segment;
    positions[segment * 6 + 3] = segment + 1;
  }
  for (let orbit = 0; orbit < count; orbit++) shapes.set(orbitShapeFor(orbit), orbit * 4);
  const geometry = new THREE.InstancedBufferGeometry(); geometry.instanceCount = count;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('orbitShape', new THREE.InstancedBufferAttribute(shapes, 4));
  const material = new THREE.ShaderMaterial({transparent: true, depthTest: false, depthWrite: false,
    uniforms: {orbitScale: {value: new THREE.Vector2(1, 1)}, orbitSegments: {value: segments}, orbitOpacity: {value: crystalOrbitOpacityFor(count)}},
    vertexShader: `${orbitVertexGLSL}void main(){gl_Position=vec4(crystalOrbitVertex(position.x),0.,1.);}`,
    fragmentShader: `uniform float orbitOpacity;void main(){gl_FragColor=vec4(.43,.67,.88,orbitOpacity);
#include <colorspace_fragment>
}`});
  const lines = new THREE.LineSegments(geometry, material); lines.frustumCulled = false;
  lines.renderOrder = -1; lines.name = 'crystal-orbit-curves'; lines.userData.segmentsPerCurve = segments; return lines;
}
// Exactly one point batch and one curve instance per supported count. Resource
// fallback omits BOTH batches, preserving the one-star/one-visible-curve rule.
function makeOrbitStars(count) {
  if (!crystalOrbitSegmentsFor(count)) return null;
  const positions = new Float32Array(count * 3), directions = new Float32Array(count), shapes = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (i * 2.399963229728653) % TAU;
    positions[i * 3 + 1] = i;
    positions[i * 3 + 2] = 4.5 + 2.5 * ((i * .41421356237) % 1);
    shapes.set(orbitShapeFor(i), i * 4);
    // One-based odd stars turn clockwise on screen (negative clip-space angle).
    // Index-only parity keeps existing directions stable whenever stars grow.
    directions[i] = i % 2 === 0 ? -1 : 1;
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('orbitDirection', new THREE.BufferAttribute(directions, 1));
  geometry.setAttribute('orbitShape', new THREE.BufferAttribute(shapes, 4));
  const material = new THREE.ShaderMaterial({transparent: true, depthTest: false, depthWrite: false,
    uniforms: {starTime: {value: 0}, starDpr: {value: 1}, orbitScale: {value: new THREE.Vector2(1, 1)}, orbitSegments: {value: crystalOrbitSegmentsFor(count)}},
    // Curves and stars are independent of the crystal's XYZ rotation/camera.
    vertexShader: `${orbitVertexGLSL}attribute float orbitDirection;uniform float starTime;uniform float starDpr;void main(){float angle=position.x+starTime*.09*orbitDirection;gl_Position=vec4(crystalOrbitPoint(angle),0.,1.);gl_PointSize=position.z*starDpr;}`,
    fragmentShader: `void main(){vec2 q=abs(gl_PointCoord*2.-1.);float star=max(pow(max(1.-q.x,0.),5.)*(1.-q.y),pow(max(1.-q.y,0.),5.)*(1.-q.x));float alpha=smoothstep(.02,.38,star)*.8;gl_FragColor=vec4(.76,.90,1.,alpha);
#include <colorspace_fragment>
}`});
  const stars = new THREE.Points(geometry, material); stars.frustumCulled = false; stars.renderOrder = 4; stars.name = 'confirmed-orbit-stars';
  return stars;
}
export function projectedOrbitCurvesSVG(width = 320, height = 360, totalMs = 0, appearance) {
  const count = crystalStarCountFor(totalMs), segments = crystalOrbitSegmentsFor(count);
  if (!segments) return '';
  // A single SVG path holds distinct closed subpaths, avoiding per-orbit DOM.
  let path = '';
  for (let orbit = 0; orbit < count; orbit++) {
    const points = Array.from({length: segments}, (_, segment) =>
      crystalOrbitScreenPoint(orbit, segment / segments * TAU, width, height, segments).map(value => value.toFixed(3)).join(' '));
    path += 'M' + points.join('L') + 'Z';
  }
  return '<path data-crystal-orbit-count="' + count + '" fill="none" stroke="#afd5f1" stroke-width="1" opacity="' + crystalOrbitOpacityFor(count, normalizeFocusAppearance(appearance).orbitOpacity) + '" vector-effect="non-scaling-stroke" d="' + path + '"/>';
}
export function projectedOrbitStarsSVG(totalMs, width = 320, height = 360) {
  const count = crystalStarCountFor(totalMs), segments = crystalOrbitSegmentsFor(count);
  if (!segments) return '';
  let path = '';
  for (let i = 0; i < count; i++) {
    const angle = Math.fround((i * 2.399963229728653) % TAU);
    const [x, y] = crystalOrbitScreenPoint(i, angle, width, height, segments);
    const size = 2.2 + 1.2 * ((i * .41421356237) % 1);
    path += `M${x.toFixed(3)} ${(y-size).toFixed(3)}l${(size*.24).toFixed(3)} ${(size*.76).toFixed(3)}l${(size*.76).toFixed(3)} ${(size*.24).toFixed(3)}l${(-size*.76).toFixed(3)} ${(size*.24).toFixed(3)}l${(-size*.24).toFixed(3)} ${(size*.76).toFixed(3)}l${(-size*.24).toFixed(3)} ${(-size*.76).toFixed(3)}l${(-size*.76).toFixed(3)} ${(-size*.24).toFixed(3)}l${(size*.76).toFixed(3)} ${(-size*.24).toFixed(3)}Z`;
  }
  return '<path data-orbit-star-count="' + count + '" fill="#c2e6ff" opacity=".8" d="' + path + '"/>';
}

// A single background point batch, beneath the crystal and orbit curves. It
// occupies only this decorative host, never a page-wide layer above controls.
function makeBackgroundStars(count) {
  if (!count || !backgroundStarsSupported(count)) return null;
  const positions = new Float32Array(count * 3), twinkles = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const star = backgroundStarFor(index);
    positions.set([star.x, star.y, star.size], index * 3);
    twinkles.set([star.phase, star.period, star.peak], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('twinkle', new THREE.BufferAttribute(twinkles, 3));
  const material = new THREE.ShaderMaterial({transparent: true, depthTest: false, depthWrite: false,
    uniforms: {backgroundTime: {value: 0}, backgroundDpr: {value: 1}, backgroundDensity: {value: backgroundStarDensityFor(count)},
      backgroundStarSize: {value: 1}, backgroundTwinkle: {value: 1}, backgroundTwinkleInterval: {value: FOCUS_APPEARANCE_DEFAULTS.backgroundTwinkleInterval}},
    vertexShader: BACKGROUND_STAR_VERTEX_GLSL, fragmentShader: BACKGROUND_STAR_FRAGMENT_GLSL});
  const stars = new THREE.Points(geometry, material); stars.frustumCulled = false;
  stars.renderOrder = -2; stars.name = 'confirmed-background-stars'; return stars;
}

function crystalEdgeTintFor(stage, settings) {
  const tint = new THREE.Color(focusStagePalette(stage).tint);
  return new THREE.Color().fromArray(focusSaturatedTint(tint.toArray(), settings.colorSaturation)).lerp(new THREE.Color('#ffffff'), .24);
}

// A fixed world-rotation-safe camera reservation separates the crystal and
// floor. Radius comes from the unchanged model; neither phase nor glow drives
// this fit, so the crystal never pumps in size as it revolves or the rings move.
function fitCrystalCamera(camera, model, width, height, requestedSize = width) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const radius = Math.max(...model.vertices.map(vertex => Math.hypot(...vertex)));
  const centerY = .5, floorTop = h * FOCUS_CAUSTICS.minimumTop;
  const gap = Math.max(4, Math.min(10, Math.min(w, h) * .025));
  const framePadding = 1.2; // Half of the maximum supported 2.4px frame.
  const maximumRadius = Math.min(.44 * w, h * (centerY - .04), floorTop - h * centerY - gap - framePadding);
  const standardMaximum = focusProjectionTarget({width: w, height: h, requested: Number.MAX_VALUE, radius});
  const maximumTarget = standardMaximum * Math.max(0, maximumRadius) / (.44 * Math.min(w, h));
  const target = Math.min(Math.max(1, Number.isFinite(requestedSize) ? requestedSize : w), maximumTarget);
  camera.fov = 2 * Math.atan(Math.tan(35 * Math.PI / 360) * w / target) * 180 / Math.PI;
  camera.aspect = w / h;
  camera.setViewOffset(w, h, 0, (.5 - centerY) * h, w, h);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return {width: w, height: h, centerY, floorTop, gap, framePadding, radius, target, maximumTarget,
    reservedCrystalBottom: h * centerY + maximumRadius};
}
function projectCrystalPoints(model, camera, width, height, matrix) {
  return model.vertices.map(vertex => {
    const world = new THREE.Vector3(...vertex).applyMatrix4(matrix), point = world.clone().project(camera);
    return [(point.x + 1) * width / 2, (1 - point.y) * height / 2, world.z];
  });
}
function crystalPointBounds(points) {
  return {left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])),
    top: Math.min(...points.map(point => point[1])), bottom: Math.max(...points.map(point => point[1]))};
}

// DOM-free material core. Tests exercise these exact production materials.
export function createCrystalScene({appearance, transform, totalMs = 0, dailyMs = null, quality = 'high', floating = false} = {}) {
  let floatOffset = 0;
  let transformState=normalizeTransform(transform), phaseX=0, phaseZ=0;
  let settings = normalizeFocusAppearance(appearance), total = confirmedMs(totalMs), mode = qualityOf(quality), current = null, key = '', disposed = false;
  let daily = dailyMs === null ? null : confirmedMs(dailyMs);
  let starCount = -1, stars = null, orbitLines = null, backgroundCount = -1, backgroundStars = null;
  let layoutState = null;
  let opticalTime = 0, orbitTime = 0, lastTime = null, rotationPhase = 0, staticView = false, poseResetPending = false;
  const scene = new THREE.Scene(), group = new THREE.Group(), camera = new THREE.PerspectiveCamera(35, 1, .1, 30);
  camera.position.set(0, 0, 7.8); camera.lookAt(0, 0, 0); const floatGroup=new THREE.Group();floatGroup.add(group);scene.add(floatGroup); group.rotation.set(...CRYSTAL_INITIAL_ROTATION, CRYSTAL_ROTATION_ORDER);
  function clear() { for (const child of [...group.children]) { group.remove(child); child.geometry.dispose(); child.material.dispose(); } }
  function uniforms(backside) {
    return {eye: {value: camera.position}, backside: {value: backside}, focusLight: {value: new THREE.Vector4(1, 0, 1, .4)},
      focusStageTint: {value: new THREE.Color()}, focusRainbowMix: {value: 0}, focusRainbowTime: {value: 0}, focusFaceBrightness: {value: settings.faceBrightness},
      focusReflectionStrength: {value: settings.reflectionStrength}, focusColorSaturation: {value: settings.colorSaturation}, focusWholeGlow: {value: 0}};
  }
  function rebuild() {
    if (disposed) return;
    const nextBackgroundCount = backgroundStarCountFor(total);
    if (nextBackgroundCount !== backgroundCount) {
      if (backgroundStars) { scene.remove(backgroundStars); backgroundStars.geometry.dispose(); backgroundStars.material.dispose(); }
      backgroundCount = nextBackgroundCount; backgroundStars = makeBackgroundStars(backgroundCount);
      if (backgroundStars) scene.add(backgroundStars);
    }
    const count = crystalStarCountFor(total);
    if (count !== starCount) {
      if (stars) { scene.remove(stars); stars.geometry.dispose(); stars.material.dispose(); }
      if (orbitLines) { scene.remove(orbitLines); orbitLines.geometry.dispose(); orbitLines.material.dispose(); }
      starCount = count; stars = makeOrbitStars(count); orbitLines = makeOrbitLines(count);
      if (stars && orbitLines) scene.add(orbitLines, stars);
    }
    const stage = crystalStageFor(total), next = stage + '/' + mode;
    if (next === key) return;
    current = focusModel(stage, mode);
    if (!current.validation.valid) throw Error('geometry_validation_failed');
    clear(); key = next;
    const geometry = geometryFor(current);
    const surface = (side, back) => new THREE.Mesh(back ? geometry : geometry.clone(), new THREE.ShaderMaterial({uniforms: uniforms(back),
      vertexShader: vertex, fragmentShader: fragment, transparent: true, blending: THREE.NormalBlending, premultipliedAlpha: false,
      depthTest: true, depthWrite: true, side}));
    const behind = wideLine(edgeGeometryFor(current), 1, camera), back = surface(THREE.BackSide, 1), front = surface(THREE.FrontSide, 0), outline = wideLine(edgeGeometryFor(current), 0, camera);
    behind.renderOrder = 0; back.renderOrder = 1; front.renderOrder = 2; outline.renderOrder = 3;
    group.add(behind, back, front, outline);
  }
  function update(next = {}) {
    if (disposed) return;
    if ('appearance' in next) settings = normalizeFocusAppearance(next.appearance, settings);
    if ('totalMs' in next) total = confirmedMs(next.totalMs);
    if ('dailyMs' in next) daily = next.dailyMs === null ? null : confirmedMs(next.dailyMs);
    if ('quality' in next) mode = qualityOf(next.quality);
    // Old inspection modes are accepted as harmless aliases. Saved X/Z rates
    // and negative Y values remain intact; only |Y| drives this visual motion.
    if ('transform' in next) {const state=normalizeTransform(next.transform);if(state.angles.x!==transformState.angles.x)phaseX=0;if(state.angles.y!==transformState.angles.y)rotationPhase=0;if(state.angles.z!==transformState.angles.z)phaseZ=0;transformState=state;}
    if (next.resetPose === true) {phaseX=0;phaseZ=0;
      rotationPhase = 0; group.rotation.set(...CRYSTAL_INITIAL_ROTATION, CRYSTAL_ROTATION_ORDER);
      poseResetPending = true;
    }
  }

  function frame({seconds = 0, width = 320, height = 360, reducedMotion = false, paused = false, view = null, requestedSize, dpr = 1} = {}) {
    if (disposed) return null;
    rebuild();
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const delta = lastTime === null ? 0 : Math.max(0, time - lastTime);
    // A stale render cannot move the anchor backwards and create a catch-up jump.
    lastTime = lastTime === null ? time : Math.max(lastTime, time);
    // World-Y clockwise is defined looking from +Y toward the origin.
    // Integrate a nonnegative phase independently of Euler components so a
    // static view, stage rebuild or legacy XYZ mode cannot reverse its axis.
    const explicitView = Array.isArray(view) && view.length === 3 && view.every(Number.isFinite);
    if (explicitView) {
      staticView = true; group.rotation.set(...view, CRYSTAL_ROTATION_ORDER);
    } else {
      if (staticView) { phaseX=0;phaseZ=0;rotationPhase = 0; poseResetPending = true; lastTime = time; }
      staticView = false;
      if (!poseResetPending && !reducedMotion && !paused) {if(transformState.enabled.y)rotationPhase += delta * Math.abs(settings.rotationY) * Math.PI / 180;if(transformState.enabled.x)phaseX+=delta*settings.rotationX*Math.PI/180;if(transformState.enabled.z)phaseZ+=delta*settings.rotationZ*Math.PI/180;}
      group.rotation.set(transformState.angles.x*Math.PI/180+phaseX, transformState.angles.y*Math.PI/180-(rotationPhase === 0 ? 0 : rotationPhase), transformState.angles.z*Math.PI/180+phaseZ, CRYSTAL_ROTATION_ORDER);
    }
    poseResetPending = false;
    if (!reducedMotion && !paused) { opticalTime += delta; orbitTime += delta * settings.orbitSpeed; }
    if (stars) { stars.material.uniforms.starTime.value = orbitTime; stars.material.uniforms.starDpr.value = dpr; }
    if (backgroundStars) {
      backgroundStars.material.uniforms.backgroundTime.value = opticalTime;
      backgroundStars.material.uniforms.backgroundDpr.value = dpr;
      backgroundStars.material.uniforms.backgroundStarSize.value = settings.backgroundStarSize;
      backgroundStars.material.uniforms.backgroundTwinkle.value = settings.backgroundTwinkle;
      backgroundStars.material.uniforms.backgroundTwinkleInterval.value = settings.backgroundTwinkleInterval;
    }
    const w = Math.max(1, width), h = Math.max(1, height);
    const orbitScale = new THREE.Vector2(Math.min(w, h) / w, Math.min(w, h) / h);
    if (orbitLines) {
      orbitLines.material.uniforms.orbitScale.value.copy(orbitScale);
      orbitLines.material.uniforms.orbitOpacity.value = crystalOrbitOpacityFor(starCount, settings.orbitOpacity);
    }
    if (stars) stars.material.uniforms.orbitScale.value.copy(orbitScale);
    layoutState = fitCrystalCamera(camera, current, w, h, requestedSize || w);
    floatGroup.position.y=0;floatGroup.updateMatrixWorld(true);
    const neutralBounds=crystalPointBounds(projectCrystalPoints(current,camera,w,h,group.matrixWorld));
    const haloBounds=focusHalo({width:w,height:h,appearance:settings}).bounds;
    const amplitude=floating?Math.max(0,Math.min(6,neutralBounds.top-4,h-neutralBounds.bottom-4,haloBounds.top-2,h-haloBounds.bottom-2)):0;
    floatOffset=amplitude*Math.sin(opticalTime*Math.PI*2/12);
    // World translation is composed outside the unchanged Euler rotation.
    floatGroup.position.y=-floatOffset*2*camera.position.z*Math.tan(camera.fov*Math.PI/360)/h;
    floatGroup.updateMatrixWorld(true);
    layoutState.neutralBounds=neutralBounds;
    layoutState.bounds=crystalPointBounds(projectCrystalPoints(current,camera,w,h,group.matrixWorld));
    layoutState.floating={enabled:Boolean(floating),offsetY:floatOffset,amplitude,periodSeconds:12};
    const light = focusLightingState({seconds: opticalTime, appearance: settings, stage: crystalStageFor(daily ?? total), reducedMotion, paused});
    const palette = focusStagePalette(crystalStageFor(daily ?? total)), tint = new THREE.Color(palette.tint);
    const edgeTint = crystalEdgeTintFor(crystalStageFor(daily ?? total), settings);
    for (const child of group.children) {
      if (child.isLineSegments2) {
        child.material.linewidth = settings.frameWidth; child.material.resolution.set(w, h); child.material.color.copy(edgeTint);
        child.material.userData.edgeOpacity.value = child.renderOrder === 0 ? .075 : light.edgeOpacity; continue;
      }
      const u = child.material.uniforms;
      u.focusStageTint.value.copy(tint); u.focusRainbowMix.value = palette.rainbowMix; u.focusRainbowTime.value = opticalTime; u.focusFaceBrightness.value = settings.faceBrightness;
      u.focusReflectionStrength.value = settings.reflectionStrength; u.focusColorSaturation.value = settings.colorSaturation;
      u.focusWholeGlow.value = light.wholeGlow; u.focusLight.value.set(1, light.time, light.strength, light.edgeOpacity);
    }
    return light;
  }
  return {scene, group, floatGroup, camera, update, frame, get floatOffset(){return floatOffset}, get transform(){return normalizeTransform(transformState)}, get layout() { return layoutState; }, get inspectionMode() { return CRYSTAL_ROTATION_MODE; }, get rotationPhase() { return rotationPhase; }, get staticView() { return staticView; }, get orbitLines() { return orbitLines; }, get stars() { return stars; }, get backgroundStars() { return backgroundStars; }, get orbitTime() { return orbitTime; }, get opticalTime() { return opticalTime; }, get current() { return current; }, get appearance() { return {...settings}; },
    get totalMs() { return total; }, get colorStage() { return crystalStageFor(daily ?? total); }, get dailyMs() { return daily; }, get quality() { return mode; }, dispose() { if (!disposed) { clear(); if (backgroundStars) { scene.remove(backgroundStars); backgroundStars.geometry.dispose(); backgroundStars.material.dispose(); backgroundStars = null; } if (orbitLines) { scene.remove(orbitLines); orbitLines.geometry.dispose(); orbitLines.material.dispose(); orbitLines = null; } if (stars) { scene.remove(stars); stars.geometry.dispose(); stars.material.dispose(); stars = null; } disposed = true; } }};
}

// Transparent SVG is an honest static fallback, not a simulated glass shader.
export function projectedCrystalSVG(model, appearance, projection, colorStage = model.stage) {
  const settings = normalizeFocusAppearance(appearance), rotate = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...CRYSTAL_INITIAL_ROTATION, CRYSTAL_ROTATION_ORDER));
  const projected = projection ? projectCrystalPoints(model, projection.camera, projection.width, projection.height, rotate) :
    model.vertices.map(vertex => { const p = new THREE.Vector3(...vertex).applyMatrix4(rotate), k = 80 * 7.8 / (7.8 - p.z); return [160 + p.x * k, 180 - p.y * k, p.z]; });
  const order = model.faces.map((face, i) => ({face, i, z: face.reduce((sum, k) => sum + projected[k][2], 0) / 3})).sort((a, b) => a.z - b.z);
  const palette = focusStagePalette(colorStage), stageTint = new THREE.Color(palette.tint).toArray();
  return '<g stroke="#' + crystalEdgeTintFor(colorStage, settings).getHexString() + '" stroke-width="' + settings.frameWidth + '">' + order.map(({face, i}) => {
    const color = new THREE.Color().fromArray(focusFacetTint({stageTint, rainbowMix: palette.rainbowMix, facet: model.faceIds[i], seconds: 0, saturation: settings.colorSaturation}));
    const fill = '#' + color.clone().multiplyScalar(settings.faceBrightness * (.42 + .40 * Math.abs(model.normals[i][2]))).getHexString();
    return '<polygon vector-effect="non-scaling-stroke" points="' + face.map(k => projected[k].slice(0, 2).map(value => value.toFixed(2)).join(',')).join(' ') + '" fill="' + fill + '" fill-opacity=".3"/>';
  }).join('') + '</g>';
}

/** Public adapter contract. totalMs is confirmed persisted milliseconds only.
 * autoAnimate:false lets the existing Focus scheduler own its one RAF loop.
 * Other hosts receive one FPS-capped loop, canceled on hidden/offscreen/pause.
 * rendererFactory is an optional dependency seam for deterministic CPU tests.
 */
export function createCrystalView({host, appearance, totalMs = 0, dailyMs = null, paused = false, onStatus, quality = 'high', autoAnimate = true, rendererFactory, floating = false} = {}) {
  if (!host?.append || !host.ownerDocument) throw new TypeError('crystal_host_required');
  const doc = host.ownerDocument, win = doc.defaultView || globalThis, now = () => win.performance?.now() ?? Date.now();
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)') || {matches: false};
  let initialTransform;try{initialTransform=win.pdcaFocusTransform||readTransformStorage(win.localStorage)}catch{}
  const core = createCrystalScene({appearance,transform:initialTransform,totalMs,dailyMs,quality,floating});
  const haloGradientId = 'crystal-view-halo-' + ++crystalViewSequence;
  let stopped = Boolean(paused), disposed = false, suspended = false, renderer = null, fallbackNode = null, fallbackReason = '', failed = false;
  let raf = null, lastFrame = null, lastDraw = -Infinity, seconds = 0, renderCount = 0, inViewport = true, lastStatus = -Infinity, light = null;
  let gpuExt = null, gpuQuery = null, gpuDisjoint = 0, gpuSamples = [], cpuSamples = [], frameTimes = [], contextInfo = {};
  let causticCanvas = null, causticContext = null, causticSVG = null, causticState = null, haloState = null, displayedLayout = null, ambientFallbackReason = '', warningNode = null, renderedOrbitCount = 0, renderedBackgroundCount = 0;
  const samples = (list, value, max) => { list.push(value); if (list.length > max) list.shift(); };
  function visible() {
    if (disposed || suspended || doc.hidden || host.isConnected === false || host.hidden || !inViewport) return false;
    if (host.closest?.('[hidden]')) return false;
    return host.clientWidth > 0 && host.clientHeight > 0 && (!host.getClientRects || host.getClientRects().length > 0);
  }
  function cancel() { if (raf !== null) { win.cancelAnimationFrame?.(raf); raf = null; } lastFrame = null; }
  function diagnostics() {
    const current = core.current, count = crystalStarCountFor(core.totalMs), segments = crystalOrbitSegmentsFor(count);
    const renderedCount = renderedOrbitCount;
    return {rendererId: CRYSTAL_RENDERER_ID, mode: failed ? 'static-fallback' : renderer ? 'webgl2-volume' : 'not-rendered', fallbackReason,
      revision: 'F2', refine: 'F2', design: FOCUS_GEOMETRY_ID, geometryName: 'ティアドロップ', stage: crystalStageFor(core.totalMs), totalMs: core.totalMs,
      growthSource: 'confirmed-total-ms', colorStage: core.colorStage, dailyMs: core.dailyMs, colorSource: core.dailyMs === null ? 'legacy-total-ms' : 'confirmed-jst-daily-ms',
      orbitCurves: {count, renderedCount, segmentsPerCurve: segments, submittedSegments: renderedCount * segments,
        maxSubmittedSegments: MAX_ORBIT_SEGMENTS, opacity: crystalOrbitOpacityFor(count, core.appearance.orbitOpacity), baseOpacity: core.appearance.orbitOpacity, opacityMode: 'square-root-density-compensation', instanceCount: renderer && segments ? count : 0,
        allocatedAngleVertices: renderer && segments ? segments * 2 : 0,
        attributeBytes: renderer && segments ? (segments * 2 * 3 + count * 4) * 4 : 0,
        coordinateSpace: 'aspect-corrected-screen', sharedWithStars: true, oneCurvePerStar: true,
        tessellation: segments < CRYSTAL_ORBIT_SEGMENTS && segments ? 'adaptive-coarse' : 'smooth', starPosition: 'interpolated-visible-segment',
        supported: Boolean(segments), maxSupportedCount: MAX_ORBIT_STARS, warning: orbitWarning()},
      orbitStars: {count, renderedCount, speedMultiplier: core.appearance.orbitSpeed, orbitSeconds: core.orbitTime, supported: Boolean(segments), maxSupportedCount: MAX_ORBIT_STARS, warning: orbitWarning()},
      backgroundStars: {count: backgroundStarCountFor(core.totalMs), renderedCount: renderedBackgroundCount,
        supported: backgroundStarsSupported(backgroundStarCountFor(core.totalMs)), maxSupportedCount: MAX_BACKGROUND_STARS,
        intervalMinutes: 25, seconds: core.opticalTime, sizeMultiplier: core.appearance.backgroundStarSize, twinkleDepth: core.appearance.backgroundTwinkle, twinkleInterval: core.appearance.backgroundTwinkleInterval, independentAnimationLoops: 0,
        coordinateSpace: 'normalized-host-background', seed: 'stable-index-v1', warning: backgroundWarning()},
      crystalLayout: displayedLayout, floating: displayedLayout?.floating ?? {enabled:false,offsetY:0},
      ambientLayerCount: fallbackNode || causticCanvas || causticSVG ? 1 : 0,
      halo: {mode: fallbackNode ? 'static-svg' : causticCanvas ? 'canvas-2d' : causticSVG ? 'svg-layer' : 'not-rendered',
        strength: core.appearance.haloStrength, spread: core.appearance.haloSpread, depth: core.appearance.haloDepth, interval: core.appearance.haloInterval,
        alpha: haloState?.alpha ?? null, bounds: haloState?.bounds ?? null, themeColor: haloState?.themeColor ?? null, seconds: core.opticalTime,
        layer: 'behind-crystal-and-floor', sharedCausticLayer: true, additionalCanvasLayers: 0, additionalGpuDrawCalls: 0, independentAnimationLoops: 0, fallbackReason: ambientFallbackReason},
      caustics: {mode: fallbackNode ? 'static-svg' : causticCanvas ? 'canvas-2d' : causticSVG ? 'svg-layer' : 'not-rendered',
        canvasLayerCount: causticCanvas ? 1 : 0, loops: causticState?.loops.length || 0, loopCount: causticState?.loops.length || 0, bounds: causticState?.bounds ?? null,
        seconds: core.opticalTime, stageScale: causticState?.stageScale ?? null, phase: causticState?.phase ?? null,
        glow: causticState?.glow ?? null, strength: core.appearance.causticStrength, interval: core.appearance.causticInterval, themeColor: causticState?.themeColor ?? null, clearanceY: causticState?.clearanceY ?? null, crystalBottom: causticState?.crystalBottom ?? null, clearanceGap: causticState?.clearanceGap ?? null,
        width: causticState?.width ?? null, height: causticState?.height ?? null, independentAnimationLoops: 0, layer: 'floor-behind-crystal'}, rotationSpeeds: {x: core.appearance.rotationX, y: core.appearance.rotationY, z: core.appearance.rotationZ}, appearance: core.appearance, focusAppearance: core.appearance, focusStagePalette: {...focusStagePalette(core.colorStage)},
      focusLighting: {...FOCUS_LIGHTING, ...light}, optics: failed ? 'Static SVG projection with stage tint, face brightness, saturation, CSS-pixel frame width, seeded star size/twinkle brightness, held floor glow and bounded halo; no glass shader, reflections or live animation' : 'Convex rear/front cuts; independent transparent body, local reflection and slow whole-crystal glow; procedural refraction approximation',
      geometry: current?.validation, facets: current?.facetCount, closedMesh: current ? {vertices: current.vertices, faces: current.faces, normals: current.normals} : null,
      inspectionMode: core.inspectionMode, rotationInspection: core.inspectionMode, referencePose: [...CRYSTAL_INITIAL_ROTATION], poseReference: 'point-down-x-pi-y0-z0',
      effectiveRotationSpeeds: {x:core.transform.enabled.x?core.appearance.rotationX:0,y:core.transform.enabled.y?-Math.abs(core.appearance.rotationY):0,z:core.transform.enabled.z?core.appearance.rotationZ:0},transform:core.transform,
      rotationOrder: CRYSTAL_ROTATION_ORDER, rotationAxis: 'world-Y', rotationDirection: 'clockwise-from-positive-Y', rotationPhase: core.rotationPhase, staticView: core.staticView,
      rotation: [core.group.rotation.x, core.group.rotation.y, core.group.rotation.z], camera: {type: 'PerspectiveCamera', fov: core.camera.fov, near: .1, far: 30, position: core.camera.position.toArray()},
      limits: crystalLimits(core.quality), quality: core.quality, context: {...contextInfo},
      render: renderer ? {...renderer.info?.render, width: renderer.domElement.width, height: renderer.domElement.height, dpr: renderer.getPixelRatio(), renderCount} : null,
      renderCount, animationLoopCount: raf === null ? 0 : 1, autoAnimate, disposed, motionPaused: stopped, reducedMotion: Boolean(media.matches), hidden: Boolean(doc.hidden), visible: visible(), visualSeconds: seconds,
      gpuTimeMs: gpuSamples.length ? gpuSamples.reduce((a, b) => a + b, 0) / gpuSamples.length : null, gpuSamples: [...gpuSamples], gpuDisjoint,
      cpuSamples: [...cpuSamples], cpuSubmissionMs: cpuSamples.length ? cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length : null,
      observedFPS: frameTimes.length > 1 ? (frameTimes.length - 1) * 1000 / (frameTimes.at(-1) - frameTimes[0]) : null,
      edgeMode: 'screen', depth: {frontTest: true, frontWrite: true, backTest: true, backWrite: true}};
  }
  function status(force = false) {
    if (typeof onStatus !== 'function' || !force && now() - lastStatus < 500) return;
    lastStatus = now(); try { onStatus(diagnostics()); } catch { /* A consumer callback cannot stop drawing. */ }
  }
  function releaseRenderer() {
    if (!renderer) return;
    if (gpuQuery) { renderer.getContext().deleteQuery(gpuQuery); gpuQuery = null; }
    renderer.domElement.removeEventListener?.('webglcontextlost', contextLost);
    renderer.domElement.remove(); renderer.dispose(); renderer = null; renderedOrbitCount = 0; renderedBackgroundCount = 0;
  }
  function orbitWarning() {
    const count = crystalStarCountFor(core.totalMs);
    return count > MAX_ORBIT_STARS ? '可視描画の安全限界（' + MAX_ORBIT_STARS + '組）を超えたため、星と軌道を省略しています。記録上は各' + count + '個です。' : null;
  }
  function backgroundWarning() {
    const count = backgroundStarCountFor(core.totalMs);
    return !backgroundStarsSupported(count) ? '背景の追加星は描画安全限界（' + MAX_BACKGROUND_STARS + '個）を超えたため省略しています。記録上は' + count + '個です。' : null;
  }
  function updateOrbitWarning() {
    const warning = [orbitWarning(), backgroundWarning()].filter(Boolean).join(' ');
    if (!warning) { warningNode?.remove(); warningNode = null; return; }
    if (!warningNode) {
      warningNode = doc.createElement('div'); warningNode.dataset.crystalResourceWarning = 'true';
      warningNode.setAttribute('role', 'status');
      Object.assign(warningNode.style, {position: 'absolute', left: '4px', right: '4px', bottom: '4px', zIndex: '2',
        padding: '4px 6px', borderRadius: '6px', background: 'rgba(10,19,37,.88)', color: '#d5e8f7',
        fontSize: '10px', lineHeight: '1.35', pointerEvents: 'none'});
      host.append(warningNode);
    }
    warningNode.textContent = warning;
  }
  function causticOptions(width, height) {
    const stage = crystalStageFor(core.totalMs), tint = new THREE.Color(focusStagePalette(core.colorStage).tint);
    const themeColor = '#' + new THREE.Color().fromArray(focusSaturatedTint(tint.toArray(), core.appearance.colorSaturation)).getHexString();
    return {width, height, stage, seconds: core.opticalTime, themeColor, appearance: core.appearance,
      clearanceY: displayedLayout?.floorTop, crystalBottom: displayedLayout?.neutralBounds?.bottom ?? displayedLayout?.bounds.bottom ?? null, clearanceGap: displayedLayout?.gap ?? null};
  }
  function releaseCaustics() {
    causticCanvas?.remove(); causticSVG?.remove(); causticCanvas = null; causticContext = null; causticSVG = null;
  }
  function createCausticSVG() {
    causticSVG = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); causticSVG.dataset.crystalCaustics = 'true';
    causticSVG.setAttribute('aria-hidden', 'true');
    Object.assign(causticSVG.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none'});
    host.insertBefore ? host.insertBefore(causticSVG, renderer.domElement) : host.append(causticSVG);
  }
  function renderCaustics(width, height, dpr) {
    const options = causticOptions(width, height); causticState = focusCaustics(options);const haloOptions={...options,offsetY:core.floatOffset}; haloState = focusHalo(haloOptions);
    if (!causticCanvas && !causticSVG) {
      const canvas = doc.createElement('canvas'); let context = null;
      try { context = canvas.getContext?.('2d', {alpha: true}) || null; } catch { /* A SVG layer preserves the effect if Canvas2D is unavailable. */ }
      if (context) {
        causticCanvas = canvas; causticContext = context;
        canvas.className = 'shared-crystal-caustics'; canvas.dataset.crystalCaustics = 'true';
        canvas.setAttribute('aria-hidden', 'true');
        Object.assign(canvas.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none'});
        // The GPU canvas remains above this floor layer. Neither layer owns a RAF.
        host.insertBefore ? host.insertBefore(canvas, renderer.domElement) : host.append(canvas);
      } else { ambientFallbackReason = 'canvas_2d_unavailable'; createCausticSVG(); }
    }
    if (causticCanvas) {
      try {
        const pixelWidth = Math.floor(width * dpr), pixelHeight = Math.floor(height * dpr);
        if (causticCanvas.width !== pixelWidth || causticCanvas.height !== pixelHeight) {
          causticCanvas.width = pixelWidth; causticCanvas.height = pixelHeight;
        }
        causticCanvas.dataset.dpr = String(dpr); causticCanvas.dataset.causticLoops = String(causticState.loops.length);
        causticContext.setTransform(dpr, 0, 0, dpr, 0, 0); causticContext.clearRect(0, 0, width, height);
        drawFocusHalo(causticContext, haloOptions);
        drawFocusCaustics(causticContext, options);
      } catch (error) {
        ambientFallbackReason = error?.message || 'ambient_canvas_draw_failed';
        // An ambient-layer Canvas error must not remove the working glass renderer.
        causticCanvas.remove(); causticCanvas = null; causticContext = null; createCausticSVG();
      }
    }
    if (causticSVG) {
      causticSVG.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      causticSVG.innerHTML = projectedFocusHaloSVG(haloOptions, haloGradientId) + projectedFocusCausticsSVG(options);
    }
  }
  function showFallback(reason) {
    failed = true; fallbackReason = String(reason || 'webgl_unavailable'); cancel(); releaseRenderer(); releaseCaustics();
    if (!fallbackNode) {
      fallbackNode = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      fallbackNode.setAttribute('role', 'img');
      fallbackNode.setAttribute('aria-label', 'ティアドロップの静止代替表示。ガラスの反射・回転なし');
      Object.assign(fallbackNode.style, {width: '100%', height: '100%', display: 'block', position: 'absolute', inset: '0'});
      fallbackNode.dataset.crystalFallback = 'true'; host.append(fallbackNode);
    }
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    const model = focusModel(crystalStageFor(core.totalMs), 'low'), camera = core.camera.clone();
    displayedLayout = fitCrystalCamera(camera, model, width, height);
    const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...CRYSTAL_INITIAL_ROTATION, CRYSTAL_ROTATION_ORDER));
    displayedLayout.bounds = crystalPointBounds(projectCrystalPoints(model, camera, width, height, rotation));
    const options = causticOptions(width, height); causticState = focusCaustics(options); haloState = focusHalo(options);
    fallbackNode.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    fallbackNode.innerHTML = projectedFocusHaloSVG(options, haloGradientId) + projectedFocusCausticsSVG(options) +
      projectedBackgroundStarsSVG({totalMs: core.totalMs, width, height, seconds: core.opticalTime, appearance: core.appearance}, haloGradientId + '-background') + projectedOrbitCurvesSVG(width, height, core.totalMs, core.appearance) +
      projectedCrystalSVG(model, core.appearance, {camera, width, height}, core.colorStage) + projectedOrbitStarsSVG(core.totalMs, width, height);
    renderedOrbitCount = crystalOrbitSegmentsFor(crystalStarCountFor(core.totalMs)) ? crystalStarCountFor(core.totalMs) : 0;
    renderedBackgroundCount = backgroundStarsSupported(backgroundStarCountFor(core.totalMs)) ? backgroundStarCountFor(core.totalMs) : 0;
    updateOrbitWarning(); status(true);
  }
  function contextLost(event) { event.preventDefault(); showFallback('webgl_context_lost'); }
  function initialize() {
    if (renderer || failed) return;
    let canvas, context;
    if (!rendererFactory) {
      if (new URLSearchParams(win.location?.search || '').has('fallback')) throw Error('forced_static_fallback');
      canvas = doc.createElement('canvas');
      context = canvas.getContext('webgl2', {alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power'});
      if (!context) throw Error('webgl2_unavailable');
    }
    renderer = rendererFactory ? rendererFactory() : new THREE.WebGLRenderer({canvas, context, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power'});
    if (renderer.debug) renderer.debug.onShaderError = () => { throw Error('shader_compilation_failed'); };
    renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (renderer.info) renderer.info.autoReset = true;
    renderer.domElement.className = 'volume-canvas shared-crystal-canvas';
    renderer.domElement.setAttribute('aria-label', 'F2 ティアドロップ・クリスタル');
    Object.assign(renderer.domElement.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none'});
    renderer.domElement.addEventListener('webglcontextlost', contextLost); host.append(renderer.domElement);
    const gl = renderer.getContext(), dbg = gl.getExtension?.('WEBGL_debug_renderer_info');
    contextInfo = {version: gl.getParameter?.(gl.VERSION), renderer: gl.getParameter?.(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER), threeRevision: THREE.REVISION};
    contextInfo.software = /SwiftShader|llvmpipe|software|WARP|Microsoft Basic/i.test(contextInfo.renderer || '');
    gpuExt = gl.getExtension?.('EXT_disjoint_timer_query_webgl2'); contextInfo.gpuTimerExtension = Boolean(gpuExt);
  }
  function pollGPU() {
    if (!gpuQuery || !renderer) return;
    const gl = renderer.getContext();
    if (gl.getParameter(gpuExt.GPU_DISJOINT_EXT)) { gl.deleteQuery(gpuQuery); gpuQuery = null; gpuDisjoint++; return; }
    if (gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT_AVAILABLE)) {
      samples(gpuSamples, gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT) / 1e6, 60); gl.deleteQuery(gpuQuery); gpuQuery = null;
    }
  }
  function renderFrame(nextSeconds = seconds, options = {}) {
    if (!visible()) return;
    if (Number.isFinite(nextSeconds)) seconds = Math.max(0, nextSeconds);
    if (failed) { showFallback(fallbackReason); return; }
    try {
      initialize();
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight), limits = crystalLimits(core.quality);
      const dpr = Math.min(win.devicePixelRatio || 1, limits.dpr, limits.maxBufferSide / width, limits.maxBufferSide / height);
      if (renderer.domElement.width !== Math.floor(width * dpr) || renderer.domElement.height !== Math.floor(height * dpr)) {
        renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
      }
      light = core.frame({...options, seconds, width, height, dpr, reducedMotion: Boolean(media.matches), paused: stopped});
      displayedLayout = core.layout;host.setAttribute?.('data-crystal-rotation',JSON.stringify(core.group.rotation.toArray().slice(0,3).map(v=>v*180/Math.PI)));host.setAttribute?.('data-crystal-transform',JSON.stringify(core.transform));
      renderer.domElement.style.filter = light.bloomFilter;
      renderCaustics(width, height, dpr); updateOrbitWarning();
      pollGPU(); const gl = renderer.getContext(); let measuring = false;
      if (gpuExt && !gpuQuery && renderCount > 8 && renderCount % 4 === 0) { gpuQuery = gl.createQuery(); gl.beginQuery(gpuExt.TIME_ELAPSED_EXT, gpuQuery); measuring = true; }
      const start = now(); renderer.render(core.scene, core.camera); samples(cpuSamples, now() - start, 90);
      if (measuring) gl.endQuery(gpuExt.TIME_ELAPSED_EXT);
      renderedOrbitCount = core.stars?.geometry.getAttribute('position').count || 0;
      renderedBackgroundCount = core.backgroundStars?.geometry.getAttribute('position').count || 0;
      renderCount++; samples(frameTimes, now(), 90); status();
    } catch (error) { showFallback(error?.message || error); }
  }
  function shouldAnimate() {
    const appearance = core.appearance;
    const dynamic = appearance.rotationY !== 0 ||
      appearance.reflectionStrength > 0 || appearance.glowStrength > 0 || appearance.causticStrength > 0 || appearance.haloStrength > 0 && appearance.haloDepth > 0 ||
      backgroundStarCountFor(core.totalMs) > 0 && appearance.backgroundTwinkle > 0 ||
      focusStagePalette(core.colorStage).rainbowMix > 0 || crystalStarCountFor(core.totalMs) <= MAX_ORBIT_STARS;
    return dynamic && autoAnimate && !stopped && !media.matches && !failed && visible();
  }
  function schedule() { if (raf === null && shouldAnimate()) raf = win.requestAnimationFrame?.(tick) ?? null; }
  function tick(timestamp) {
    raf = null; if (!shouldAnimate()) { lastFrame = null; return; }
    const delta = lastFrame === null ? 0 : Math.max(0, timestamp - lastFrame) / 1000; lastFrame = timestamp; seconds += delta;
    if (timestamp - lastDraw >= 1000 / crystalLimits(core.quality).fps) { renderFrame(seconds); lastDraw = timestamp; }
    schedule();
  }
  function sync() {
    // A slider, saved-state refresh or resize is not a motion interruption.
    // Preserve the live anchor and pending RAF during ordinary updates.
    if (!shouldAnimate()) cancel();
    if (visible()) renderFrame(seconds);
    schedule();
  }
  function transformChanged(event){if(event.detail?.values)update({transform:event.detail.values,resetPose:event.detail.resetPose===true});}
  win.addEventListener?.('pdca:crystal-transform',transformChanged);
  function pageHide() { suspended = true; cancel(); }
  function pageShow() { suspended = false; sync(); }
  function update(next = {}, {redraw = true} = {}) {
    if (disposed) return diagnostics();
    core.update(next); if ('paused' in next) stopped = Boolean(next.paused);
    if (redraw) { sync(); status(true); } else if (!shouldAnimate()) cancel();
    return diagnostics();
  }
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(sync) : null;
  resize?.observe(host);
  const intersection = typeof win.IntersectionObserver === 'function' ? new win.IntersectionObserver(entries => {
    inViewport = entries.some(entry => entry.isIntersecting); sync();
  }) : null;
  intersection?.observe(host);
  doc.addEventListener('visibilitychange', sync); media.addEventListener?.('change', sync); win.addEventListener?.('resize', sync);
  win.addEventListener?.('pagehide', pageHide); win.addEventListener?.('pageshow', pageShow);
  function dispose() {
    if (disposed) return;
    disposed = true;win.removeEventListener?.('pdca:crystal-transform',transformChanged);cancel(); resize?.disconnect(); intersection?.disconnect();
    doc.removeEventListener('visibilitychange', sync); media.removeEventListener?.('change', sync); win.removeEventListener?.('resize', sync);
    win.removeEventListener?.('pagehide', pageHide); win.removeEventListener?.('pageshow', pageShow);
    releaseRenderer(); releaseCaustics(); fallbackNode?.remove(); fallbackNode = null; warningNode?.remove(); warningNode = null; renderedOrbitCount = 0; renderedBackgroundCount = 0; core.dispose();
  }
  function resetMetrics() { cpuSamples = []; gpuSamples = []; gpuDisjoint = 0; frameTimes = []; renderCount = 0; }
  sync(); status(true);
  return {update, renderFrame, dispose, diagnostics, resetMetrics};
}
