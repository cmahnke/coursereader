/* ==========================================================================
 * Playground — a self-contained demo UI for the archive scan effects.
 *
 * `createPlayground(target)` renders the full UI (header, tabs,
 * control panel, sample desk and the multi-page viewer) into any
 * container and returns a handle with a destroy method.
 * ========================================================================== */

import { bindings } from "./bindings.js";
import { buildSvgFilter, createToneFilter } from "./filters.js";
import { courseReader } from "./page.js";
import {
  drawSampleCanvasFigures,
  SAMPLE_DOCUMENT,
  SAMPLE_DOCUMENT_RIGHT,
  VIEWER_BOOK,
} from "./playground-samples.js";
import { installPlaygroundStyles } from "./playground-styles.js";
import { presets } from "./presets.js";
import type {
  CourseReaderPage,
  CourseReaderPageOptions,
  CourseReaderViewer,
  DeepPartial,
  DitherMode,
  PresetDefinition,
  ResponsiveLayout,
  ScanSettings,
  ScanSettingsWithRanges,
  ToneMode,
} from "./types.js";
import {
  clamp,
  deepMerge,
  resolveElement,
  resolveNumericRanges,
  spineScaling,
} from "./utils.js";
import { createCourseReaderViewer } from "./viewer.js";

/**
 * Content and section options for {@link createPlayground}.
 */
export interface PlaygroundOptions {
  /**
   * Header title.
   */
  title?: string;

  /**
   * Header subtitle.
   */
  subtitle?: string;

  /**
   * HTML for the left (verso) sample sheet. Keep the id
   * "sample-document" so the playground can find it.
   */
  sampleDocument?: string;

  /**
   * HTML for the right (recto) sample sheet. Keep the id
   * "sample-document-2".
   */
  sampleDocumentRight?: string;

  /**
   * HTML for the continuous viewer document. It is split into
   * pages at the book break markers; keep the id "viewer-book" on
   * the document element and the ids "viewer-page-2" through
   * "viewer-page-4" on the chapter headings.
   */
  viewerDocument?: string;

  /**
   * Which sections to render. Both default to true.
   */
  sections?: {
    /**
     * Render the interactive playground section.
     */
    playground?: boolean;

    /**
     * Render the multi-page viewer section.
     */
    viewer?: boolean;
  };
}

/**
 * Handle returned by {@link createPlayground}.
 */
export interface PlaygroundHandle {
  /**
   * Root element of the rendered playground.
   */
  readonly element: HTMLDivElement;

  /**
   * Removes the playground and releases its event listeners.
   */
  destroy(): void;
}

const CUSTOM_PRESET = "library-copy";

/*
 * The viewer's spread binding: the playground configures ring-top
 * mode through its captured configuration, everything else uses
 * this built-in binding style.
 */
const VIEWER_BINDING = "deep-bound-volume";

const VIEWER_BOOK_SELECTOR = "#viewer-book";

const RING_FRAME_TOP = 72;

const ROTATION_RANGE = 3;

/*
 * The playground reads presets directly at places that bypass the
 * page renderer; ranges resolve there with the same seed the desk
 * pages would use, so display, filters and sheets stay consistent.
 */
function resolvePresetSettings(
  name: string,
  seed: string | number,
): ScanSettings {
  return resolveNumericRanges(presets.resolve(name), seed);
}

interface ViewerConfig {
  preset: string;
  seed: string | number;
  enhancement: CourseReaderPageOptions["enhancement"];
  overrides: DeepPartial<ScanSettingsWithRanges>;

  /**
   * Whether the playground's ring binder toggle was active when
   * the configuration was captured; the viewer hangs its pages
   * from the comb binding instead of a gutter.
   */
  ringTop: boolean;
}

interface PlaygroundShared {
  viewerConfig: ViewerConfig | null;
  pageCount: number;
  refreshViewer: (() => void) | null;
  showViewerTab: (() => void) | null;
}

/* ==========================================================================
 * Control schema
 *
 * Every panel control is declared as data: markup is generated from
 * the definitions, and the generic wiring in `initPlaygroundControls`
 * drives them. Adding a setting to the panel is one table entry.
 * ========================================================================== */

/**
 * Snapshot of the panel state a control definition may react to.
 */
interface PanelState {
  layout: "single" | "spread";

  ringBinder: boolean;

  ditheredGray: boolean;

  /**
   * The tone settings the reproduction pipeline is meant to use.
   * In facing-pages mode the pages render continuously and this
   * carries the tone; in single-page mode it mirrors the pages.
   * Authored ranges in it are resolved before it is handed out.
   */
  intendedTone: ScanSettings["tone"];

  rotationLeft: number;

  rotationRight: number;
}

/**
 * Runtime access a custom control input handler needs.
 */
interface InputContext {
  pages(): CourseReaderPage[];

  pageRotation: { left: number; right: number };

  ringBinder(): boolean;

  layout(): "single" | "spread";

  applyBindingTilt(): void;
}

interface ControlBase {
  id: string;

  label: string;

  hint: string;

  /**
   * Basic controls render in the panel body, advanced ones inside
   * the collapsed "Advanced settings" disclosure.
   */
  tier: "basic" | "advanced";

  /**
   * Group heading inside the advanced disclosure. Required for
   * advanced controls, ignored for basic ones.
   */
  group?: string;

  /**
   * Tone controls route through the spread overlay tone in
   * facing-pages mode and are disabled while grayscale dithering
   * owns the tone.
   */
  tone?: boolean;

  disabled?(state: PanelState): boolean;
}

interface RangeControl extends ControlBase {
  kind: "range";

  min: number;

  max: number;

  step: number;

  read(settings: ScanSettings, state: PanelState): number;

  apply(value: number): DeepPartial<ScanSettings>;

  /**
   * When present, the control supports the expert range mode: the
   * slider grows a second handle and applies the pair as a
   * `[min, max]` range instead of a single value.
   */
  applyRange?(min: number, max: number): DeepPartial<ScanSettingsWithRanges>;

  /**
   * Formats the output readout; defaults to the raw value.
   */
  format?(value: number): string;

  /**
   * When present, the hook fully owns applying the value and the
   * default page update is skipped.
   */
  onInput?(value: number, context: InputContext): void;
}

interface ToggleControl extends ControlBase {
  kind: "toggle";

  read(settings: ScanSettings, state: PanelState): boolean;

  apply(value: boolean): DeepPartial<ScanSettings>;
}

interface SelectControl extends ControlBase {
  kind: "select";

  options: Array<{ value: string; label: string }>;

  read(settings: ScanSettings, state: PanelState): string;

  apply(value: string): DeepPartial<ScanSettings>;
}

type ControlDefinition = RangeControl | ToggleControl | SelectControl;

const ADVANCED_GROUPS: Array<{ key: string; heading: string }> = [
  { key: "paper", heading: "Paper" },
  { key: "exposure", heading: "Exposure" },
  { key: "ink", heading: "Ink" },
  { key: "tone", heading: "Tone" },
  { key: "artifacts", heading: "Artifacts" },
  { key: "capture", heading: "Capture" },
  { key: "border", heading: "Border" },
];

