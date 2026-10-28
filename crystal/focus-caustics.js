import {normalizeFocusAppearance, focusStagePalette} from './focus-lighting.js';
export const FOCUS_CAUSTICS = Object.freeze({
  id: 'separated-stage-floor-glow-v14',
  loopCount: 4,
  stageScales: Object.freeze([1, 1.1, 1.2, 1.3, 1.4]),
  phaseRate: 0.35,
  centerX: 0.5,
  centerY: 0.905,
  minimumTop: 0.82,
  maximumBottom: 0.99,
  lineWidth: 1.1,
  shadowBlur: 6,
  defaultColor: '#9cddf6',
});
const TAU = Math.PI * 2;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  ? value : FOCUS_CAUSTICS.defaultColor;
const legacyPadding = FOCUS_CAUSTICS.shadowBlur * 2 + FOCUS_CAUSTICS.lineWidth / 2;
const maximumTilt = 0.14 + 0.08;
const maximumReachX = 0.026 + 0.205;
const maximumReachY = 0.012 + Math.hypot(0.205 * Math.sin(maximumTilt), 0.04 * Math.cos(maximumTilt));

export function focusCausticGlow({seconds = 0, appearance} = {}) {
  const settings = normalizeFocusAppearance(appearance);
  const phase = Math.max(0, finite(seconds, 0)) * TAU / settings.causticInterval;
  return settings.causticStrength * (.5 - .5 * Math.cos(phase)) ** 2;
}

export function focusCaustics({width = 320, height = 360, stage = 0, seconds = 0,
  themeColor, appearance, clearanceY, crystalBottom = null, clearanceGap = null} = {}) {
  const w = Math.max(1, finite(width, 320)), h = Math.max(1, finite(height, 360));
  const level = clamp(Math.floor(finite(stage, 0)), 0, 4);
  const stageScale = FOCUS_CAUSTICS.stageScales[level];
  const settings = normalizeFocusAppearance(appearance), glow = focusCausticGlow({seconds, appearance: settings});
  const phase = Math.max(0, finite(seconds, 0)) * FOCUS_CAUSTICS.phaseRate;
  const size = Math.min(w, h), maximumScale = FOCUS_CAUSTICS.stageScales[4];
  const centerX = w * FOCUS_CAUSTICS.centerX, centerY = h * FOCUS_CAUSTICS.centerY;
  const minimumY = clamp(finite(clearanceY, h * FOCUS_CAUSTICS.minimumTop), h * FOCUS_CAUSTICS.minimumTop, centerY);
  const envelopeReachY = size * maximumReachY * maximumScale + legacyPadding;
  const fitScale = Math.min(1,
    w * 0.5 / (size * maximumReachX * maximumScale + legacyPadding),
    (centerY - minimumY) / envelopeReachY,
    (h * FOCUS_CAUSTICS.maximumBottom - centerY) / envelopeReachY);
  const unit = size * fitScale * stageScale, theme = color(themeColor ?? focusStagePalette(level).tint);
  const loops = Array.from({length: FOCUS_CAUSTICS.loopCount}, (_, index) => ({
    x: centerX + Math.sin(phase + index) * unit * 0.026,
    y: centerY + Math.cos(phase * 0.8 + index) * unit * 0.012,
    radiusX: unit * (0.13 + index * 0.025),
    radiusY: unit * (0.016 + index * 0.008),
    tilt: -0.14 + Math.sin(phase + index) * 0.08,
    color: theme,
    alpha: (0.08 + index * 0.006) * (1 + glow * 1.6),
    lineWidth: FOCUS_CAUSTICS.lineWidth * fitScale,
    shadowColor: theme,
    shadowBlur: FOCUS_CAUSTICS.shadowBlur * fitScale,
    diffuseAlpha: .025 * settings.causticStrength + .06 * glow,
    diffuseWidth: 8 * fitScale,
    diffuseBlur: 4 * fitScale,
  }));
  const bounds = {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity};
  for (const loop of loops) {
    const c = Math.cos(loop.tilt), s = Math.sin(loop.tilt);
    const padding = loop.shadowBlur * 2 + loop.lineWidth / 2;
    const reachX = Math.hypot(loop.radiusX * c, loop.radiusY * s) + padding;
    const reachY = Math.hypot(loop.radiusX * s, loop.radiusY * c) + padding;
    bounds.left = Math.min(bounds.left, loop.x - reachX);
    bounds.top = Math.min(bounds.top, loop.y - reachY);
    bounds.right = Math.max(bounds.right, loop.x + reachX);
    bounds.bottom = Math.max(bounds.bottom, loop.y + reachY);
  }
  return {width: w, height: h, stage: level, stageScale, fitScale, phase, glow, strength: settings.causticStrength, interval: settings.causticInterval, themeColor: theme, centerX, centerY, clearanceY: minimumY, crystalBottom, clearanceGap, loops, bounds};
}

