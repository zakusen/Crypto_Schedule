import {normalizeFocusAppearance, FOCUS_APPEARANCE_DEFAULTS, FOCUS_APPEARANCE_LIMITS} from './focus-lighting.js';
// Extra background stars are earned by CONFIRMED 25-minute totals. They are
// independent of the 100-minute orbit stars and leave the base backdrop intact.
// All three screens and the temporary growth preview consume these pure rules.
export const BACKGROUND_STAR_INTERVAL_MS = 25 * 60 * 1000;
export const MAX_BACKGROUND_STARS = 16384;
const TAU = Math.PI * 2;
// The seeded size is retained as the center's reference diameter. Only the
// decorative point footprint grows to fit the short rays and faint halo.
// GPU, CPU checks and the static SVG all share these four soft radial layers.
export const BACKGROUND_STAR_SPARKLE = Object.freeze({
  id: 'bright-center-cross-halo-v15', extent: 4, color: '#eaf3ff',
  mean: .56, amplitude: .44,
  layers: Object.freeze([
    Object.freeze({name: 'halo', radiusX: 1, radiusY: 1, alpha: .13}),
    Object.freeze({name: 'horizontal-ray', radiusX: .8, radiusY: .075, alpha: .62}),
    Object.freeze({name: 'vertical-ray', radiusX: .075, radiusY: .8, alpha: .62}),
    Object.freeze({name: 'center', radiusX: .24, radiusY: .24, alpha: 1}),
  ]),
});
const fade = radius => {
  const r = Math.min(1, Math.max(0, radius));
  return 1 - r * r * (3 - 2 * r);
};
// This is also the exact fragment coverage, before the individual star's
// brightness envelope. Source-over matches the SVG group's layered ellipses.
export function backgroundStarCoverage(x = 0, y = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  return 1 - BACKGROUND_STAR_SPARKLE.layers.reduce((remaining, layer) =>
    remaining * (1 - layer.alpha * fade(Math.hypot(x / layer.radiusX, y / layer.radiusY))), 1);
}
const confirmedMs = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
export const backgroundStarCountFor = totalMs => Math.floor(confirmedMs(totalMs) / BACKGROUND_STAR_INTERVAL_MS);
export const backgroundStarsSupported = count => Number.isSafeInteger(count) && count >= 0 && count <= MAX_BACKGROUND_STARS;
export const backgroundStarDensityFor = count => backgroundStarsSupported(count) ? Math.min(1, Math.sqrt(160 / Math.max(1, count))) : 0;

