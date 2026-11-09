/* ==========================================================================
 * SVG filter generation
 * ========================================================================== */

import type { ScanSettings } from "./types.js";
import { clamp, createSvgElement, hashSeed, setAttributes } from "./utils.js";

const GRAYSCALE_MATRIX = [
  "0.2126 0.7152 0.0722 0 0",
  "0.2126 0.7152 0.0722 0 0",
  "0.2126 0.7152 0.0722 0 0",
  "0 0 0 1 0",
].join(" ");

const IDENTITY_MATRIX = [
  "1 0 0 0 0",
  "0 1 0 0 0",
  "0 0 1 0 0",
  "0 0 0 1 0",
].join(" ");

/**
 * Creates the hidden SVG shell and its filter element. Both the
 * page filter and the standalone tone filter share the same
 * setup: a zero-sized inline SVG with an sRGB filter region.
 */
function createFilterSvg(id: string): {
  svg: SVGSVGElement;
  filter: SVGFilterElement;
} {
  const svg = createSvgElement("svg");

  svg.classList.add("archive-scan-svg");

  setAttributes(svg, {
    "aria-hidden": "true",
    width: 0,
    height: 0,
    focusable: "false",
  });

  const definitions = createSvgElement("defs");

  const filter = createSvgElement("filter");

  setAttributes(filter, {
    id,
    x: "-10%",
    y: "-10%",
    width: "120%",
    height: "120%",
    /*
     * SVG presentation attributes are lowercase-hyphenated;
     * the camelCase form is silently ignored, which would
     * silently switch the whole chain to linearRGB and
     * shift every threshold and quantization band.
     */
    "color-interpolation-filters": "sRGB",
  });

  filter.style.colorInterpolationFilters = "sRGB";

  definitions.append(filter);
  svg.append(definitions);

  return { svg, filter };
}

function appendGrayscaleStage(
  filter: SVGFilterElement,
  grayscale: boolean,
): void {
  const matrix = createSvgElement("feColorMatrix");

  setAttributes(matrix, {
    in: "SourceGraphic",
    type: "matrix",
    values: grayscale ? GRAYSCALE_MATRIX : IDENTITY_MATRIX,
    result: "archive-gray",
  });

  filter.append(matrix);
}

function appendTransfer(
  filter: SVGFilterElement,
  input: string,
  result: string,
  values: string,
): void {
  const transfer = createSvgElement("feComponentTransfer");

  setAttributes(transfer, {
    in: input,
    result,
  });

  for (const channel of ["R", "G", "B"] as const) {
    const component = createSvgElement(
      `feFunc${channel}` as "feFuncR" | "feFuncG" | "feFuncB",
    );

    setAttributes(component, {
      type: "table",
      tableValues: values,
    });

    transfer.append(component);
  }

  filter.append(transfer);
}

/**
 * Clips the filter chain to the source raster: filter primitives
 * may produce results outside the element box (the dither noise
 * fills the whole filter region), which would otherwise bleed
 * over neighbouring content.
 */
function appendSourceClip(filter: SVGFilterElement, input: string): void {
  const clip = createSvgElement("feComposite");

  setAttributes(clip, {
    in: input,
    in2: "SourceGraphic",
    operator: "in",
  });

  filter.append(clip);
}

function appendArithmeticMix(
  filter: SVGFilterElement,
  first: string,
  second: string,
  keep: number,
  blend: number,
  result: string,
): void {
  const mix = createSvgElement("feComposite");

  setAttributes(mix, {
    in: first,
    in2: second,
    operator: "arithmetic",
    k1: 0,
    k2: keep.toFixed(4),
    k3: blend.toFixed(4),
    k4: 0,
    result,
  });

  filter.append(mix);
}

/**
 * Applies ink spread or erosion in sub-pixel steps. Browsers
 * round the feMorphology radius to whole pixels, so the visible
 * amount is blended between the original and the one- or
 * two-pixel morphology result. Amount runs from 0 to 2.
 */