export function drawFocusCaustics(context, options) {
  const state = focusCaustics(options);
  context.save();
  try {
    context.globalCompositeOperation = 'source-over';
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    for (const loop of state.loops) {
      context.beginPath();
      context.ellipse(loop.x, loop.y, loop.radiusX, loop.radiusY, loop.tilt, 0, TAU);
      context.strokeStyle = loop.color;
      context.globalAlpha = loop.diffuseAlpha;
      context.lineWidth = loop.diffuseWidth;
      context.shadowColor = loop.shadowColor;
      context.shadowBlur = loop.diffuseBlur;
      context.stroke();
      context.globalAlpha = loop.alpha;
      context.lineWidth = loop.lineWidth;
      context.shadowColor = loop.shadowColor;
      context.shadowBlur = loop.shadowBlur;
      context.stroke();
    }
  } finally {
    context.restore();
  }
  return state;
}

export function projectedFocusCausticsSVG(options) {
  const state = focusCaustics(options), number = value => value.toFixed(6);
  const diffuse = state.loops.map(loop => `<ellipse data-focus-caustic-diffuse="true" cx="${number(loop.x)}" cy="${number(loop.y)}" rx="${number(loop.radiusX)}" ry="${number(loop.radiusY)}" transform="rotate(${number(loop.tilt * 180 / Math.PI)} ${number(loop.x)} ${number(loop.y)})" fill="none" stroke="${loop.color}" stroke-width="${number(loop.diffuseWidth)}" opacity="${number(loop.diffuseAlpha)}" style="filter:drop-shadow(0px 0px ${number(loop.diffuseBlur / 2)}px ${loop.shadowColor})"/>`).join('');
  const ellipses = state.loops.map((loop, index) =>
    `<g opacity="${number(loop.alpha)}"><ellipse data-focus-caustic-loop="${index}" ` +
    `cx="${number(loop.x)}" cy="${number(loop.y)}" rx="${number(loop.radiusX)}" ry="${number(loop.radiusY)}" ` +
    `transform="rotate(${number(loop.tilt * 180 / Math.PI)} ${number(loop.x)} ${number(loop.y)})" ` +
    `fill="none" stroke="${loop.color}" stroke-width="${number(loop.lineWidth)}" ` +
    `style="filter:drop-shadow(0px 0px ${number(loop.shadowBlur / 2)}px ${loop.shadowColor})"/></g>`
  ).join('');
  return `<g data-caustic-loops="${state.loops.length}" data-caustic-stage="${state.stage}" ` +
    `data-caustic-scale="${state.stageScale}" data-caustic-phase="${number(state.phase)}" ` +
    `data-caustic-glow="${number(state.glow)}" data-caustic-strength="${state.strength}" data-caustic-interval="${state.interval}" ` +
    `data-caustic-clearance-y="${number(state.clearanceY)}">${diffuse}${ellipses}</g>`;
}
