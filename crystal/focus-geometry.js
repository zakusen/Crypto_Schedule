// Focus-only pear-cut solid. The original dashboard geometry stays in geometry.mjs.
// Rings sample a convex pear surface; their staggered vertices are joined by a
// convex hull, so adjacent triangles are genuine cut planes rather than an
// extruded outline or decorative diagonals on a flat face.
import {sub, cross, dot, length, validateModel} from './geometry.js';

export const FOCUS_GEOMETRY_ID = 'FOCUS_TEARDROP';
export const FOCUS_GEOMETRY_STAGES = Object.freeze([
  {thresholdMinutes: 0, label: 'しずくの原石', sectors: 8, rings: [-.85, -.30, .40]},
  {thresholdMinutes: 100, label: '輪郭を研磨', sectors: 8, rings: [-.91, -.55, -.10, .55]},
  {thresholdMinutes: 200, label: '反射面を増やす', sectors: 10, rings: [-.94, -.69, -.30, .15, .65]},
  {thresholdMinutes: 300, label: '精巧な多面カット', sectors: 12, rings: [-.94, -.69, -.30, .15, .65]},
  {thresholdMinutes: 400, label: 'しずくの完成形', sectors: 12, rings: [-.96, -.76, -.42, -.08, .31, .70]},
].map(stage => Object.freeze({...stage, rings: Object.freeze(stage.rings)})));

const LOW_RINGS = Object.freeze([
  [-.80, -.20], [-.85, -.30, .40], [-.91, -.55, -.10, .55],
  [-.94, -.69, -.30, .15, .65], [-.96, -.76, -.42, -.08, .31, .70],
].map(Object.freeze));
const WIDTH = 1.06, DEPTH = .80, HALF_HEIGHT = 1.85, Y_CENTER = .15;
const EPSILON = 1e-10;

function finiteNonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

// Input is confirmed, persisted minutes supplied by the existing Focus store.
// This pure module never reads wall-clock seconds or changes a timer/session.
export function focusStageFor(confirmedMinutes, growthEnabled = true) {
  return growthEnabled ? Math.min(4, Math.floor(finiteNonnegative(confirmedMinutes) / 100)) : 0;
}

function pearRadius(t) {
  // A rounded elliptical bowl meets a smooth, long taper at its widest point.
  // Both halves are concave, meet with a horizontal tangent and enclose a
  // convex solid. The top has a finite slope and terminates in a sharp point.
  if (t <= -.30) return Math.sqrt(Math.max(0, 1 - ((t + .30) / .70) ** 2));
  const h = t + .30, span = 1.30, shoulder = .26;
  return Math.max(0, 1 - (h - shoulder * (1 - Math.exp(-h / shoulder))) /
    (span - shoulder * (1 - Math.exp(-span / shoulder))));
}

function triangleNormal(vertices, [a, b, c]) {
  return cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a]));
}

function convexCut(vertices) {
  // Incremental hull, bounded to 74 vertices. A fixed interior point keeps all
  // faces outward. Computing the true hull also avoids inward folds when a
  // finer staggered ring meets the almost-straight upper taper.
  const bottom = vertices.length - 2, top = vertices.length - 1;
  const first = 0;
  const plane = triangleNormal(vertices, [bottom, top, first]);
  let fourth = -1, farthest = 0;
  for (let index = 1; index < vertices.length - 2; index++) {
    const distance = Math.abs(dot(plane, sub(vertices[index], vertices[bottom])));
    if (distance > farthest) { farthest = distance; fourth = index; }
  }
  if (fourth < 0 || farthest < EPSILON) throw new Error('focus_teardrop_seed_degenerate');
  const seed = [bottom, top, first, fourth];
  const interior = [0, 1, 2].map(axis => seed.reduce((sum, index) => sum + vertices[index][axis], 0) / 4);
  const outward = face => dot(triangleNormal(vertices, face), sub(interior, vertices[face[0]])) > 0
    ? [face[0], face[2], face[1]] : face;
  let faces = [
    [bottom, top, first], [bottom, fourth, top],
    [bottom, first, fourth], [top, fourth, first],
  ].map(outward);
  for (let index = 0; index < vertices.length; index++) {
    if (seed.includes(index)) continue;
    const visible = new Set();
    faces.forEach((face, faceIndex) => {
      if (dot(triangleNormal(vertices, face), sub(vertices[index], vertices[face[0]])) > EPSILON) visible.add(faceIndex);
    });
    if (!visible.size) continue;
    const horizon = new Map();
    for (const faceIndex of visible) {
      const face = faces[faceIndex];
      for (let edge = 0; edge < 3; edge++) {
        const a = face[edge], b = face[(edge + 1) % 3];
        const key = Math.min(a, b) + ':' + Math.max(a, b);
        if (horizon.has(key)) horizon.delete(key);
        else horizon.set(key, [a, b]);
      }
    }
    faces = faces.filter((_, faceIndex) => !visible.has(faceIndex));
    for (const [a, b] of horizon.values()) faces.push(outward([a, b, index]));
  }
  return faces;
}

export function focusModel(stage = 0, quality = 'high') {
  const level = Math.min(4, Math.floor(finiteNonnegative(stage)));
  const mode = quality === 'low' ? 'low' : 'high';
  const definition = FOCUS_GEOMETRY_STAGES[level];
  const rings = mode === 'low' ? LOW_RINGS[level] : definition.rings;
  const n = mode === 'low' ? 6 : definition.sectors;
  const vertices = [];
  rings.forEach((t, ring) => {
    const radius = pearRadius(t);
    for (let sector = 0; sector < n; sector++) {
      // Half-sector staggering creates triangular brilliant-style cuts. The
      // small progression prevents accidental coplanar four-corner facets.
      const angle = (sector + ring * .5 + ring * ring * .037) * 2 * Math.PI / n;
      vertices.push([WIDTH * radius * Math.cos(angle), Y_CENTER + HALF_HEIGHT * t, DEPTH * radius * Math.sin(angle)]);
    }
  });
  vertices.push([0, Y_CENTER - HALF_HEIGHT, 0], [0, Y_CENTER + HALF_HEIGHT, 0]);
  const faces = convexCut(vertices);
  const normals = faces.map(face => {
    const normal = triangleNormal(vertices, face), magnitude = length(normal);
    return normal.map(value => value / magnitude);
  });
  const faceIds = faces.map((_, index) => index);
  const result = {
    design: FOCUS_GEOMETRY_ID, stage: level, quality: mode, n,
    vertices, faces, faceIds, normals, facetCount: faces.length,
    shape: 'teardrop', ringCount: rings.length,
    thresholdMinutes: definition.thresholdMinutes,
  };
  result.validation = validateModel(result);
  return result;
}
