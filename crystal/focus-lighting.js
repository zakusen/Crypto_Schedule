// Focus F2 optics: transparent rear/front cuts with independent local reflections.
// Pure optical math only; the independent Focus model owns the teardrop shape.
export const FOCUS_LIGHTING = Object.freeze({
  id: 'focus-theme-rainbow-glass-v6',
  shimmerPeriod: 11,
  rainbowPeriod: 24,
  // These bound BODY coverage only. Local mirror highlights have their own
  // coverage, so making the glass transparent does not fade its sparkles.
  frontBodyAlphaFloor: 0.12,
  frontBodyAlphaCeiling: 0.36,
  backBodyAlphaFloor: 0.18,
  backBodyAlphaCeiling: 0.40,
  frontFacetAbsorption: 0.16,
  backFacetAbsorption: 0.14,
  grazingAbsorption: 0.08,
  reflectionAlphaCeiling: 0.96,
  transmissionGain: 0.82,
  environmentNeutralization: 0.94,
  materialTintMix: 0.96,
  bodyAmbient: 0.014,
  pigmentBodyGain: 2.4,
  colorCeiling: 0.985,
  exposure: 1.22,
  reflectionGain: 3.4,
  rainbowGain: 0.18,
  rainbowBodyMix: 0.92,
  innerBloomPixels: 3,
  outerBloomPixels: 10,
});
// Every stage participates in the slowly shifting facet spectrum. Ice opens
// the sequence, warm gold is the 300-minute stage, and rainbow completes
// it at 400 minutes. Each earlier stage keeps its own theme dominant.
export const FOCUS_STAGE_PALETTES = Object.freeze([
  Object.freeze({id: 'ice', name: '氷晶', tint: '#9cddf6', rainbowMix: 0.22}),
  Object.freeze({id: 'blue', name: '蒼晶', tint: '#568deb', rainbowMix: 0.28}),
  Object.freeze({id: 'violet', name: '紫晶', tint: '#ad8aea', rainbowMix: 0.28}),
  Object.freeze({id: 'gold', name: '金晶', tint: '#f0b94a', rainbowMix: 0.16}),
  Object.freeze({id: 'opal', name: '虹晶', tint: '#c3e9e6', rainbowMix: 0.70}),
]);
export const FOCUS_APPEARANCE_DEFAULTS = Object.freeze({
  faceBrightness: 1, frameWidth: 0.8, reflectionStrength: 1.75,
  colorSaturation: 1, glowStrength: 0.5, glowInterval: 8,
  rotationX: 4.5, rotationY: 8, rotationZ: 12,
  orbitOpacity: 0.08, orbitSpeed: 1.8,
  backgroundStarSize: 2, backgroundTwinkle: 1, backgroundTwinkleInterval: 60, causticStrength: 2, causticInterval: 8,
  haloStrength: 2, haloSpread: 2, haloDepth: 1, haloInterval: 8,
});
export const FOCUS_APPEARANCE_LIMITS = Object.freeze({
  faceBrightness: Object.freeze([0.5, 1.5]),
  frameWidth: Object.freeze([0.4, 2.4]),
  reflectionStrength: Object.freeze([0, 2]),
  colorSaturation: Object.freeze([0, 1.5]),
  glowStrength: Object.freeze([0, 0.5]),
  glowInterval: Object.freeze([8, 60]),
  rotationX: Object.freeze([-30, 30]),
  rotationY: Object.freeze([-30, 30]),
  rotationZ: Object.freeze([-30, 30]),
  orbitOpacity: Object.freeze([0, 1]),
  orbitSpeed: Object.freeze([0, 3]),
  backgroundStarSize: Object.freeze([0.5, 2]),
  backgroundTwinkle: Object.freeze([0, 1]),
  backgroundTwinkleInterval: Object.freeze([6, 60]),
  causticStrength: Object.freeze([0, 2]),
  causticInterval: Object.freeze([8, 60]),
  haloStrength: Object.freeze([0, 2]),
  haloSpread: Object.freeze([.5, 2]),
  haloDepth: Object.freeze([0, 1]),
  haloInterval: Object.freeze([8, 60]),
});
const TAU = Math.PI * 2;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function normalizeFocusAppearance(settings, previous = FOCUS_APPEARANCE_DEFAULTS) {
  const input = settings && typeof settings === 'object' ? settings : {};
  const prior = previous && typeof previous === 'object' ? previous : {};
  return Object.fromEntries(Object.entries(FOCUS_APPEARANCE_LIMITS).map(([key, [lo, hi]]) => [
    key, clamp(finite(input[key], finite(prior[key], FOCUS_APPEARANCE_DEFAULTS[key])), lo, hi),
  ]));
}