// Integer hashing, not Math.random or saved random state. A star's stable index
// alone determines its place, size and individual twinkle phase.
// All stars use one explicit seconds-per-cycle setting; phases stay distinct. Adding/removing
// later stars, reloading or changing screens cannot reshuffle existing stars.
function random(index, channel) {
  let value = Math.imul((index + 1) >>> 0, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}
export function backgroundStarFor(index = 0) {
  const id = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  // Keep the middle of the host quiet for the crystal and its text. Rejection
  // sampling has a fixed bound; the last placement is a guaranteed side lane.
  let x, y;
  for (let attempt = 0; attempt < 24; attempt++) {
    x = .04 + .92 * random(id, attempt * 2); y = .04 + .92 * random(id, attempt * 2 + 1);
    if (((x - .5) / .30) ** 2 + ((y - .5) / .38) ** 2 >= 1) break;
    if (attempt === 23) x = random(id, 70) < .5 ? .07 : .93;
  }
  return {index: id, x: Math.fround(x), y: Math.fround(y),
    size: Math.fround(1.3 + random(id, 50) * 2.1),
    phase: Math.fround(random(id, 51) * TAU), period: FOCUS_APPEARANCE_DEFAULTS.backgroundTwinkleInterval,
    peak: Math.fround(.62 + random(id, 53) * .26)};
}
export function backgroundStarAlpha(star, seconds = 0, count = 1, twinkle = 1, interval = FOCUS_APPEARANCE_DEFAULTS.backgroundTwinkleInterval) {
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const depth = Number.isFinite(twinkle) ? Math.min(1, Math.max(0, twinkle)) : 1;
  const [minimum, maximum] = FOCUS_APPEARANCE_LIMITS.backgroundTwinkleInterval;
  const period = Number.isFinite(interval) ? Math.min(maximum, Math.max(minimum, interval)) : FOCUS_APPEARANCE_DEFAULTS.backgroundTwinkleInterval;
  return star.peak * (BACKGROUND_STAR_SPARKLE.mean + BACKGROUND_STAR_SPARKLE.amplitude * depth * Math.sin(time * TAU / period + star.phase)) * backgroundStarDensityFor(count);
}
// The existing shared optical clock is frozen on pause/reduced-motion. No CSS
// animation, timer or extra RAF is introduced for these background lights.
export const BACKGROUND_STAR_VERTEX_GLSL = `attribute vec3 twinkle;
uniform float backgroundTime;uniform float backgroundDpr;uniform float backgroundDensity;
uniform float backgroundStarSize;uniform float backgroundTwinkle;uniform float backgroundTwinkleInterval;
varying float backgroundAlpha;
void main(){gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,0.,1.);
gl_PointSize=position.z*backgroundDpr*backgroundStarSize*${BACKGROUND_STAR_SPARKLE.extent.toFixed(1)};
backgroundAlpha=twinkle.z*(${BACKGROUND_STAR_SPARKLE.mean}+${BACKGROUND_STAR_SPARKLE.amplitude}*backgroundTwinkle*sin(backgroundTime*6.283185307179586/backgroundTwinkleInterval+twinkle.x))*backgroundDensity;}`;
const linearChannel = value => {
  const srgb = value / 255;
  return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
};
const sparkleLinearColor = [1, 3, 5].map(offset => linearChannel(parseInt(BACKGROUND_STAR_SPARKLE.color.slice(offset, offset + 2), 16)).toFixed(9));
export const BACKGROUND_STAR_FRAGMENT_GLSL = `varying float backgroundAlpha;
void main(){vec2 p=gl_PointCoord*2.-1.;float remaining=1.;
${BACKGROUND_STAR_SPARKLE.layers.map(layer => `remaining*=1.-${layer.alpha.toFixed(3)}*(1.-smoothstep(0.,1.,length(p/vec2(${layer.radiusX.toFixed(3)},${layer.radiusY.toFixed(3)}))));`).join('\n')}
float coverage=1.-remaining;
gl_FragColor=vec4(${sparkleLinearColor.join(',')},coverage*backgroundAlpha);
#include <colorspace_fragment>
}`;
let svgSequence = 0;
export function projectedBackgroundStarsSVG({totalMs = 0, width = 320, height = 360, seconds = 0, appearance} = {}, symbolId) {
  const count = backgroundStarCountFor(totalMs);
  if (!count || !backgroundStarsSupported(count)) return '';
  const w = Number.isFinite(width) ? Math.max(1, width) : 320, h = Number.isFinite(height) ? Math.max(1, height) : 360;
  const settings = normalizeFocusAppearance(appearance);
  // One reusable symbol keeps fallback growth to one use per logical star.
  // The 17 fixed stops approximate the same smoothstep with <0.4% absolute
  // coverage error; no SVG animation or blur/filter resources are introduced.
  const id = typeof symbolId === 'string' && /^[A-Za-z][\w-]*$/.test(symbolId)
    ? symbolId : 'background-star-sparkle-' + ++svgSequence;
  const stops = Array.from({length: 17}, (_, index) => {
    const radius = index / 16;
    return '<stop offset="' + radius + '" stop-color="' + BACKGROUND_STAR_SPARKLE.color + '" stop-opacity="' + fade(radius) + '"/>';
  }).join('');
  const layers = BACKGROUND_STAR_SPARKLE.layers.map(layer =>
    '<ellipse data-sparkle-layer="' + layer.name + '" rx="' + layer.radiusX + '" ry="' + layer.radiusY + '" opacity="' + layer.alpha + '"/>').join('');
  const definition = '<defs><radialGradient id="' + id + '-fade" stop-color="' + BACKGROUND_STAR_SPARKLE.color + '">' + stops + '</radialGradient>' +
    '<g id="' + id + '" fill="url(#' + id + '-fade)">' + layers + '</g></defs>';
  let stars = '';
  for (let index = 0; index < count; index++) {
    const star = backgroundStarFor(index);
    stars += '<use data-background-star="' + index + '" href="#' + id + '" transform="translate(' + (star.x * w).toFixed(3) + ' ' + (star.y * h).toFixed(3) +
      ') scale(' + (star.size * settings.backgroundStarSize * BACKGROUND_STAR_SPARKLE.extent / 2).toFixed(5) + ')" opacity="' + backgroundStarAlpha(star, seconds, count, settings.backgroundTwinkle, settings.backgroundTwinkleInterval).toFixed(5) + '"/>';
  }
  return '<g data-background-star-count="' + count + '" data-background-star-size="' + settings.backgroundStarSize + '" data-background-twinkle="' + settings.backgroundTwinkle + '" data-background-twinkle-interval="' + settings.backgroundTwinkleInterval + '" data-background-sparkle="' + BACKGROUND_STAR_SPARKLE.id + '" pointer-events="none">' + definition + stars + '</g>';
}