const CONTROLS: ControlDefinition[] = [
  {
    kind: "range",
    id: "control-contrast",
    label: "Contrast",
    hint: "Pushes midtones toward black or white as part of the exposure curve, before tone reduction.",
    tier: "basic",
    min: 0.5,
    max: 2.5,
    step: 0.05,
    read: (settings) => settings.exposure.contrast,
    apply: (value) => ({ exposure: { contrast: value } }),
    applyRange: (min, max) => ({ exposure: { contrast: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-levels",
    label: "Gray levels",
    hint: "Limits the page to a fixed number of gray levels: 2 is pure black and white, 256 is effectively continuous. Moving it switches the page to quantized tone.",
    tier: "basic",
    tone: true,
    min: 0,
    max: 1,
    step: 0.01,
    read: (settings, state) =>
      state.layout === "spread"
        ? positionFromLevels(state.intendedTone.levels)
        : positionFromLevels(settings.tone.levels),
    apply: (value) => ({
      tone: {
        mode: "quantized",
        levels: levelsFromPosition(value),
      },
    }),
    applyRange: (min, max) => ({
      tone: {
        mode: "quantized",
        levels: [levelsFromPosition(min), levelsFromPosition(max)],
      },
    }),
    format: (value) => String(levelsFromPosition(value)),
    disabled: (state) => state.ditheredGray,
  },

  {
    kind: "range",
    id: "control-threshold",
    label: "Threshold",
    hint: "The black point of two-tone output: pixels below the threshold turn black, above it white. Higher values produce more black. Moving it switches the page to bitonal tone.",
    tier: "basic",
    tone: true,
    min: 0.3,
    max: 0.9,
    step: 0.01,
    read: (settings, state) =>
      state.layout === "spread"
        ? state.intendedTone.threshold
        : settings.tone.threshold,
    apply: (value) => ({
      tone: {
        mode: "bitonal",
        threshold: value,
      },
    }),
    applyRange: (min, max) => ({
      tone: {
        mode: "bitonal",
        threshold: [min, max],
      },
    }),
    disabled: (state) => state.ditheredGray,
  },

  {
    kind: "range",
    id: "control-ink-spread",
    label: "Ink spread",
    hint: "Thickens dark marks, as if the toner gained weight on a well-used copier.",
    tier: "basic",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.ink.spread,
    apply: (value) => ({ ink: { spread: value } }),
    applyRange: (min, max) => ({ ink: { spread: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-blur",
    label: "Blur",
    hint: "Soft-focus blur applied to the inked sheet before tone reduction, as if the scanner lens were slightly out of focus.",
    tier: "basic",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.ink.blur,
    apply: (value) => ({ ink: { blur: value } }),
    applyRange: (min, max) => ({ ink: { blur: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-grain",
    label: "Grain",
    hint: "Fine toner and paper noise across the sheet.",
    tier: "basic",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.grain,
    apply: (value) => ({ artifacts: { grain: value } }),
    applyRange: (min, max) => ({ artifacts: { grain: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-dither",
    label: "Dither amount",
    hint: "Random noise applied before tone reduction. It keeps detail alive in coarse gray levels.",
    tier: "basic",
    tone: true,
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings, state) =>
      state.layout === "spread"
        ? state.intendedTone.ditherAmount
        : settings.tone.ditherAmount,
    apply: (value) =>
      value > 0
        ? { tone: { dither: "random", ditherAmount: value } }
        : { tone: { ditherAmount: 0 } },
    applyRange: (min, max) =>
      min > 0 || max > 0
        ? { tone: { dither: "random", ditherAmount: [min, max] } }
        : { tone: { ditherAmount: 0 } },
    disabled: (state) => state.ditheredGray,
  },

  {
    kind: "range",
    id: "control-rotation-left",
    label: "Rotation — left page",
    hint: "Manual rotation of the left (verso) sheet. The center is straight; sliding left or right sets the direction and angle. In facing-pages mode each page rotates independently.",
    tier: "basic",
    min: -ROTATION_RANGE,
    max: ROTATION_RANGE,
    step: 0.05,
    read: (_settings, state) => state.rotationLeft,
    apply: (value) => ({ capture: { rotation: value } }),
    format: (value) => `${value.toFixed(2)}°`,
    onInput: (value, context) => {
      context.pageRotation.left = value;

      if (context.ringBinder()) {
        context.applyBindingTilt();

        return;
      }

      context.pages()[0]?.update({ capture: { rotation: value } });
    },
  },

  {
    kind: "range",
    id: "control-rotation-right",
    label: "Rotation — right page",
    hint: "Manual rotation of the right (recto) sheet. The center is straight; sliding left or right sets the direction and angle. In single-page mode the left setting applies.",
    tier: "basic",
    min: -ROTATION_RANGE,
    max: ROTATION_RANGE,
    step: 0.05,
    read: (_settings, state) =>
      state.layout === "spread" ? state.rotationRight : 0,
    apply: (value) => ({ capture: { rotation: value } }),
    format: (value) => `${value.toFixed(2)}°`,
    disabled: (state) => state.layout !== "spread" || state.ringBinder,
    onInput: (value, context) => {
      context.pageRotation.right = value;

      if (context.layout() === "spread" && !context.ringBinder()) {
        context.pages()[1]?.update({ capture: { rotation: value } });
      }
    },
  },

  {
    kind: "range",
    id: "control-shinethru",
    label: "Shine-through",
    hint: "Mirrored ghost of the reverse side of the page showing through the sheet.",
    tier: "basic",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.shineThrough,
    apply: (value) => ({ artifacts: { shineThrough: value } }),
    applyRange: (min, max) => ({ artifacts: { shineThrough: [min, max] } }),
  },

  {
    kind: "toggle",
    id: "control-frame",
    label: "Copier frame",
    hint: "The dark surround of the copier bed captured around the sheet. In spreads the binding side is suppressed so facing pages meet at the spine.",
    tier: "basic",
    read: (settings) => settings.border.enabled,
    apply: (value) => ({ border: { enabled: value } }),
  },

  {
    kind: "range",
    id: "control-paper-tone",
    label: "Paper tone",
    hint: "Luminance of the paper base, independent of the exposure treatment.",
    tier: "advanced",
    group: "paper",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.paper.tone,
    apply: (value) => ({ paper: { tone: value } }),
    applyRange: (min, max) => ({ paper: { tone: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-paper-texture",
    label: "Paper texture",
    hint: "Subtle visual texture of the paper fibers.",
    tier: "advanced",
    group: "paper",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.paper.texture,
    apply: (value) => ({ paper: { texture: value } }),
    applyRange: (min, max) => ({ paper: { texture: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-brightness",
    label: "Brightness",
    hint: "Overall brightness multiplier in the exposure curve. 1 leaves the sheet unchanged.",
    tier: "advanced",
    group: "exposure",
    min: 0.5,
    max: 2,
    step: 0.02,
    read: (settings) => settings.exposure.brightness,
    apply: (value) => ({ exposure: { brightness: value } }),
    applyRange: (min, max) => ({ exposure: { brightness: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-gamma",
    label: "Gamma",
    hint: "Midtone response of the exposure curve. Below 1 darkens midtones, above 1 lightens them.",
    tier: "advanced",
    group: "exposure",
    min: 0.5,
    max: 2,
    step: 0.02,
    read: (settings) => settings.exposure.gamma,
    apply: (value) => ({ exposure: { gamma: value } }),
    applyRange: (min, max) => ({ exposure: { gamma: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-unevenness",
    label: "Unevenness",
    hint: "Uneven illumination across the sheet, like a copier lamp losing calibration.",
    tier: "advanced",
    group: "exposure",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.exposure.unevenness,
    apply: (value) => ({ exposure: { unevenness: value } }),
    applyRange: (min, max) => ({ exposure: { unevenness: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-blown-highlights",
    label: "Blown highlights",
    hint: "Highlight clipping. Higher values turn more bright areas pure white.",
    tier: "advanced",
    group: "exposure",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.exposure.blownHighlights,
    apply: (value) => ({ exposure: { blownHighlights: value } }),
    applyRange: (min, max) => ({ exposure: { blownHighlights: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-crushed-shadows",
    label: "Crushed shadows",
    hint: "Shadow clipping. Higher values turn more dark areas pure black.",
    tier: "advanced",
    group: "exposure",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.exposure.crushedShadows,
    apply: (value) => ({ exposure: { crushedShadows: value } }),
    applyRange: (min, max) => ({ exposure: { crushedShadows: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-ink-erosion",
    label: "Ink erosion",
    hint: "Thins dark marks, as if the toner ran low and copies came out faint.",
    tier: "advanced",
    group: "ink",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.ink.erosion,
    apply: (value) => ({ ink: { erosion: value } }),
    applyRange: (min, max) => ({ ink: { erosion: [min, max] } }),
  },

  {
    kind: "select",
    id: "control-tone-mode",
    label: "Tone mode",
    hint: "Tone reduction applied to the finished scan: continuous keeps every gray, quantized limits the palette, bitonal prints in pure black and white.",
    tier: "advanced",
    group: "tone",
    tone: true,
    options: [
      { value: "continuous", label: "continuous" },
      { value: "quantized", label: "quantized" },
      { value: "bitonal", label: "bitonal" },
    ],
    read: (settings, state) =>
      state.layout === "spread" ? state.intendedTone.mode : settings.tone.mode,
    apply: (value) => ({ tone: { mode: value as ToneMode } }),
    disabled: (state) => state.ditheredGray,
  },

  {
    kind: "select",
    id: "control-tone-dither",
    label: "Dither pattern",
    hint: "Noise pattern mixed into the sheet before tone reduction to keep banding from appearing in coarse tones.",
    tier: "advanced",
    group: "tone",
    tone: true,
    options: [
      { value: "none", label: "none" },
      { value: "random", label: "random" },
    ],
    read: (settings, state) =>
      state.layout === "spread"
        ? state.intendedTone.dither
        : settings.tone.dither,
    apply: (value) => ({ tone: { dither: value as DitherMode } }),
    disabled: (state) => state.ditheredGray,
  },

  {
    kind: "range",
    id: "control-dust",
    label: "Dust",
    hint: "Density of dust specks caught on the glass.",
    tier: "advanced",
    group: "artifacts",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.dust,
    apply: (value) => ({ artifacts: { dust: value } }),
    applyRange: (min, max) => ({ artifacts: { dust: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-scratches",
    label: "Scratches",
    hint: "Density of scratches across the scan.",
    tier: "advanced",
    group: "artifacts",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.scratches,
    apply: (value) => ({ artifacts: { scratches: value } }),
    applyRange: (min, max) => ({ artifacts: { scratches: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-bleedthrough",
    label: "Bleed-through",
    hint: "Ink from the reverse side bleeding through the paper.",
    tier: "advanced",
    group: "artifacts",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.bleedThrough,
    apply: (value) => ({ artifacts: { bleedThrough: value } }),
    applyRange: (min, max) => ({ artifacts: { bleedThrough: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-streaks",
    label: "Vertical streaks",
    hint: "Vertical streaks from a dirty copier glass or drum.",
    tier: "advanced",
    group: "artifacts",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.verticalStreaks,
    apply: (value) => ({ artifacts: { verticalStreaks: value } }),
    applyRange: (min, max) => ({ artifacts: { verticalStreaks: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-bands",
    label: "Horizontal bands",
    hint: "Horizontal banding from a tired scanner or copier transport.",
    tier: "advanced",
    group: "artifacts",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.horizontalBands,
    apply: (value) => ({ artifacts: { horizontalBands: value } }),
    applyRange: (min, max) => ({ artifacts: { horizontalBands: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-edgenoise",
    label: "Edge noise",
    hint: "Noise and smudges along the sheet edges.",
    tier: "advanced",
    group: "artifacts",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.artifacts.edgeNoise,
    apply: (value) => ({ artifacts: { edgeNoise: value } }),
    applyRange: (min, max) => ({ artifacts: { edgeNoise: [min, max] } }),
  },

  {
    kind: "toggle",
    id: "control-grayscale",
    label: "Grayscale",
    hint: "Converts the content to grayscale before tone treatment.",
    tier: "advanced",
    group: "capture",
    read: (settings) => settings.capture.grayscale,
    apply: (value) => ({ capture: { grayscale: value } }),
  },

  {
    kind: "range",
    id: "control-perspective",
    label: "Perspective",
    hint: "Keystone distortion, as if the sheet lay skewed on the glass.",
    tier: "advanced",
    group: "capture",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.capture.perspective,
    apply: (value) => ({ capture: { perspective: value } }),
    applyRange: (min, max) => ({ capture: { perspective: [min, max] } }),
    disabled: (state) => state.ringBinder,
  },

  {
    kind: "range",
    id: "control-rotation-jitter",
    label: "Rotation jitter",
    hint: "Seeded random misalignment added on top of the fixed rotation, different for every seed.",
    tier: "advanced",
    group: "capture",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.capture.rotationJitter,
    apply: (value) => ({ capture: { rotationJitter: value } }),
    applyRange: (min, max) => ({ capture: { rotationJitter: [min, max] } }),
    disabled: (state) => state.ringBinder,
  },

  {
    kind: "range",
    id: "control-frame-darkness",
    label: "Frame darkness",
    hint: "Darkness of the copier frame band around the sheet.",
    tier: "advanced",
    group: "border",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.border.darkness,
    apply: (value) => ({ border: { darkness: value } }),
    applyRange: (min, max) => ({ border: { darkness: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-frame-thickness",
    label: "Frame thickness",
    hint: "Thickness of the copier frame band in pixels.",
    tier: "advanced",
    group: "border",
    min: 0,
    max: 60,
    step: 1,
    read: (settings) => settings.border.thickness,
    apply: (value) => ({ border: { thickness: value } }),
    applyRange: (min, max) => ({ border: { thickness: [min, max] } }),
  },

  {
    kind: "range",
    id: "control-frame-roughness",
    label: "Frame roughness",
    hint: "Irregularity of the frame edges.",
    tier: "advanced",
    group: "border",
    min: 0,
    max: 1,
    step: 0.02,
    read: (settings) => settings.border.roughness,
    apply: (value) => ({ border: { roughness: value } }),
    applyRange: (min, max) => ({ border: { roughness: [min, max] } }),
  },

  {
    kind: "toggle",
    id: "control-border-top",
    label: "Frame — top side",
    hint: "Whether the top edge of the sheet receives the copier frame.",
    tier: "advanced",
    group: "border",
    read: (settings) => settings.border.sides.top,
    apply: (value) => ({ border: { sides: { top: value } } }),
  },

  {
    kind: "toggle",
    id: "control-border-right",
    label: "Frame — right side",
    hint: "Whether the right edge of the sheet receives the copier frame.",
    tier: "advanced",
    group: "border",
    read: (settings) => settings.border.sides.right,
    apply: (value) => ({ border: { sides: { right: value } } }),
  },

  {
    kind: "toggle",
    id: "control-border-bottom",
    label: "Frame — bottom side",
    hint: "Whether the bottom edge of the sheet receives the copier frame.",
    tier: "advanced",
    group: "border",
    read: (settings) => settings.border.sides.bottom,
    apply: (value) => ({ border: { sides: { bottom: value } } }),
  },

  {
    kind: "toggle",
    id: "control-border-left",
    label: "Frame — left side",
    hint: "Whether the left edge of the sheet receives the copier frame.",
    tier: "advanced",
    group: "border",
    read: (settings) => settings.border.sides.left,
    apply: (value) => ({ border: { sides: { left: value } } }),
  },
];

/* The gray-levels slider position maps exponentially to a
   level count from 2 (black and white) to 256 (continuous),
   so the useful coarse end gets most of the travel. */
function levelsFromPosition(position: number): number {
  const clamped = Math.min(1, Math.max(0, position));

  return Math.max(2, Math.min(256, Math.round(Math.pow(2, 1 + clamped * 7))));
}

function positionFromLevels(levels: number): number {
  const safe = Math.max(2, Math.min(256, levels));

  return (Math.log2(safe) - 1) / 7;
}

function outputIdFor(control: ControlDefinition): string {
  return `output-${control.id.replace(/^control-/, "")}`;
}

function controlTitleMarkup(control: ControlBase): string {
  return `
    <span class="demo-slider-title"
      >${control.label}
      <button
        class="demo-info"
        type="button"
        aria-label="About ${control.label}"
        aria-expanded="false"
      >
        i
      </button>
    </span>`;
}

function controlPopoverMarkup(control: ControlBase): string {
  return `
    <span class="demo-popover" role="tooltip"
      >${control.hint}</span
    >`;
}

function panelControlMarkup(id: string): string {
  const control = CONTROLS.find((entry) => entry.id === id);

  if (!control) {
    throw new Error(`Unknown playground control: ${id}`);
  }

  if (control.kind === "range") {
    const dual =
      control.applyRange !== undefined
        ? `
      <span class="demo-slider-dual" id="${control.id}-dual">
        <input
          id="${control.id}-range-min"
          type="range"
          min="${control.min}"
          max="${control.max}"
          step="${control.step}"
          value="0"
          aria-label="${control.label} minimum"
        />
        <input
          id="${control.id}-range-max"
          type="range"
          min="${control.min}"
          max="${control.max}"
          step="${control.step}"
          value="0"
          aria-label="${control.label} maximum"
        />
      </span>`
        : "";

    return `
    <label class="demo-slider">
      ${controlTitleMarkup(control)}

      <input
        id="${control.id}"
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        value="0"
      />
      ${dual}

      <output id="${outputIdFor(control)}">–</output>
      ${controlPopoverMarkup(control)}
    </label>`;
  }

  if (control.kind === "toggle") {
    return `
    <label class="demo-slider demo-toggle">
      ${controlTitleMarkup(control)}

      <input id="${control.id}" type="checkbox" />
      ${controlPopoverMarkup(control)}
    </label>`;
  }

  const options = control.options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("\n      ");

  return `
    <label class="demo-slider demo-select">
      ${controlTitleMarkup(control)}

      <select id="${control.id}">
        ${options}
      </select>
      ${controlPopoverMarkup(control)}
    </label>`;
}

function panelAdvancedMarkup(): string {
  const toggle = `
    <label class="demo-slider demo-toggle demo-ranges-toggle">
      <span class="demo-slider-title"
        >Ranges (expert)
        <button
          class="demo-info"
          type="button"
          aria-label="About range mode"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-ranges" type="checkbox" />
      <span class="demo-popover" role="tooltip"
        >Turns every numeric slider into a two-handle range. Moving a
        page between random copies of the setting instead of fixing
        one value: the renderer picks a fresh value between the
        handles for every page, derived from the seed.</span
      >
    </label>`;

  const groups = ADVANCED_GROUPS.map(({ key, heading }) => {
    const controls = CONTROLS.filter(
      (control) => control.tier === "advanced" && control.group === key,
    )
      .map((control) => panelControlMarkup(control.id))
      .join("\n");

    if (!controls) {
      return "";
    }

    return `
    <div class="demo-advanced-group">
      <p class="demo-advanced-heading">${heading}</p>
      ${controls}
    </div>`;
  }).join("\n");

  return `
    <details class="demo-advanced">
      <summary>Advanced settings</summary>
      ${toggle}
      <div class="demo-advanced-groups">${groups}
      </div>
    </details>`;
}

function frameInset(
  page: HTMLElement,
  side: "top" | "right" | "bottom" | "left",
): number {
  return (
    Number.parseFloat(page.style.getPropertyValue(`--archive-frame-${side}`)) ||
    0
  );
}

function offsetWithin(
  element: HTMLElement,
  ancestor: HTMLElement,
  axis: "left" | "top" = "left",
): number {
  let offset = 0;

  let node: HTMLElement | null = element;

  while (node && node !== ancestor) {
    offset += axis === "left" ? node.offsetLeft : node.offsetTop;

    node = node.offsetParent as HTMLElement | null;
  }

  if (node === ancestor) {
    return offset;
  }

  const elementRect = element.getBoundingClientRect();

  const ancestorRect = ancestor.getBoundingClientRect();

  return axis === "left"
    ? elementRect.left - ancestorRect.left
    : elementRect.top - ancestorRect.top;
}

interface BindingBounds {
  paperLeft: number;
  paperTop: number;
  paperWidth: number;
}

function sheetBounds(container: HTMLElement): BindingBounds | null {
  const pages = [
    ...container.querySelectorAll<HTMLElement>(".archive-scan-page"),
  ];

  if (pages.length === 0) {
    return null;
  }

  const edges = pages.map((page) => {
    const left = offsetWithin(page, container, "left");

    const top = offsetWithin(page, container, "top");

    return {
      paperLeft: left + frameInset(page, "left"),
      paperRight: left + page.offsetWidth - frameInset(page, "right"),
      paperTop: top + frameInset(page, "top"),
    };
  });

  const paperLeft = Math.min(...edges.map((edge) => edge.paperLeft));

  return {
    paperLeft,
    paperTop: Math.min(...edges.map((edge) => edge.paperTop)),
    paperWidth: Math.max(...edges.map((edge) => edge.paperRight)) - paperLeft,
  };
}

function clearBinderLayout(binder: HTMLElement): void {
  for (const property of [
    "left",
    "right",
    "width",
    "top",
    "height",
    "--binder-ring-gap",
  ]) {
    binder.style.removeProperty(property);
  }
}

function positionBinder(binder: HTMLElement, bounds: BindingBounds): void {
  const ringCount = Math.max(1, Math.round(bounds.paperWidth / 56));

  binder.style.left = `${Math.round(bounds.paperLeft)}px`;
  binder.style.right = "auto";
  binder.style.width = `${Math.round(bounds.paperWidth)}px`;
  binder.style.top = `${Math.max(0, Math.round(bounds.paperTop - 56))}px`;
  binder.style.removeProperty("height");

  binder.style.setProperty(
    "--binder-ring-gap",
    `${(bounds.paperWidth / ringCount).toFixed(3)}px`,
  );
}

function equalizePageHeights(pages: HTMLElement[]): void {
  if (pages.length < 2) {
    return;
  }

  const target = (side: "top" | "bottom"): number =>
    Math.max(...pages.map((page) => frameInset(page, side)));

  const top = target("top");

  const bottom = target("bottom");

  for (const page of pages) {
    const stage = page.querySelector<HTMLElement>(".archive-scan-stage");

    if (!stage) {
      continue;
    }

    if (Math.abs(frameInset(page, "top") - top) > 0.05) {
      page.style.setProperty("--archive-frame-top", `${top.toFixed(1)}px`);

      stage.style.setProperty("padding-top", `${top.toFixed(1)}px`);
    }

    if (Math.abs(frameInset(page, "bottom") - bottom) > 0.05) {
      page.style.setProperty(
        "--archive-frame-bottom",
        `${bottom.toFixed(1)}px`,
      );

      stage.style.setProperty("padding-bottom", `${bottom.toFixed(1)}px`);
    }
  }
}

function prepareRingFrame(pages: HTMLElement[]): boolean {
  if (pages.length === 0) {
    return false;
  }

  const framed = pages.some((page) =>
    (["top", "right", "bottom", "left"] as const).some(
      (side) => frameInset(page, side) > 0,
    ),
  );

  if (!framed) {
    return false;
  }

  for (const page of pages) {
    const top = Math.max(frameInset(page, "top"), RING_FRAME_TOP);

    page.style.setProperty("--archive-frame-top", `${top.toFixed(1)}px`);

    page
      .querySelector<HTMLElement>(".archive-scan-stage")
      ?.style.setProperty("padding-top", `${top.toFixed(1)}px`);
  }

  equalizePageHeights(pages);

  return true;
}

/* ==========================================================================
 * Markup
 * ========================================================================== */

const PANEL_MARKUP = `
  <fieldset>
    <legend>Preset</legend>
    <select id="control-preset" aria-label="Scan preset"></select>
    <p class="demo-hint">
      Custom presets registered through
      <code>presets.define()</code> appear here too.
    </p>
  </fieldset>

  <fieldset>
    <legend>Enhancement</legend>
    <select id="control-enhancement" aria-label="Enhancement mode">
      <option value="auto">auto (SVG if supported)</option>
      <option value="svg">svg (force SVG filters)</option>
      <option value="css">css (plain fallback)</option>
    </select>
  </fieldset>

  <fieldset>
    <legend>Layout</legend>
    <select id="control-layout" aria-label="Page layout">
      <option value="single">Single page</option>
      <option value="spread" selected>Facing pages</option>
    </select>
    <p class="demo-hint">
      Facing pages scan two sheets with a shared binding shadow.
    </p>
  </fieldset>

  <fieldset>
    <legend>Binding</legend>
    <label class="demo-slider">
      <span class="demo-slider-title"
        >Pages per side
        <button
          class="demo-info"
          type="button"
          aria-label="About pages per side"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-page-count" type="range" min="1" max="16" step="1" value="8" />
      <output id="output-page-count">–</output>
      <span class="demo-popover" role="tooltip"
        >Stacks more sheets at the left and right fore-edges and
        deepens the spine fold. The default of 8 matches the
        original look.</span
      >
    </label>
  </fieldset>

  <fieldset>
    <legend>Seed</legend>
    <input
      id="control-seed"
      type="text"
      value="demo-1971"
      aria-label="Effect seed"
    />
    <button id="control-seed-random" type="button">Randomize</button>
  </fieldset>

  <fieldset id="control-overrides">
    <legend>Live overrides (update)</legend>

    ${panelControlMarkup("control-contrast")}
    ${panelControlMarkup("control-levels")}
    ${panelControlMarkup("control-threshold")}
    ${panelControlMarkup("control-ink-spread")}
    ${panelControlMarkup("control-blur")}
    ${panelControlMarkup("control-grain")}
    ${panelControlMarkup("control-dither")}

    <label class="demo-slider demo-toggle">
      <span class="demo-slider-title"
        >Grayscale dithering
        <button
          class="demo-info"
          type="button"
          aria-label="About grayscale dithering"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-dithered-gray" type="checkbox" />
      <span class="demo-popover" role="tooltip"
        >Reproduces every gray tone as random black dots (stochastic
        screening): darker areas get more dots, lighter areas fewer.
        The sheet stays a live document while all tones come from
        random dithering.</span
      >
    </label>

    ${panelControlMarkup("control-rotation-left")}
    ${panelControlMarkup("control-rotation-right")}
    ${panelControlMarkup("control-shinethru")}
    ${panelControlMarkup("control-frame")}

    <label class="demo-slider demo-toggle">
      <span class="demo-slider-title"
        >Ring binder
        <button
          class="demo-info"
          type="button"
          aria-label="About the ring binder"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-ring-binder" type="checkbox" />
      <span class="demo-popover" role="tooltip"
        >Hangs the sheets from a plastic comb binding at the head. The
        binding is part of the copy, so it receives the same tone
        treatment as the sheet.</span
      >
    </label>

    ${panelAdvancedMarkup()}
  </fieldset>

  <button id="control-destroy" type="button">Destroy effect</button>
  <button id="control-to-viewer" type="button">Show in viewer</button>
  <button id="control-download" type="button">Download preset</button>

  <fieldset>
    <legend>Resolved settings</legend>
    <pre id="control-settings" aria-label="Resolved scan settings"></pre>
  </fieldset>
`;

const VIEWER_TOOLBAR_MARKUP = `
  <button id="viewer-previous" type="button">← Previous</button>
  <span id="viewer-indicator" aria-live="polite">1 / 4</span>
  <button id="viewer-next" type="button">Next →</button>
  <label class="demo-toggle viewer-continuous">
    <input id="viewer-continuous" type="checkbox" />
    <span>Continuous</span>
  </label>
  <span class="demo-hint"
    >Arrow keys navigate · resize to switch single/spread</span
  >
`;

function shellMarkup(options: PlaygroundOptions): string {
  const title = options.title ?? "@projektemacher/coursereader";

  const subtitle =
    options.subtitle ??
    "Live-DOM archival scan and photocopy effects. Text stays selectable — try it.";

  const showPlayground = options.sections?.playground !== false;

  const showViewer = options.sections?.viewer !== false;

  const tabs =
    showPlayground && showViewer
      ? `
        <nav class="demo-tabs" aria-label="Demo sections">
          <button
            id="tab-playground"
            class="demo-tab"
            type="button"
            aria-pressed="true"
          >
            Playground
          </button>
          <button
            id="tab-viewer"
            class="demo-tab"
            type="button"
            aria-pressed="false"
          >
            Viewer
          </button>
        </nav>
      `
      : "";

  const playgroundSection = showPlayground
    ? `
      <section
        id="section-playground"
        class="demo-section"
        aria-label="Preset playground"
      >
        <aside class="demo-panel">${PANEL_MARKUP}</aside>

        <div class="demo-desk" id="playground-desk">
          ${options.sampleDocument ?? SAMPLE_DOCUMENT}
        </div>

        <div id="sample-page-2-parking" hidden>
          ${options.sampleDocumentRight ?? SAMPLE_DOCUMENT_RIGHT}
        </div>
      </section>
    `
    : "";

  const viewerSection = showViewer
    ? `
      <section
        id="section-viewer"
        class="demo-section${showPlayground ? " is-hidden" : ""}"
        aria-label="Archive viewer"
      >
        <div class="demo-panel-row">
          ${VIEWER_TOOLBAR_MARKUP}
        </div>

        <div id="reader" class="demo-reader"></div>

        <div id="viewer-source-pages" hidden>
          ${options.viewerDocument ?? VIEWER_BOOK}
        </div>
      </section>
    `
    : "";

  return `
    <header class="demo-header">
      <div class="demo-header-inner">
        <div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        ${tabs}
      </div>
    </header>

    <main>
      ${playgroundSection}
      ${viewerSection}
    </main>
  `;
}

/* ==========================================================================
 * Control panel logic
 * ========================================================================== */

function initPlaygroundControls(shared: PlaygroundShared): () => void {
  const controller = new AbortController();

  const listenerOptions = { signal: controller.signal };

  const presetSelect =
    document.querySelector<HTMLSelectElement>("#control-preset")!;

  const enhancementSelect = document.querySelector<HTMLSelectElement>(
    "#control-enhancement",
  )!;

  const layoutSelect =
    document.querySelector<HTMLSelectElement>("#control-layout")!;

  const ringBinderToggle = document.querySelector<HTMLInputElement>(
    "#control-ring-binder",
  )!;

  const pageCountSlider = document.querySelector<HTMLInputElement>(
    "#control-page-count",
  )!;

  const pageCountOutput =
    document.querySelector<HTMLElement>("#output-page-count")!;

  const toViewerButton =
    document.querySelector<HTMLButtonElement>("#control-to-viewer")!;

  const downloadButton =
    document.querySelector<HTMLButtonElement>("#control-download")!;

  const seedInput = document.querySelector<HTMLInputElement>("#control-seed")!;

  const seedRandomButton = document.querySelector<HTMLButtonElement>(
    "#control-seed-random",
  )!;

  const destroyButton =
    document.querySelector<HTMLButtonElement>("#control-destroy")!;

  const settingsOutput =
    document.querySelector<HTMLPreElement>("#control-settings")!;

  const overridesFieldset =
    document.querySelector<HTMLFieldSetElement>("#control-overrides")!;

  const frameToggle =
    document.querySelector<HTMLInputElement>("#control-frame")!;

  const ditheredGrayToggle = document.querySelector<HTMLInputElement>(
    "#control-dithered-gray",
  )!;

  const rangesToggle =
    document.querySelector<HTMLInputElement>("#control-ranges")!;

  const desk = document.querySelector<HTMLDivElement>("#playground-desk")!;

  const parking = document.querySelector<HTMLDivElement>(
    "#sample-page-2-parking",
  )!;

  const firstSheet = document.querySelector<HTMLElement>("#sample-document")!;

  const secondSheet =
    document.querySelector<HTMLElement>("#sample-document-2")!;

  interface ControlRuntime {
    control: ControlDefinition;

    input: HTMLInputElement | HTMLSelectElement;

    output: HTMLOutputElement | null;

    /*
     * Expert range mode: controls with `applyRange` carry a second
     * pair of handles that applies the pair as a `[min, max]`
     * range instead of a single value.
     */
    rangeMin: HTMLInputElement | null;

    rangeMax: HTMLInputElement | null;

    dual: HTMLElement | null;
  }

  const runtimes: ControlRuntime[] = [];

  for (const control of CONTROLS) {
    if (control.kind === "toggle") {
      const input = document.querySelector<HTMLInputElement>(`#${control.id}`);

      if (!input) {
        continue;
      }

      runtimes.push({
        control,
        input,
        output: null,
        rangeMin: null,
        rangeMax: null,
        dual: null,
      });
    } else if (control.kind === "select") {
      const input = document.querySelector<HTMLSelectElement>(`#${control.id}`);

      if (!input) {
        continue;
      }

      runtimes.push({
        control,
        input,
        output: null,
        rangeMin: null,
        rangeMax: null,
        dual: null,
      });
    } else {
      const input = document.querySelector<HTMLInputElement>(`#${control.id}`);

      const output = document.querySelector<HTMLOutputElement>(
        `#${outputIdFor(control)}`,
      );

      if (!input || !output) {
        continue;
      }

      const dual = control.applyRange
        ? document.querySelector<HTMLElement>(`#${control.id}-dual`)
        : null;

      const rangeMin =
        dual?.querySelector<HTMLInputElement>("input:first-of-type") ?? null;

      const rangeMax =
        dual?.querySelector<HTMLInputElement>("input:last-of-type") ?? null;

      runtimes.push({
        control,
        input,
        output,
        rangeMin,
        rangeMax,
        dual,
      });
    }
  }

  let pages: CourseReaderPage[] = [];

  /*
   * Expert range mode: when active, every slider with `applyRange`
   * authors a `[min, max]` pair instead of a single value. The
   * authored ranges are kept for the preset download and the
   * viewer capture, since the resolved settings only expose
   * concrete numbers.
   */
  let rangesActive = false;

  let authoredRanges: DeepPartial<ScanSettingsWithRanges> = {};

  const rangeValues = new Map<string, [number, number]>();

  let spreadElement: HTMLDivElement | null = null;

  let spreadToneSvg: SVGSVGElement | null = null;

  let bindingContainer: HTMLElement | null = null;

  let bindingRotator: HTMLElement | null = null;

  const pageRotation = { left: 0, right: 0 };

  let pageCount = 8;

  function deskSeed(): string {
    return seedInput.value.trim() || presetSelect.value;
  }

  function panelState(): PanelState {
    return {
      layout: layoutSelect.value === "spread" ? "spread" : "single",

      ringBinder: ringBinderToggle.checked,

      ditheredGray: ditheredGrayToggle.checked,

      /*
       * Ranges resolve for the state handed to the controls, so
       * readers always see concrete numbers.
       */
      intendedTone: resolveNumericRanges(
        { ...intendedTone },
        deskSeed(),
      ) as ScanSettings["tone"],

      rotationLeft: pageRotation.left,

      rotationRight: pageRotation.right,
    };
  }

  const inputContext: InputContext = {
    pages: () => pages,

    pageRotation,

    ringBinder: () => ringBinderToggle.checked,

    layout: () => (layoutSelect.value === "spread" ? "spread" : "single"),

    applyBindingTilt,
  };

  function applyControlValue(
    control: ControlDefinition,
    value: number | boolean | string,
  ): DeepPartial<ScanSettings> {
    if (control.kind === "range" && typeof value === "number") {
      return control.apply(value);
    }

    if (control.kind === "toggle" && typeof value === "boolean") {
      return control.apply(value);
    }

    if (control.kind === "select" && typeof value === "string") {
      return control.apply(value);
    }

    return {};
  }

  function applyControlChanges(
    control: ControlDefinition,
    overrides: DeepPartial<ScanSettingsWithRanges>,
  ): void {
    if (overrides.tone && control.tone) {
      intendedTone = { ...intendedTone, ...overrides.tone };
    }

    if (!control.tone || layoutSelect.value !== "spread") {
      for (const page of pages) {
        page.update(overrides);
      }
    }

    if (control.tone) {
      syncSpreadTone();
    }

    updateReadout();
    syncDeskBindingWidth();
  }

  function commitControl(
    control: ControlDefinition,
    value: number | boolean | string,
  ): void {
    applyControlChanges(control, applyControlValue(control, value));
  }

  function commitRange(control: RangeControl, min: number, max: number): void {
    if (!control.applyRange) {
      return;
    }

    const overrides = control.applyRange(min, max);

    authoredRanges = deepMerge(authoredRanges, overrides);

    applyControlChanges(control, overrides);
  }

  function writeOutput(runtime: ControlRuntime): void {
    if (runtime.control.kind !== "range" || !runtime.output) {
      return;
    }

    const value = Number(runtime.input.value);

    runtime.output.textContent = runtime.control.format
      ? runtime.control.format(value)
      : String(value);
  }

  function writeRangeFill(
    runtime: ControlRuntime,
    lo: number,
    hi: number,
  ): void {
    if (!runtime.dual || runtime.control.kind !== "range") {
      return;
    }

    const { min, max } = runtime.control;

    const span = max - min || 1;

    runtime.dual.style.setProperty(
      "--lo",
      `${(((lo - min) / span) * 100).toFixed(2)}%`,
    );

    runtime.dual.style.setProperty(
      "--hi",
      `${(((hi - min) / span) * 100).toFixed(2)}%`,
    );
  }

  function writeRangeOutput(
    runtime: ControlRuntime,
    lo: number,
    hi: number,
  ): void {
    if (!runtime.output || runtime.control.kind !== "range") {
      return;
    }

    const { step } = runtime.control;

    /*
     * Fractional steps read with fixed decimals so the text keeps
     * the same length at every drag position; integer steps and
     * custom formats are already stable inside the fixed box.
     */
    const format =
      runtime.control.format ??
      ((value: number) =>
        Number.isInteger(step) ? String(value) : value.toFixed(2));

    runtime.output.textContent = `${format(lo)} – ${format(hi)}`;
  }

  /*
   * In facing-pages mode the reproduction pipeline (dither and
   * tone reduction) runs once, globally, in the spread overlay.
   * The pages therefore render the optical pipeline only, and
   * this holds the tone settings the overlay applies.
   */
  let intendedTone: ScanSettingsWithRanges["tone"];

  function updateReadout(): void {
    settingsOutput.textContent = pages.length
      ? JSON.stringify(pages[0].settings, null, 2)
      : "// effect destroyed";
  }

  /*
   * Stochastic screening: the dither amplitude of 0.5 against the
   * bitonal threshold maps the random dot density exactly onto the
   * tone, so every gray level is reproduced by dithering.
   */
  const DITHERED_GRAY_TONE: ScanSettings["tone"] = {
    mode: "bitonal",
    levels: 2,
    threshold: 0.5,
    dither: "random",
    ditherAmount: 0.5,
  };

  let toneBeforeDither: ScanSettingsWithRanges["tone"] | null = null;

  function captureTone(): ScanSettingsWithRanges["tone"] {
    if (layoutSelect.value === "spread") {
      return { ...intendedTone };
    }

    return pages[0] ? { ...pages[0].settings.tone } : { ...intendedTone };
  }

  function applyDitheredGray(): void {
    if (layoutSelect.value === "spread") {
      intendedTone = { ...DITHERED_GRAY_TONE };

      syncSpreadTone();

      return;
    }

    for (const page of pages) {
      page.update({ tone: DITHERED_GRAY_TONE });
    }
  }

  function restoreDitheredGray(): void {
    const tone =
      toneBeforeDither ??
      resolvePresetSettings(
        presetSelect.value,
        seedInput.value.trim() || presetSelect.value,
      ).tone;

    toneBeforeDither = null;

    if (layoutSelect.value === "spread") {
      intendedTone = tone;

      syncSpreadTone();

      return;
    }

    for (const page of pages) {
      page.update({ tone });
    }
  }

  function syncSliders(): void {
    if (!pages.length) {
      return;
    }

    const settings = pages[0].settings;

    const state = panelState();

    for (const runtime of runtimes) {
      const control = runtime.control;

      runtime.input.disabled = Boolean(control.disabled?.(state));

      if (control.kind === "toggle") {
        if (runtime.input instanceof HTMLInputElement) {
          runtime.input.checked = control.read(settings, state);
        }
      } else if (control.kind === "select") {
        runtime.input.value = control.read(settings, state);
      } else {
        const value = control.read(settings, state);

        const disabled = Boolean(control.disabled?.(state));

        runtime.input.value = String(value);

        if (control.applyRange && runtime.rangeMin && runtime.rangeMax) {
          runtime.input.disabled = disabled || rangesActive;

          runtime.rangeMin.disabled = disabled || !rangesActive;

          runtime.rangeMax.disabled = disabled || !rangesActive;

          if (rangesActive) {
            const [lo, hi] = rangeValues.get(control.id) ?? [value, value];

            runtime.rangeMin.value = String(lo);

            runtime.rangeMax.value = String(hi);

            writeRangeFill(runtime, lo, hi);

            writeRangeOutput(runtime, lo, hi);

            continue;
          }
        } else {
          runtime.input.disabled = disabled;
        }

        runtime.output!.textContent = control.format
          ? control.format(value)
          : String(value);
      }
    }

    pageCountSlider.value = String(pageCount);

    pageCountSlider.disabled = layoutSelect.value !== "spread";

    pageCountOutput.textContent = String(pageCount);
  }

  function setOverridesDisabled(disabled: boolean): void {
    overridesFieldset.disabled = disabled;

    for (const runtime of runtimes) {
      runtime.input.disabled = disabled;

      if (runtime.rangeMin && runtime.rangeMax) {
        runtime.rangeMin.disabled = disabled || !rangesActive;

        runtime.rangeMax.disabled = disabled || !rangesActive;
      }
    }

    downloadButton.disabled = disabled;
  }

  function destroyPages(): void {
    for (const page of pages) {
      page.destroy();
    }

    pages = [];
  }

  function arrangeSingle(): void {
    parking.append(secondSheet);

    const host = document.createElement("div");

    host.className = "demo-sheet-host demo-single-host";

    host.append(firstSheet);

    spreadElement = null;

    desk.classList.remove("is-spread");
    desk.replaceChildren(host);
  }

  function arrangeSpread(): void {
    const spread = document.createElement("div");

    spread.className = "demo-spread";

    const viewport = document.createElement("div");

    viewport.className = "demo-spread-viewport";

    const rotator = document.createElement("div");

    rotator.className = "demo-spread-rotator";

    const leftHost = document.createElement("div");

    leftHost.className = "demo-sheet-host demo-sheet-verso";

    const rightHost = document.createElement("div");

    rightHost.className = "demo-sheet-host demo-sheet-recto";

    leftHost.append(firstSheet);
    rightHost.append(secondSheet);

    rotator.append(leftHost, rightHost);

    viewport.append(rotator);

    spread.append(viewport);

    spreadElement = spread;

    desk.classList.add("is-spread");
    desk.replaceChildren(spread);
  }

  /*
   * Global tone overlay for the spread: the pages are already
   * tone-processed inside their own stages, and grayscale plus
   * tone reduction are idempotent, so the overlay leaves them
   * untouched while the spine curl, page shadows and fore-edge
   * strips receive the same dithered reduction as the sheets.
   */
  function syncSpreadTone(): void {
    spreadToneSvg?.remove();
    spreadToneSvg = null;

    if (!spreadElement) {
      return;
    }

    spreadElement.style.removeProperty("filter");

    if (!pages.length) {
      return;
    }

    const settings = pages[0].settings;

    if (
      intendedTone.mode === "continuous" ||
      pages[0].element.dataset.enhancement !== "svg"
    ) {
      return;
    }

    const svg = createToneFilter(
      resolveNumericRanges(
        { ...settings, tone: intendedTone },
        deskSeed(),
      ) as ScanSettings,
      deskSeed(),
      "demo-spread-tone",
    );

    spreadElement.prepend(svg);

    spreadElement.style.filter = "url(#demo-spread-tone)";

    spreadToneSvg = svg;
  }

  /*
   * Ring binder chrome: the comb sits inside the page's top
   * frame band and rotates with the complete bound book inside
   * the fixed outer frame.
   */
  function applyBinding(ringTop: boolean): void {
    const container = desk.querySelector<HTMLElement>(
      ".demo-spread, .demo-single-host",
    );

    if (!container) {
      return;
    }

    bindingContainer = container;

    const isSpread = layoutSelect.value === "spread";

    container.classList.toggle("ring-top", ringTop && isSpread);

    container.classList.toggle("ring-left", ringTop && !isSpread);

    bindingRotator = isSpread
      ? container.querySelector<HTMLElement>(".demo-spread-rotator")
      : null;

    const existing = container.querySelector(".demo-ring-binder");

    if (ringTop && !existing) {
      const binder = document.createElement("div");

      binder.className = "demo-ring-binder";

      binder.setAttribute("aria-hidden", "true");

      /*
       * The binding is part of the copied image, so it receives
       * the same filter treatment as the sheets — grayscale,
       * exposure, dither and tone.
       */
      if (pages.length) {
        const svg = buildSvgFilter(
          "demo-playground-binder-copy",
          pages[0].settings,
          1337,
        );

        binder.append(svg);

        binder.style.filter = "url(#demo-playground-binder-copy)";

        /*
         * The binding shares the sheet noise, so it reads as
         * part of the copy instead of clean chrome above it.
         */
        binder.style.setProperty(
          "--binder-grain-image",
          pages[0].element.style.getPropertyValue("--archive-grain-image") ||
            "none",
        );
      }

      (bindingRotator ?? container).append(binder);
    } else if (!ringTop) {
      existing?.remove();

      container.style.removeProperty("transform");
    }

    syncDeskBindingWidth();
  }

  function syncDeskBindingWidth(): void {
    if (!bindingContainer) {
      return;
    }

    const binder =
      bindingContainer.querySelector<HTMLDivElement>(".demo-ring-binder");

    if (!binder) {
      return;
    }

    if (!bindingContainer.classList.contains("ring-top")) {
      clearBinderLayout(binder);

      applyBindingTilt();

      return;
    }

    const pageElements = [
      ...bindingContainer.querySelectorAll<HTMLElement>(".archive-scan-page"),
    ];

    if (pageElements.length === 0 || pages.length === 0) {
      return;
    }

    const framed = prepareRingFrame(pageElements);

    const rotator = bindingRotator;

    if (rotator) {
      rotator.style.paddingTop = framed ? "" : "46px";
    }

    const settings = pages[0].settings;

    const frameValue = Math.round((1 - clamp(settings.border.darkness)) * 255);

    const thickness = Math.max(0, settings.border.thickness);

    bindingContainer.style.setProperty(
      "--demo-frame-color",
      `rgb(${frameValue}, ${frameValue}, ${frameValue})`,
    );

    bindingContainer.style.setProperty(
      "--demo-frame-thickness",
      `${thickness}px`,
    );

    const bounds = sheetBounds(rotator ?? bindingContainer);

    if (!bounds) {
      return;
    }

    positionBinder(binder, bounds);
    applyBindingTilt();
  }

  /*
   * Ring-bound pages are locked in alignment, so the complete
   * book — stages, sheets, fold and binder — rotates as one unit
   * inside the fixed outer frame.
   */
  function applyBindingTilt(): void {
    if (!bindingContainer) {
      return;
    }

    bindingContainer.style.removeProperty("transform");

    const rotator = bindingRotator;

    if (!ringBinderToggle.checked) {
      rotator?.style.removeProperty("transform");

      for (const element of bindingContainer.querySelectorAll<HTMLElement>(
        ".archive-scan-content",
      )) {
        element.style.removeProperty("transform-origin");
      }

      return;
    }

    const angle = pageRotation.left;

    const transform = angle ? `rotate(${angle.toFixed(3)}deg)` : "";

    if (rotator) {
      rotator.style.transform = transform;

      return;
    }

    const binder =
      bindingContainer.querySelector<HTMLElement>(".demo-ring-binder");

    const contentLayers = [
      ...bindingContainer.querySelectorAll<HTMLElement>(
        ".archive-scan-content",
      ),
    ];

    for (const element of contentLayers) {
      element.style.removeProperty("transform");
      element.style.removeProperty("transform-origin");
    }

    if (binder) {
      binder.style.removeProperty("transform");
      binder.style.removeProperty("transform-origin");
    }

    if (!angle) {
      return;
    }

    const targets = binder ? [...contentLayers, binder] : contentLayers;

    if (targets.length === 0) {
      return;
    }

    const containerRect = bindingContainer.getBoundingClientRect();

    const originX = containerRect.left + containerRect.width / 2;

    const originY = containerRect.top + containerRect.height / 2;

    for (const target of targets) {
      const rect = target.getBoundingClientRect();

      target.style.transformOrigin = `${originX - rect.left}px ${originY - rect.top}px`;

      target.style.transform = transform;
    }
  }

  /*
   * The page count scales the fold depth onto the curl and stacks
   * sheet edges at the fore-edges through the shared spine
   * renderer. The default of 8 reproduces the original look.
   */
  function applyPageCount(): void {
    if (!bindingContainer) {
      return;
    }

    const { curlHalf, blockDepth } = spineScaling(pageCount);

    bindingContainer.style.setProperty(
      "--archive-curl-half",
      `${curlHalf.toFixed(1)}px`,
    );

    bindingContainer.style.setProperty(
      "--archive-block-depth",
      `${blockDepth}px`,
    );
  }

  function createPages(): void {
    destroyPages();

    /* A rebuilt desk resets the authored ranges to collapsed. */
    authoredRanges = {};

    rangeValues.clear();

    const preset = presetSelect.value;

    const seed = seedInput.value.trim() || preset;

    const enhancement =
      enhancementSelect.value as CourseReaderPageOptions["enhancement"];

    const resolved = resolvePresetSettings(preset, seed);

    intendedTone = resolved.tone;

    const ringTop = ringBinderToggle.checked;

    if (layoutSelect.value === "spread") {
      arrangeSpread();

      pages = [
        courseReader(firstSheet, {
          preset,
          seed: `${seed}:verso`,
          enhancement,

          overrides: {
            capture: ringTop
              ? { rotation: 0, rotationJitter: 0, perspective: 0 }
              : { rotation: pageRotation.left, rotationJitter: 0 },

            tone: {
              mode: "continuous",
              dither: "none",
              ditherAmount: 0,
            },

            border: {
              enabled: frameToggle.checked,
              sides: {
                right: false,
                top: true,
              },
            },
          },
        }),

        courseReader(secondSheet, {
          preset,
          seed: `${seed}:recto`,
          enhancement,

          overrides: {
            capture: ringTop
              ? { rotation: 0, rotationJitter: 0, perspective: 0 }
              : { rotation: pageRotation.right, rotationJitter: 0 },

            tone: {
              mode: "continuous",
              dither: "none",
              ditherAmount: 0,
            },

            border: {
              enabled: frameToggle.checked,
              sides: {
                left: false,
                top: true,
              },
            },
          },
        }),
      ];

      /* The back of the left sheet is the right page, so the
         verso show-through mirrors the recto content. */
      const versoGhost = pages[0].element.querySelector<HTMLDivElement>(
        ".archive-scan-shinethru",
      );

      const rectoMirror = pages[1].content.cloneNode(true) as HTMLElement;

      rectoMirror.removeAttribute("id");
      rectoMirror.style.background = "transparent";

      for (const element of rectoMirror.querySelectorAll("[id]")) {
        element.removeAttribute("id");
      }

      versoGhost?.replaceChildren(rectoMirror);

      /*
       * The shared spine renderer keys on the sheet's spread
       * side: the verso sheet curls on its right edge, the
       * recto sheet on its left edge.
       */
      pages[0].element.dataset.spineSide = "left";

      pages[1].element.dataset.spineSide = "right";
    } else {
      arrangeSingle();

      pages = [
        courseReader(firstSheet, {
          preset,
          seed,
          enhancement,

          overrides: {
            capture: ringTop
              ? { rotation: 0, rotationJitter: 0, perspective: 0 }
              : { rotation: pageRotation.left, rotationJitter: 0 },

            border: {
              enabled: frameToggle.checked,
              sides: {
                left: !ringTop,
              },
            },
          },
        }),
      ];

      /* Single sheets carry no spine chrome; the sheet elements
         are reused across layout changes. */
      delete pages[0].element.dataset.spineSide;
    }

    applyBinding(ringTop);

    applyPageCount();

    applyBindingTilt();

    toneBeforeDither = captureTone();

    if (ditheredGrayToggle.checked) {
      applyDitheredGray();
    }

    syncSliders();
    syncSpreadTone();
    updateReadout();
    setOverridesDisabled(false);
    destroyButton.textContent = "Destroy effect";

    /*
     * Ghost clones are fresh copies without canvas bitmaps, so the
     * sample figures are drawn after every rebuild.
     */
    drawSampleCanvasFigures();
  }

  function destroyAll(): void {
    destroyPages();

    syncSpreadTone();
    updateReadout();
    setOverridesDisabled(true);
    destroyButton.textContent = "Re-create effect";
  }

  function closePopovers(): void {
    for (const slider of document.querySelectorAll(".demo-slider.is-open")) {
      slider.classList.remove("is-open");

      slider
        .querySelector(".demo-info")
        ?.setAttribute("aria-expanded", "false");
    }
  }

  for (const option of presets.names()) {
    const element = document.createElement("option");

    element.value = option;
    element.textContent = option;

    presetSelect.append(element);
  }

  const requestedLayout = new URLSearchParams(window.location.search).get(
    "layout",
  );

  if (requestedLayout === "spread" || requestedLayout === "single") {
    layoutSelect.value = requestedLayout;
  }

  presetSelect.addEventListener("change", () => createPages());

  enhancementSelect.addEventListener("change", () => createPages());

  layoutSelect.addEventListener("change", () => createPages());

  pageCountSlider.addEventListener("input", () => {
    pageCount = Number(pageCountSlider.value);

    pageCountOutput.textContent = String(pageCount);

    applyPageCount();

    shared.pageCount = pageCount;

    shared.refreshViewer?.();
  });

  pageCountSlider.addEventListener("change", () => {
    shared.pageCount = pageCount;

    shared.refreshViewer?.();
  });

  /*
   * Toggling the binder only touches the head frame, the page
   * rotation lock and the binding chrome — every other live
   * override survives.
   */
  ringBinderToggle.addEventListener("change", () => {
    const ringTop = ringBinderToggle.checked;

    const basePerspective = resolvePresetSettings(
      presetSelect.value,
      seedInput.value.trim() || presetSelect.value,
    ).capture.perspective;

    const sideUpdate =
      layoutSelect.value === "spread" ? { top: true } : { left: !ringTop };

    for (const [index, page] of pages.entries()) {
      page.update({
        border: { enabled: frameToggle.checked, sides: sideUpdate },

        capture: ringTop
          ? { rotation: 0, rotationJitter: 0, perspective: 0 }
          : {
              rotation:
                index === 1 && layoutSelect.value === "spread"
                  ? pageRotation.right
                  : pageRotation.left,

              rotationJitter: 0,

              perspective: basePerspective,
            },
      });
    }

    applyBinding(ringTop);
    applyPageCount();
    applyBindingTilt();
    syncSliders();
    updateReadout();
  });

  seedInput.addEventListener("change", () => createPages());

  seedRandomButton.addEventListener("click", () => {
    seedInput.value = Math.random().toString(36).slice(2, 10);

    createPages();
  });

  /*
   * The checkbox owns the tone while it is checked: the tone
   * controls are disabled and the previous tone returns when it is
   * switched off again.
   */
  ditheredGrayToggle.addEventListener("change", () => {
    if (ditheredGrayToggle.checked) {
      toneBeforeDither = captureTone();

      applyDitheredGray();
    } else {
      restoreDitheredGray();
    }

    syncSliders();
    updateReadout();
  });

  /*
   * Expert range mode: leaving it discards the authored ranges, so
   * re-entering always starts from collapsed ranges again.
   */
  rangesToggle.addEventListener("change", () => {
    rangesActive = rangesToggle.checked;

    overridesFieldset.classList.toggle("demo-ranges", rangesActive);

    if (!rangesActive) {
      authoredRanges = {};

      rangeValues.clear();
    }

    syncSliders();
  });

  destroyButton.addEventListener("click", () => {
    if (pages.length) {
      destroyAll();
    } else {
      createPages();
    }
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    ".demo-info",
  )) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const slider = button.closest(".demo-slider")!;

      const open = slider.classList.toggle("is-open");

      button.setAttribute("aria-expanded", String(open));

      if (open) {
        for (const other of document.querySelectorAll(".demo-slider.is-open")) {
          if (other !== slider) {
            other.classList.remove("is-open");

            other
              .querySelector(".demo-info")
              ?.setAttribute("aria-expanded", "false");
          }
        }
      }
    });
  }

  document.addEventListener(
    "click",
    (event) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".demo-slider")
      ) {
        closePopovers();
      }
    },
    listenerOptions,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closePopovers();
      }
    },
    listenerOptions,
  );

  for (const runtime of runtimes) {
    const control = runtime.control;

    if (control.kind === "range") {
      runtime.input.addEventListener("input", () => {
        const value = Number(runtime.input.value);

        writeOutput(runtime);

        if (control.onInput) {
          control.onInput(value, inputContext);

          updateReadout();
          syncDeskBindingWidth();
        } else {
          commitControl(control, value);
        }
      });

      if (runtime.rangeMin && runtime.rangeMax && control.applyRange) {
        const commitDual = (moved: "min" | "max"): void => {
          let lo = Number(runtime.rangeMin!.value);

          let hi = Number(runtime.rangeMax!.value);

          /* The handles may not cross: the moved one clamps. */
          if (lo > hi) {
            if (moved === "min") {
              lo = hi;

              runtime.rangeMin!.value = String(lo);
            } else {
              hi = lo;

              runtime.rangeMax!.value = String(hi);
            }
          }

          rangeValues.set(control.id, [lo, hi]);

          writeRangeFill(runtime, lo, hi);

          writeRangeOutput(runtime, lo, hi);

          commitRange(control, lo, hi);
        };

        runtime.rangeMin.addEventListener("input", () => commitDual("min"));

        runtime.rangeMax.addEventListener("input", () => commitDual("max"));
      }
    } else if (control.kind === "toggle") {
      runtime.input.addEventListener("change", () => {
        if (!(runtime.input instanceof HTMLInputElement)) {
          return;
        }

        commitControl(control, runtime.input.checked);
      });
    } else {
      runtime.input.addEventListener("change", () => {
        commitControl(control, runtime.input.value);
      });
    }
  }

  /*
   * Sends the current playground configuration — preset, seed,
   * enhancement, live overrides and the resolved tone — into the
   * viewer and switches to its tab.
   */
  toViewerButton.addEventListener("click", () => {
    if (!pages.length) {
      return;
    }

    const settings = pages[0].settings;

    shared.viewerConfig = {
      preset: presetSelect.value,

      seed: seedInput.value.trim() || presetSelect.value,

      enhancement:
        enhancementSelect.value as CourseReaderPageOptions["enhancement"],

      /*
       * The authored ranges ride on top of the resolved settings;
       * the viewer's pages resolve them per seed.
       */
      overrides: deepMerge(
        settings,
        authoredRanges,
        {
          tone: intendedTone,
        },
        {
          border: {
            sides: { top: true, right: true, bottom: true, left: true },
          },
        },
      ),

      ringTop: ringBinderToggle.checked,
    };

    shared.refreshViewer?.();
    shared.showViewerTab?.();
  });

  /*
   * Downloads the current configuration as a standalone JSON
   * preset: the resolved settings with the tone the desk actually
   * displays, so importing the file reproduces the view.
   */
  downloadButton.addEventListener("click", () => {
    if (!pages.length) {
      return;
    }

    const definition: PresetDefinition = deepMerge(
      pages[0].settings,
      authoredRanges,
      { tone: captureTone() },
    );

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(definition, null, 2)], {
        type: "application/json",
      }),
    );

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "coursereader-preset.json";

    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  let bindingResizeTimer = 0;

  window.addEventListener(
    "resize",
    () => {
      window.clearTimeout(bindingResizeTimer);

      bindingResizeTimer = window.setTimeout(syncDeskBindingWidth, 150);
    },
    listenerOptions,
  );

  createPages();

  return () => {
    controller.abort();

    destroyPages();

    spreadToneSvg?.remove();
    spreadToneSvg = null;
  };
}

/* ==========================================================================
 * Viewer logic
 * ========================================================================== */

function initViewerControls(shared: PlaygroundShared): () => void {
  const controller = new AbortController();

  const section = document.querySelector<HTMLElement>("#section-viewer")!;

  const previousButton =
    document.querySelector<HTMLButtonElement>("#viewer-previous")!;

  const nextButton = document.querySelector<HTMLButtonElement>("#viewer-next")!;

  const continuousToggle =
    document.querySelector<HTMLInputElement>("#viewer-continuous")!;

  const indicator = document.querySelector<HTMLElement>("#viewer-indicator")!;

  let viewer: CourseReaderViewer | null = null;

  function buildLayouts(ringTop: boolean): ResponsiveLayout[] {
    /*
     * The page count scales the gutter depth onto the viewer's
     * spine, matching the desk's fold scaling. The binding comes
     * from the playground's configuration: ring-top mode replaces
     * the gutter with the comb binder.
     */
    const { curlFactor } = spineScaling(shared.pageCount);

    return [
      {
        query: "(max-width: 767px)",
        mode: "single",
        pageFit: "width",
        gutter: false,
        background: "#222",
      },

      {
        query: "(min-width: 768px)",
        mode: "spread",
        pageFit: "contain",
        gap: 0,
        gutter: ringTop
          ? false
          : {
              ...bindings.get(VIEWER_BINDING),

              width: Math.max(
                8,
                bindings.get(VIEWER_BINDING).width * curlFactor,
              ),
            },
        background: "#222",
      },
    ];
  }

  function updateIndicator(): void {
    if (!viewer) {
      return;
    }

    indicator.textContent = `${viewer.getPage() + 1} / ${viewer.pageCount}`;
  }

  /*
   * The comb spans the paper and sits inside the page's top
   * frame: measure the paper edges, enlarge the top band to
   * hold the comb, and show the frame around the whole view.
   */
  function syncBindingWidth(): void {
    if (!viewer) {
      return;
    }

    const binder =
      viewer.element.querySelector<HTMLDivElement>(".demo-ring-binder");

    if (!binder) {
      return;
    }

    if (viewer.element.dataset.mode === "single") {
      viewer.element.classList.remove("ring-framed");

      clearBinderLayout(binder);

      return;
    }

    const pages = [
      ...viewer.element.querySelectorAll<HTMLElement>(".archive-scan-page"),
    ];

    const framed = prepareRingFrame(pages);

    viewer.element.classList.toggle("ring-framed", framed);

    const bounds = sheetBounds(viewer.element);

    if (!bounds) {
      return;
    }

    positionBinder(binder, bounds);
  }

  function createViewer(): void {
    viewer?.destroy();
    viewer = null;

    const ringTop = shared.viewerConfig?.ringTop ?? false;

    const config = shared.viewerConfig;

    const ringOverrides = {
      capture: { rotation: 0, rotationJitter: 0 },
    };

    /*
     * A custom configuration from the playground replaces the
     * defaults; the ring lock still applies on top of it.
     */
    const overrides = config
      ? { ...config.overrides, ...(ringTop ? ringOverrides : {}) }
      : ringTop
        ? ringOverrides
        : undefined;

    viewer = createCourseReaderViewer("#reader", {
      pages: VIEWER_BOOK_SELECTOR,

      /*
       * The generated page hosts share the paper styling of the
       * document element; the text pages read as justified prose.
       */
      bookHostClasses: "paper viewer-page cr-prose",

      preset: config?.preset ?? "microfilm-journal",

      seed: config?.seed ?? 1971,

      enhancement: config?.enhancement,

      layouts: buildLayouts(ringTop),

      overrides,

      /* The stack follows the layout mode: single pages below
         each other, or facing-page rows in spread mode. */
      continuous: continuousToggle.checked,

      /* Fragment links between pages navigate the viewer. */
      followLinks: true,

      /* The spine scales with the same pages-per-side control
         that drives the desk's fold. */
      spinePages: shared.pageCount,
    });

    viewer.element.classList.toggle("demo-ring-top", ringTop);

    if (ringTop) {
      const binder = document.createElement("div");

      binder.className = "demo-ring-binder";

      binder.setAttribute("aria-hidden", "true");

      /* The binding is part of the copy: same filter as the pages. */
      const settings = resolvePresetSettings(
        "microfilm-journal",
        config?.seed ?? 1971,
      );

      const copyFilter = buildSvgFilter(
        "demo-viewer-binder-copy",
        settings,
        1971,
      );

      binder.append(copyFilter);

      binder.style.filter = "url(#demo-viewer-binder-copy)";

      const firstPage =
        viewer.element.querySelector<HTMLDivElement>(".archive-scan-page");

      binder.style.setProperty(
        "--binder-grain-image",
        firstPage?.style.getPropertyValue("--archive-grain-image") || "none",
      );

      viewer.element.append(binder);
    }

    updateIndicator();
    syncBindingWidth();

    /* The viewer's ghost clones need the canvas figures drawn too. */
    drawSampleCanvasFigures();
  }

  shared.refreshViewer = createViewer;

  continuousToggle.addEventListener("change", () => {
    createViewer();
  });

  previousButton.addEventListener("click", () => {
    void viewer?.previous().then(() => {
      updateIndicator();
      syncBindingWidth();
    });
  });

  nextButton.addEventListener("click", () => {
    void viewer?.next().then(() => {
      updateIndicator();
      syncBindingWidth();
    });
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (section.classList.contains("is-hidden")) {
        return;
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        void viewer?.next().then(() => {
          updateIndicator();
          syncBindingWidth();
        });
      } else if (event.key === "ArrowLeft") {
        void viewer?.previous().then(() => {
          updateIndicator();
          syncBindingWidth();
        });
      }
    },
    { signal: controller.signal },
  );

  let resizeTimer = 0;

  window.addEventListener(
    "resize",
    () => {
      window.clearTimeout(resizeTimer);

      resizeTimer = window.setTimeout(syncBindingWidth, 200);
    },
    { signal: controller.signal },
  );

  createViewer();

  return () => {
    controller.abort();

    viewer?.destroy();
    viewer = null;
  };
}

/* ==========================================================================
 * Public factory
 * ========================================================================== */

/**
 * Renders the self-contained playground UI into a host element.
 *
 * The playground includes header tabs, a control panel, sample sheets
 * and a multi-page viewer. It registers its demo preset and binding
 * in the global registries on first use.
 *
 * @param target - Host element or selector that receives the playground.
 * @param options - Titles, sample content and section visibility.
 * @returns A handle for removing the playground.
 * @throws {Error} When both sections are disabled.
 *
 * @example
 * ```ts
 * const playground = createPlayground("#app", {
 *   title: "Archive Scan",
 *   sections: { playground: true, viewer: true },
 * });
 * ```
 */
export function createPlayground(
  target: HTMLElement | string,
  options: PlaygroundOptions = {},
): PlaygroundHandle {
  installPlaygroundStyles();

  const showPlayground = options.sections?.playground !== false;

  const showViewer = options.sections?.viewer !== false;

  if (!showPlayground && !showViewer) {
    throw new Error("The playground requires at least one section.");
  }

  if (!presets.has(CUSTOM_PRESET)) {
    presets.define(CUSTOM_PRESET, {
      extends: "analog-gray-copy",

      exposure: {
        contrast: 1.35,
        unevenness: 0.2,
      },

      tone: {
        mode: "quantized",
        levels: 6,
        dither: "random",
        ditherAmount: 0.38,
      },

      artifacts: {
        grain: 0.25,
        verticalStreaks: 0.08,
      },
    });
  }

  const host = resolveElement(target);

  const shell = document.createElement("div");

  shell.className = "demo-shell";

  shell.innerHTML = shellMarkup(options);

  host.append(shell);

  const playgroundTab =
    shell.querySelector<HTMLButtonElement>("#tab-playground");

  const viewerTab = shell.querySelector<HTMLButtonElement>("#tab-viewer");

  const playgroundSection = shell.querySelector<HTMLElement>(
    "#section-playground",
  );

  const viewerSection = shell.querySelector<HTMLElement>("#section-viewer");

  function selectTab(active: "playground" | "viewer"): void {
    const isPlayground = active === "playground";

    playgroundSection?.classList.toggle("is-hidden", !isPlayground);

    viewerSection?.classList.toggle("is-hidden", isPlayground);

    playgroundTab?.setAttribute("aria-pressed", String(isPlayground));

    viewerTab?.setAttribute("aria-pressed", String(!isPlayground));
  }

  playgroundTab?.addEventListener("click", () => selectTab("playground"));

  viewerTab?.addEventListener("click", () => selectTab("viewer"));

  const shared: PlaygroundShared = {
    viewerConfig: null,
    pageCount: 8,
    refreshViewer: null,
    showViewerTab: null,
  };

  shared.showViewerTab = () => selectTab("viewer");

  const cleanups: Array<() => void> = [];

  if (showPlayground) {
    selectTab("playground");

    cleanups.push(initPlaygroundControls(shared));
  } else {
    selectTab("viewer");
  }

  if (showViewer) {
    cleanups.push(initViewerControls(shared));
  }

  let destroyed = false;

  return {
    element: shell,

    destroy(): void {
      if (destroyed) {
        return;
      }

      destroyed = true;

      for (const cleanup of cleanups) {
        cleanup();
      }

      shell.remove();
    },
  };
}