function appendMorphologyStage(
  filter: SVGFilterElement,
  input: string,
  operator: "erode" | "dilate",
  amount: number,
  result: string,
): void {
  const first = createSvgElement("feMorphology");

  setAttributes(first, {
    in: input,
    operator,
    radius: 1,
    result: `${result}-1`,
  });

  filter.append(first);

  if (amount < 1) {
    appendArithmeticMix(
      filter,
      input,
      `${result}-1`,
      1 - amount,
      amount,
      result,
    );
  } else {
    const second = createSvgElement("feMorphology");

    setAttributes(second, {
      in: `${result}-1`,
      operator,
      radius: 1,
      result: `${result}-2`,
    });

    filter.append(second);

    appendArithmeticMix(
      filter,
      `${result}-1`,
      `${result}-2`,
      2 - amount,
      amount - 1,
      result,
    );
  }
}

function createExposureTable(
  settings: ScanSettings,
  sampleCount = 128,
): string {
  const values: string[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    let value = index / (sampleCount - 1);

    value *= settings.exposure.brightness;

    value = (value - 0.5) * settings.exposure.contrast + 0.5;

    value = Math.pow(clamp(value), 1 / Math.max(0.01, settings.exposure.gamma));

    const crushed = clamp(settings.exposure.crushedShadows);

    if (crushed > 0 && value < crushed * 0.45) {
      value *= 1 - crushed;
    }

    const blown = clamp(settings.exposure.blownHighlights);

    if (blown > 0) {
      const start = 1 - blown * 0.45;

      if (value > start) {
        value = start + (value - start) * (1 + blown * 2.5);
      }
    }

    values.push(clamp(value).toFixed(4));
  }

  return values.join(" ");
}

/**
 * Builds an SVG component-transfer table for the configured tone mode.
 *
 * The table maps evenly spaced input samples to output values between
 * 0 and 1. In `"continuous"` mode it is the identity ramp; quantized
 * and bitonal modes emit their stepped or thresholded values.
 *
 * @param settings - Scan settings providing the tone mode, levels and
 * threshold.
 * @param sampleCount - Number of evenly spaced table entries.
 * @returns Space-separated transfer values.
 */
export function createToneTable(
  settings: ScanSettings,
  sampleCount = 128,
): string {
  const values: string[] = [];
  const mode = settings.tone.mode;

  for (let index = 0; index < sampleCount; index += 1) {
    const input = index / (sampleCount - 1);

    let output = input;

    if (mode === "bitonal") {
      output = input < settings.tone.threshold ? 0 : 1;
    } else if (mode === "quantized") {
      const levels = Math.max(2, Math.floor(settings.tone.levels));

      output = Math.round(input * (levels - 1)) / (levels - 1);
    }

    values.push(output.toFixed(4));
  }

  return values.join(" ");
}

/*
 * Dither amplitude scales with the quantization step, so
 * reducing the number of levels produces progressively more
 * visible dithering instead of flat solid bands.
 */
function createDitherStep(settings: ScanSettings): number {
  if (settings.tone.mode === "bitonal") {
    return 1;
  }

  if (settings.tone.mode === "quantized") {
    return 1 / Math.max(1, Math.floor(settings.tone.levels) - 1);
  }

  return 0.16;
}

function appendDitherStage(
  filter: SVGFilterElement,
  input: string,
  settings: ScanSettings,
  seed: number,
  result: string,
): void {
  const turbulence = createSvgElement("feTurbulence");

  setAttributes(turbulence, {
    type: "fractalNoise",
    baseFrequency: "0.72",
    numOctaves: 1,
    seed,
    stitchTiles: "stitch",
    result: "archive-noise",
  });

  filter.append(turbulence);

  /*
   * Turbulence emits premultiplied RGBA: its RGB is darkened by
   * its own random alpha, so desaturating it would yield a noise
   * field biased toward black. Taking the luminance from the
   * alpha channel — true un-premultiplied noise — and forcing
   * full opacity keeps the dither field clean and symmetric,
   * even at the large amplitudes used for bitonal output.
   */
  const noiseGray = createSvgElement("feColorMatrix");

  setAttributes(noiseGray, {
    in: "archive-noise",
    type: "matrix",
    values: ["0 0 0 1 0", "0 0 0 1 0", "0 0 0 1 0", "0 0 0 0 1"].join(" "),
    result: "archive-noise-gray",
  });

  filter.append(noiseGray);

  const amount =
    clamp(settings.tone.ditherAmount) * 2 * createDitherStep(settings);

  const composite = createSvgElement("feComposite");

  setAttributes(composite, {
    in: input,
    in2: "archive-noise-gray",
    operator: "arithmetic",
    k1: 0,
    k2: 1,
    k3: amount.toFixed(4),
    k4: (-amount / 2).toFixed(4),
    result,
  });

  filter.append(composite);
}