export function focusStagePalette(stage = 0) {
  return FOCUS_STAGE_PALETTES[clamp(Math.floor(finite(stage, 0)), 0, 4)];
}

export function focusShimmer(seconds, facet = 0) {
  return 0.68 + 0.32 * (0.5 + 0.5 * Math.sin(
    finite(seconds, 0) * TAU / FOCUS_LIGHTING.shimmerPeriod + finite(facet, 0) * 1.618,
  ));
}

// Shared spectrum for localized optical highlights and every stage's facet
// colors. The stage palette controls how strongly its theme tint dominates.
export function focusSpectrum(hue) {
  const h = finite(hue, 0);
  return [0, 2 / 3, 1 / 3].map(offset => {
    const cycle = ((h + offset) % 1 + 1) % 1;
    return 0.015 + 0.985 * clamp(Math.abs(cycle * 6 - 3) - 1, 0, 1);
  });
}

export function focusFacetEnergy(facet = 0, facing = 1) {
  const code = 0.5 + 0.5 * Math.sin(finite(facet, 0) * 2.399963);
  return (0.035 + 0.965 * Math.pow(code, 1.15)) *
    (0.55 + 0.45 * clamp(finite(facing, 0), 0, 1));
}

// Smooth highlight shoulder leaves most cuts colored while only small specular
// lobes approach white. No single hard white-clipping level for the whole gem.
export function focusToneMap(channel) {
  return FOCUS_LIGHTING.colorCeiling * (1 - Math.exp(
    -Math.max(0, finite(channel, 0)) * FOCUS_LIGHTING.exposure,
  ));
}

// Alpha is coverage for normal source-over compositing, not measured physical
// glass transmittance. Mirror energy and the colored body are separate layers.
// This CPU equivalent checks the same scalar weights used by the shader below.
export function focusOpticalWeights({facetEnergy = 0, fresnel = 0.04, reflectionPeak = 0, back = false} = {}) {
  const energy = clamp(finite(facetEnergy, 0), 0, 1);
  const rim = clamp(finite(fresnel, 0.04), 0, 1);
  const floor = back ? FOCUS_LIGHTING.backBodyAlphaFloor : FOCUS_LIGHTING.frontBodyAlphaFloor;
  const ceiling = back ? FOCUS_LIGHTING.backBodyAlphaCeiling : FOCUS_LIGHTING.frontBodyAlphaCeiling;
  const absorption = back ? FOCUS_LIGHTING.backFacetAbsorption : FOCUS_LIGHTING.frontFacetAbsorption;
  const bodyAlpha = clamp(floor + absorption * energy + FOCUS_LIGHTING.grazingAbsorption * rim, floor, ceiling);
  const reflectionAlpha = clamp(finite(reflectionPeak, 0), 0, FOCUS_LIGHTING.reflectionAlphaCeiling);
  const bodyWeight = bodyAlpha * (1 - reflectionAlpha);
  const alpha = bodyWeight + reflectionAlpha;
  return {bodyAlpha, reflectionAlpha, bodyWeight, alpha, throughWeight: 1 - alpha};
}

// F2 is now the adopted shared crystal. Old comparison URLs cannot select a
// different renderer for Focus, DASH5 or AI settings.
export function focusRefinementFor() { return 'F2'; }

// A raised-cosine envelope starts and ends at baseline with zero slope. The
// minimum period is eight seconds; no toggles, strobe or full-screen overlay.
// Pause/reduced-motion always use baseline, never a frozen bright flash.
export function focusWholeGlow({seconds = 0, appearance, reducedMotion = false, paused = false} = {}) {
  if (reducedMotion || paused) return 0;
  const settings = normalizeFocusAppearance(appearance);
  const phase = Math.max(0, finite(seconds, 0)) * TAU / settings.glowInterval;
  return settings.glowStrength * Math.pow(0.5 - 0.5 * Math.cos(phase), 3);
}

