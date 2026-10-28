import {normalizeFocusAppearance, focusStagePalette} from './focus-lighting.js';

// A decorative, bounded backdrop behind the crystal. It shares the owner's
// held optical clock and Canvas/SVG layer; it never schedules animation itself.
export const FOCUS_HALO = Object.freeze({
  id: 'stage-theme-breathing-halo-v14', maximumAlpha: .22,
  centerX: .5, centerY: .49, radiusX: .32, radiusY: .44, hostMargin: .02,
  stops: Object.freeze([
    Object.freeze({offset: 0, alpha: 1}), Object.freeze({offset: .35, alpha: .68}),
    Object.freeze({offset: .7, alpha: .17}), Object.freeze({offset: 1, alpha: 0}),
  ]),
});
const TAU = Math.PI * 2;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export function focusHalo({width = 320, height = 360, stage = 0, seconds = 0, appearance, themeColor, offsetY=0} = {}) {
  const settings = normalizeFocusAppearance(appearance);
  const w = Math.max(1, finite(width, 320)), h = Math.max(1, finite(height, 360));
  const level = Math.max(0, Math.min(4, Math.floor(finite(stage, 0))));
  const time = Math.max(0, finite(seconds, 0));
  // Raised cosine: one smooth breath in at least eight seconds. Depth zero is
  // a constant halo; strength zero hides only this independent backdrop.
  const wave = .5 - .5 * Math.cos(time * TAU / settings.haloInterval);
  const envelope = 1 - settings.haloDepth * (1 - wave);
  const alpha = FOCUS_HALO.maximumAlpha * settings.haloStrength * envelope;
  const x = w * FOCUS_HALO.centerX, y = h * FOCUS_HALO.centerY + finite(offsetY,0), unit = Math.min(w, h);
  const radiusX = Math.min(w * (.5 - FOCUS_HALO.hostMargin), unit * FOCUS_HALO.radiusX * settings.haloSpread);
  const radiusY = Math.min(h * (FOCUS_HALO.centerY - FOCUS_HALO.hostMargin), unit * FOCUS_HALO.radiusY * settings.haloSpread);
  return {width: w, height: h, stage: level, seconds: time, x, y, radiusX, radiusY, alpha, envelope,
    strength: settings.haloStrength, spread: settings.haloSpread, depth: settings.haloDepth, interval: settings.haloInterval,
    themeColor: color(themeColor, focusStagePalette(level).tint), stops: FOCUS_HALO.stops,
    bounds: {left: x - radiusX, top: y - radiusY, right: x + radiusX, bottom: y + radiusY}};
}

const rgba = (hex, alpha) => 'rgba(' + [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(',') + ',' + alpha + ')';
export function drawFocusHalo(context, options) {
  const state = focusHalo(options);
  if (state.alpha === 0) return state;
  if (['save', 'restore', 'translate', 'scale', 'createRadialGradient', 'fillRect'].some(method => typeof context?.[method] !== 'function')) {
    throw new Error('halo_canvas_gradient_unavailable');
  }
  context.save();
  try {
    context.globalCompositeOperation = 'source-over'; context.globalAlpha = state.alpha;
    context.shadowBlur = 0; context.shadowOffsetX = 0; context.shadowOffsetY = 0;
    context.translate(state.x, state.y); context.scale(state.radiusX, state.radiusY);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    if (typeof gradient?.addColorStop !== 'function') throw new Error('halo_canvas_gradient_unavailable');
    for (const stop of state.stops) gradient.addColorStop(stop.offset, rgba(state.themeColor, stop.alpha));
    context.fillStyle = gradient; context.fillRect(-1, -1, 2, 2);
  } finally { context.restore(); }
  return state;
}

let svgSequence = 0;
// Stable owner-supplied IDs avoid collisions across the three simultaneous
// hosts. Standalone callers receive a fresh ID, never user-provided markup.
export function projectedFocusHaloSVG(options, gradientId) {
  const state = focusHalo(options), number = value => value.toFixed(6);
  const id = typeof gradientId === 'string' && /^[A-Za-z][\w-]*$/.test(gradientId) ? gradientId : 'focus-halo-' + ++svgSequence;
  const stops = state.stops.map(stop => `<stop offset="${stop.offset}" stop-color="${state.themeColor}" stop-opacity="${stop.alpha}"/>`).join('');
  return `<g data-focus-halo="true" data-halo-stage="${state.stage}" data-halo-strength="${state.strength}" ` +
    `data-halo-spread="${state.spread}" data-halo-depth="${state.depth}" data-halo-interval="${state.interval}" ` +
    `data-halo-alpha="${number(state.alpha)}" pointer-events="none">` +
    `<defs><radialGradient id="${id}" cx=".5" cy=".5" r=".5">${stops}</radialGradient></defs>` +
    `<ellipse cx="${number(state.x)}" cy="${number(state.y)}" rx="${number(state.radiusX)}" ry="${number(state.radiusY)}" ` +
    `opacity="${number(state.alpha)}" fill="url(#${id})"/></g>`;
}