/**
 * A standalone filter applying the tone treatment —
 * grayscale, seeded dither and the tone table — to arbitrary
 * content. Applications can use it as a global overlay so
 * surrounding chrome receives the same reduction as the
 * scanned pages.
 *
 * @param settings - Scan settings providing the tone treatment.
 * @param seed - Seed for deterministic dither noise.
 * @param id - Unique id for the generated SVG filter.
 * @returns A zero-sized SVG element containing the filter.
 *
 * @example
 * ```ts
 * const page = createCourseReaderPage("#document");
 *
 * document.body.append(
 *   createToneFilter(page.settings, 1971, "global-tone-filter"),
 * );
 * ```
 */
export function createToneFilter(
  settings: ScanSettings,
  seed: string | number,
  id: string,
): SVGSVGElement {
  const { svg, filter } = createFilterSvg(id);

  appendGrayscaleStage(filter, true);

  let currentResult = "archive-gray";

  if (settings.tone.dither === "random" && settings.tone.ditherAmount > 0) {
    appendDitherStage(
      filter,
      currentResult,
      settings,
      hashSeed(seed) % 10000,
      "archive-dithered",
    );

    currentResult = "archive-dithered";
  }

  if (settings.tone.mode !== "continuous") {
    appendTransfer(
      filter,
      currentResult,
      "archive-toned",
      createToneTable(settings),
    );

    currentResult = "archive-toned";
  }

  appendSourceClip(filter, currentResult);

  return svg;
}

/*
 * The optical pipeline — grayscale, exposure and ink — applies to
 * the sheet content only. The noise overlays (grain, paper
 * texture) live on the stage, outside this filter, so the ink
 * morphology cannot thicken their specks into squares.
 */
export function buildContentFilter(
  id: string,
  settings: ScanSettings,
): SVGSVGElement {
  const { svg, filter } = createFilterSvg(id);

  appendGrayscaleStage(filter, settings.capture.grayscale);

  appendTransfer(
    filter,
    "archive-gray",
    "archive-exposed",
    createExposureTable(settings),
  );

  let currentResult = "archive-exposed";

  if (settings.ink.spread > 0) {
    appendMorphologyStage(
      filter,
      currentResult,
      "erode",
      clamp(settings.ink.spread) * 2,
      "archive-spread",
    );

    currentResult = "archive-spread";
  }

  if (settings.ink.erosion > 0) {
    appendMorphologyStage(
      filter,
      currentResult,
      "dilate",
      clamp(settings.ink.erosion) * 2,
      "archive-eroded",
    );

    currentResult = "archive-eroded";
  }

  if (settings.ink.blur > 0) {
    const blur = createSvgElement("feGaussianBlur");

    setAttributes(blur, {
      in: currentResult,
      stdDeviation: (clamp(settings.ink.blur) * 0.7).toFixed(3),
      result: "archive-blurred",
    });

    filter.append(blur);
    currentResult = "archive-blurred";
  }

  appendSourceClip(filter, currentResult);

  return svg;
}

/*
 * The reproduction pipeline — seeded dither and tone reduction —
 * applies to the whole stage: content, paper, frame and the noise
 * overlays. It runs after the ink stages, so grain keeps its fine
 * structure while still receiving the same tone treatment as the
 * sheet.
 */
export function buildSvgFilter(
  id: string,
  settings: ScanSettings,
  seed: number,
): SVGSVGElement {
  const { svg, filter } = createFilterSvg(id);

  let currentResult = "SourceGraphic";

  if (settings.tone.dither === "random" && settings.tone.ditherAmount > 0) {
    appendDitherStage(
      filter,
      currentResult,
      settings,
      seed,
      "archive-dithered",
    );

    currentResult = "archive-dithered";
  }

  if (settings.tone.mode !== "continuous") {
    appendTransfer(
      filter,
      currentResult,
      "archive-toned",
      createToneTable(settings),
    );

    currentResult = "archive-toned";
  }

  appendSourceClip(filter, currentResult);

  return svg;
}