export function focusLightingState({seconds = 0, stage = 0, appearance, reducedMotion = false, paused = false} = {}) {
  const time = reducedMotion || paused ? 0 : Math.max(0, finite(seconds, 0));
  const wholeGlow = focusWholeGlow({seconds, appearance, reducedMotion, paused});
  const bloomAlpha = 0.18 + wholeGlow * 0.16;
  const settings = normalizeFocusAppearance(appearance), hex = focusStagePalette(stage).tint.slice(1);
  const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const bloomTint = focusSaturatedTint(rgb, settings.colorSaturation).map(channel => Math.round(channel * 255)).join(',');
  return {
    enabled: true, time, strength: 1, edgeOpacity: 0.4, wholeGlow,
    bloomFilter: `drop-shadow(0 0 ${FOCUS_LIGHTING.innerBloomPixels}px rgba(${bloomTint},${bloomAlpha.toFixed(4)})) drop-shadow(0 0 ${FOCUS_LIGHTING.outerBloomPixels}px rgba(${bloomTint},${(bloomAlpha * 0.48).toFixed(4)}))`,
  };
}

// Saturation is bounded before RGB gamut clipping, preserving each mixed facet
// hue and channel ordering at every setting, including 1.5x saturation.
export function focusSaturatedTint(rgb, saturation = 1) {
  const color = rgb.map(value => clamp(finite(value, 0), 0, 1));
  const luma = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  const chroma = color.map(value => value - luma);
  let scale = clamp(finite(saturation, 1), 0, 1.5);
  for (const delta of chroma) {
    if (delta > 0) scale = Math.min(scale, (1 - luma) / delta);
    if (delta < 0) scale = Math.min(scale, -luma / delta);
  }
  return chroma.map(delta => clamp(luma + delta * scale, 0, 1));
}

// CPU equivalent of the body-color helper below, also used by the static SVG
// fallback. The existing optical clock owns motion; no new animation loop or
// timer/session state lives here. Smooth channel shoulders avoid hue-boundary
// pops. The 24-second period is a full spectrum cycle, never an opacity pulse.
export function focusFacetTint({stageTint = [1, 1, 1], rainbowMix = 0, facet = 0,
  seconds = 0, saturation = 1} = {}) {
  const base = [0, 1, 2].map(channel => clamp(finite(stageTint?.[channel], 0), 0, 1));
  const hue = finite(facet, 0) * 0.618033989 + Math.max(0, finite(seconds, 0)) / FOCUS_LIGHTING.rainbowPeriod;
  const spectrum = focusSpectrum(hue).map(channel => {
    const band = clamp((channel - 0.015) / 0.985, 0, 1);
    return 0.015 + 0.985 * band * band * (3 - 2 * band);
  });
  const mix = clamp(finite(rainbowMix, 0), 0, 1) * FOCUS_LIGHTING.rainbowBodyMix;
  return focusSaturatedTint(base.map((channel, index) => channel * (1 - mix) + spectrum[index] * mix), saturation);
}

