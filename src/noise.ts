/* ==========================================================================
 * Seeded noise tiles for grain and paper texture
 * ========================================================================== */

import { clamp } from "./utils.js";

const NOISE_BANDS = 64;

/**
 * Seeded turbulence tile rendered as an SVG data URI. Used for
 * grain and paper texture so both read as random noise instead
 * of a repeating dot pattern.
 */
export function createNoiseImage(
  seed: number,
  baseFrequency: number,
  octaves: number,
  alphaTable: string,
  size: number,
): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<filter id="n" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/>` +
    `<feComponentTransfer><feFuncR type="discrete" tableValues="0 1"/><feFuncG type="discrete" tableValues="0 1"/><feFuncB type="discrete" tableValues="0 1"/><feFuncA type="discrete" tableValues="${alphaTable}"/></feComponentTransfer>` +
    `</filter>` +
    `<rect width="${size}" height="${size}" filter="url(#n)"/>` +
    `</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Builds the alpha transfer table for the noise tile: the noise
 * distribution is stretched outward, then a soft threshold
 * decides which alpha levels light up. Speck darkness varies
 * continuously, which keeps the field organic instead of a
 * two-tone lattice.
 */
function createSpreadAlphaTable(
  stretch: number,
  threshold: number,
  maxAlpha: number,
): string {
  const values: string[] = [];

  for (let index = 0; index < NOISE_BANDS; index += 1) {
    const position = (index + 0.5) / NOISE_BANDS;

    const spread = clamp((position - 0.5) * stretch + 0.5);

    const visible = threshold < 1 ? (spread - threshold) / (1 - threshold) : 0;

    values.push((clamp(visible) * maxAlpha).toFixed(3));
  }

  return values.join(" ");
}

/**
 * Grain amount controls the density of the specks rather than
 * their intensity. The amount is eased so low and initial values
 * stay far subtler: only the top fraction of the stretched noise
 * distribution lights up, and the fraction follows the squared
 * amount.
 */
export function createGrainAlphaTable(amount: number): string {
  const threshold = 0.89 - clamp(amount) * 0.39;

  return createSpreadAlphaTable(1.2, threshold, 0.5);
}

/**
 * Paper texture uses a smooth full-range alpha ramp: a soft,
 * continuous mottle with no discrete levels.
 */
export function createTextureAlphaTable(): string {
  return createSpreadAlphaTable(1.6, 0, 0.3);
}