// CPU reference of the FINAL optical mix, not just the input pigment. Incoming
// environment color is mostly neutralized before passing through the material;
// its directional intensity still defines visible cuts. Narrow local mirror
// highlights stay untinted. Color strength is applied only after both layers
// combine, preserving luminance/coverage and reaching reflections at zero too.
// This is an analytic shader reference, not a GPU or screenshot verification.
export function focusOpticalMix({stageTint = [1, 1, 1], transmitted = [0, 0, 0],
  reflected = [0, 0, 0], light = [0, 0, 0], shimmer = 1, facetEnergy = 0,
  fresnel = .04, back = false, faceBrightness = 1, reflectionStrength = 1,
  colorSaturation = 1, wholeGlow = 0} = {}) {
  const rgb = color => [0, 1, 2].map(channel => Math.max(0, finite(color?.[channel], 0)));
  const tint = rgb(stageTint).map(channel => clamp(channel, 0, 1));
  const incoming = rgb(transmitted), environment = rgb(reflected), localLight = rgb(light);
  const luma = color => color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
  const tintPeak = Math.max(...tint, .08), transmittedLuma = luma(incoming), reflectedLuma = luma(environment);
  const energy = clamp(finite(facetEnergy, 0), 0, 1), rim = clamp(finite(fresnel, .04), 0, 1);
  const settings = normalizeFocusAppearance({faceBrightness, reflectionStrength, colorSaturation});
  const glow = clamp(finite(wholeGlow, 0), 0, .5), sparkle = clamp(finite(shimmer, 1), 0, 1);
  const mappedBody = [], mappedReflection = [];
  for (let channel = 0; channel < 3; channel++) {
    const pigment = tint[channel] / tintPeak;
    const materialFilter = .04 * (1 - FOCUS_LIGHTING.materialTintMix) + pigment * FOCUS_LIGHTING.materialTintMix;
    const transmission = incoming[channel] * (1 - FOCUS_LIGHTING.environmentNeutralization) + transmittedLuma * FOCUS_LIGHTING.environmentNeutralization;
    const reflection = environment[channel] * (1 - FOCUS_LIGHTING.environmentNeutralization) + reflectedLuma * FOCUS_LIGHTING.environmentNeutralization;
    const body = (FOCUS_LIGHTING.bodyAmbient + transmission * FOCUS_LIGHTING.transmissionGain * (.40 + .60 * energy)) * materialFilter +
      pigment * energy * (back ? .085 : .065);
    mappedBody[channel] = focusToneMap(body * FOCUS_LIGHTING.pigmentBodyGain * settings.faceBrightness * (1 + glow));
    mappedReflection[channel] = focusToneMap((localLight[channel] * sparkle + reflection * materialFilter * (.035 + .20 * rim)) *
      settings.reflectionStrength * (back ? .65 : 1));
  }
  const reflectionPeak = Math.max(...mappedReflection);
  const weights = focusOpticalWeights({facetEnergy: energy, fresnel: rim, reflectionPeak, back});
  const straightColor = mappedBody.map((channel, index) => (channel * weights.bodyWeight +
    mappedReflection[index] * weights.reflectionAlpha / Math.max(reflectionPeak, .000001)) / Math.max(weights.alpha, .000001));
  return {color: focusSaturatedTint(straightColor, settings.colorSaturation), alpha: weights.alpha,
    mappedBody, mappedReflection, reflectionPeak, ...weights};
}

// A bounding sphere guarantees the new, longer point remains inside the canvas
// throughout XYZ rotation. Dashboard keeps its previous camera projection.
export function focusProjectionTarget({width, height, requested, radius = 2, distance = 7.8} = {}) {
  const w = Math.max(1, finite(width, 1)), h = Math.max(1, finite(height, 1));
  const d = Math.max(1, finite(distance, 7.8));
  const r = clamp(finite(radius, 2), 0.01, d * 0.95);
  const safeTarget = 0.88 * Math.min(w, h) * w / h * Math.tan(35 * Math.PI / 360) *
    Math.sqrt(d * d - r * r) / r;
  return Math.min(Math.max(1, finite(requested, 320)), safeTarget);
}

const glsl = number => Number(number).toFixed(6);
export const FOCUS_LIGHTING_GLSL = `
uniform vec4 focusLight; // enabled, frozen-or-live optical seconds, strength, edge alpha
uniform vec3 focusStageTint; // linear-RGB base tint for the active growth stage
uniform float focusRainbowMix; // stage-specific rainbow amount; every stage keeps a theme tint
uniform float focusRainbowTime; // existing optical clock, held at its current phase when stopped
uniform float focusFaceBrightness; // independent body exposure; never opacity or edge width
uniform float focusReflectionStrength; // local mirror energy, independent of whole glow
uniform float focusColorSaturation; // final optical chroma; independent of luminance and coverage
uniform float focusWholeGlow; // slow bounded body lift; zero when paused/reduced-motion
vec3 focusSaturatedTint(vec3 color, float saturation) {
  float luma = dot(color, vec3(.2126,.7152,.0722));
  vec3 chroma = color - vec3(luma);
  float scale = clamp(saturation, 0., 1.5);
  for (int channel = 0; channel < 3; channel++) {
    if (chroma[channel] > 0.) scale = min(scale, (1. - luma) / chroma[channel]);
    if (chroma[channel] < 0.) scale = min(scale, -luma / chroma[channel]);
  }
  return clamp(vec3(luma) + chroma * scale, 0., 1.);
}
vec3 focusSpectrum(float hue) {
  vec3 bands = abs(fract(vec3(hue) + vec3(0.,.666666667,.333333333)) * 6. - 3.);
  return vec3(.015) + .985 * clamp(bands - 1., 0., 1.);
}
vec3 focusFacetTint(vec3 stageTint, float rainbowMix, float facetId, float seconds, float saturation) {
  float hue = facetId * .618033989 + seconds / ${glsl(FOCUS_LIGHTING.rainbowPeriod)};
  vec3 bands = clamp((focusSpectrum(hue) - vec3(.015)) / .985, 0., 1.);
  vec3 spectrum = vec3(.015) + .985 * bands * bands * (vec3(3.) - 2. * bands);
  vec3 tint = mix(stageTint, spectrum, clamp(rainbowMix, 0., 1.) * ${glsl(FOCUS_LIGHTING.rainbowBodyMix)});
  return focusSaturatedTint(tint, saturation);
}
// x = body contribution, y = independent reflection coverage, z = total alpha.
vec3 focusOpticalWeights(float facetEnergy, float fresnel, float reflectionPeak, float back) {
  float bodyFloor = back > .5 ? ${glsl(FOCUS_LIGHTING.backBodyAlphaFloor)} : ${glsl(FOCUS_LIGHTING.frontBodyAlphaFloor)};
  float bodyCeiling = back > .5 ? ${glsl(FOCUS_LIGHTING.backBodyAlphaCeiling)} : ${glsl(FOCUS_LIGHTING.frontBodyAlphaCeiling)};
  float absorption = back > .5 ? ${glsl(FOCUS_LIGHTING.backFacetAbsorption)} : ${glsl(FOCUS_LIGHTING.frontFacetAbsorption)};
  float bodyAlpha = clamp(bodyFloor + absorption * clamp(facetEnergy, 0., 1.) +
    ${glsl(FOCUS_LIGHTING.grazingAbsorption)} * clamp(fresnel, 0., 1.), bodyFloor, bodyCeiling);
  float reflectionAlpha = clamp(reflectionPeak, 0., ${glsl(FOCUS_LIGHTING.reflectionAlphaCeiling)});
  float bodyWeight = bodyAlpha * (1. - reflectionAlpha);
  return vec3(bodyWeight, reflectionAlpha, bodyWeight + reflectionAlpha);
}
vec3 focusToneMap(vec3 radiance) {
  return ${glsl(FOCUS_LIGHTING.colorCeiling)} *
    (vec3(1.) - exp(-max(radiance, vec3(0.)) * ${glsl(FOCUS_LIGHTING.exposure)}));
}
// Final material response. Scalar channel math is mirrored by focusOpticalMix
// and exercised against this emitted GLSL in CPU tests. Broad environment
// illumination follows the pigment; localized mirror lobes remain white/prismatic.
vec4 focusOpticalMix(vec3 stageTint, vec3 transmitted, vec3 reflected, vec3 light,
  float shimmer, float facetEnergy, float fresnel, float back, float faceBrightness,
  float reflectionStrength, float colorSaturation, float wholeGlow) {
  float tintPeak = max(max(stageTint.r, stageTint.g), max(stageTint.b, .08));
  float transmittedLuma = dot(transmitted, vec3(.2126,.7152,.0722));
  float reflectedLuma = dot(reflected, vec3(.2126,.7152,.0722));
  vec3 body = vec3(0.);
  vec3 reflectionRadiance = vec3(0.);
  for (int channel = 0; channel < 3; channel++) {
    float pigment = stageTint[channel] / tintPeak;
    float materialFilter = mix(.04, pigment, ${glsl(FOCUS_LIGHTING.materialTintMix)});
    float transmission = mix(transmitted[channel], transmittedLuma, ${glsl(FOCUS_LIGHTING.environmentNeutralization)});
    float reflection = mix(reflected[channel], reflectedLuma, ${glsl(FOCUS_LIGHTING.environmentNeutralization)});
    body[channel] = (${glsl(FOCUS_LIGHTING.bodyAmbient)} + transmission * ${glsl(FOCUS_LIGHTING.transmissionGain)} * (.40 + .60 * facetEnergy)) * materialFilter +
      pigment * facetEnergy * (back > .5 ? .085 : .065);
    reflectionRadiance[channel] = (light[channel] * shimmer + reflection * materialFilter * (.035 + .20 * fresnel)) *
      reflectionStrength * (back > .5 ? .65 : 1.);
  }
  vec3 mappedBody = focusToneMap(body * ${glsl(FOCUS_LIGHTING.pigmentBodyGain)} * faceBrightness * (1. + wholeGlow));
  vec3 mappedReflection = focusToneMap(reflectionRadiance);
  float reflectionPeak = max(mappedReflection.r, max(mappedReflection.g, mappedReflection.b));
  vec3 weights = focusOpticalWeights(facetEnergy, fresnel, reflectionPeak, back);
  vec3 straightColor = vec3(0.);
  for (int channel = 0; channel < 3; channel++) {
    float reflectedContribution = mappedReflection[channel] * weights.y / max(reflectionPeak, .000001);
    straightColor[channel] = (mappedBody[channel] * weights.x + reflectedContribution) / max(weights.z, .000001);
  }
  // STRAIGHT color is encoded by colorspace_fragment before NormalBlending.
  return vec4(focusSaturatedTint(straightColor, colorSaturation), weights.z);
}
vec4 focusSurface(vec3 N, vec3 V, vec3 R, vec3 reflected, vec3 transmitted,
                  vec3 point, float facetId, float fresnel, float back) {
  float t = focusLight.y;
  vec3 keyDirection = normalize(vec3(-.62,.76,.82));
  // Narrow angular lights produce moving mirror-like patches on individual cuts.
  float key = pow(max(dot(R, keyDirection), 0.), 128.);
  float fill = pow(max(dot(R, normalize(vec3(.76,.20,.64))), 0.), 88.);
  float crown = pow(max(dot(R, normalize(vec3(.10,-.74,.68))), 0.), 112.);
  float shimmer = .68 + .32 * (.5 + .5 * sin(t * ${glsl(TAU / FOCUS_LIGHTING.shimmerPeriod)} + facetId * 1.618));
  float hue = facetId * .618033989 + dot(R.xy, vec2(.12,.08)) + t / ${glsl(FOCUS_LIGHTING.rainbowPeriod)};
  vec3 prism = focusSpectrum(hue);
  float code = .5 + .5 * sin(facetId * 2.399963);
  float facetEnergy = (.035 + .965 * pow(code, 1.15)) *
    (.55 + .45 * max(dot(N,keyDirection),0.));
  // Every stage has smoothly shifting facet colors, weighted toward its theme;
  // opal has the strongest full-spectrum variation. Cut darkness and transparency
  // still come from optical orientation/energy, not the rainbow phase.
  // This remains an environment/refraction approximation, not a scene buffer.
  vec3 stageTint = focusFacetTint(focusStageTint, focusRainbowMix, facetId, focusRainbowTime, 1.);
  vec2 spot = point.xy - vec2(.34 * sin(facetId * 1.7), .82 * cos(facetId * 2.3));
  float sparkle = exp(-dot(spot,spot) * 48.) *
    pow(max(dot(N, normalize(V + normalize(vec3(-.4,.8,1.)))), 0.), 56.) * shimmer;
  vec3 light = vec3(.90,.97,1.) * key * ${glsl(FOCUS_LIGHTING.reflectionGain)} +
    vec3(.85,.68,1.) * fill * 2.2 + vec3(1.,.79,.36) * crown * 2.0;
  // Dispersion appears only inside the narrow reflection lobes, never across
  // entire faces. Bright near-white mirror reflections preserve glass texture.
  light += prism * (key + fill * .6 + crown * .5) * ${glsl(FOCUS_LIGHTING.rainbowGain)};
  light += vec3(.90,.98,1.) * sparkle * 2.6;
  // Final color strength includes transmitted and reflected contributions without
  // changing their energy, local highlight coverage, or the paused color phase.
  return focusOpticalMix(stageTint, transmitted, reflected, light, shimmer, facetEnergy,
    fresnel, back, focusFaceBrightness, focusReflectionStrength, focusColorSaturation, focusWholeGlow);
}
`;
