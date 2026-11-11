/* ==========================================================================
 * Public types
 * ========================================================================== */

import type { BindingRegistry } from "./bindings.js";
import type { PresetRegistry } from "./presets.js";

/**
 * Recursively makes every property of `T` optional.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Tone reduction applied to the finished scan.
 *
 * - `"continuous"` keeps the full grayscale range.
 * - `"quantized"` reduces the output to a fixed number of gray levels.
 * - `"bitonal"` thresholds every pixel to black or white.
 */
export type ToneMode = "continuous" | "quantized" | "bitonal";

/**
 * Dither pattern used before tone reduction.
 *
 * - `"none"` applies no dithering.
 * - `"random"` adds seeded noise so banding breaks up like analog grain.
 */
export type DitherMode = "none" | "random";

/**
 * Scan and reproduction settings shared by pages and viewers.
 *
 * Numeric amounts normally run from 0 to 1, where 0 disables the
 * effect and 1 applies its full strength.
 */
export interface ScanSettings {
  paper: {
    /**
     * Paper luminance from 0 to 1.
     */
    tone: number;

    /**
     * Subtle visual paper texture from 0 to 1.
     */
    texture: number;
  };

  exposure: {
    /**
     * Overall brightness multiplier. 1 leaves the image unchanged.
     */
    brightness: number;

    /**
     * Contrast multiplier. 1 leaves the image unchanged.
     */
    contrast: number;

    /**
     * Gamma adjustment. Values below 1 darken midtones and
     * values above 1 lighten them.
     */
    gamma: number;

    /**
     * Uneven illumination across the sheet from 0 to 1.
     */
    unevenness: number;

    /**
     * Highlight clipping from 0 to 1. Higher values turn more
     * bright areas pure white.
     */
    blownHighlights: number;

    /**
     * Shadow clipping from 0 to 1. Higher values turn more dark
     * areas pure black.
     */
    crushedShadows: number;
  };

  ink: {
    /**
     * Expansion of dark marks from 0 to 1.
     */
    spread: number;

    /**
     * Contraction of dark marks from 0 to 1.
     */
    erosion: number;

    /**
     * Softening of dark marks from 0 to 1.
     */
    blur: number;
  };

  tone: {
    /**
     * Tone reduction mode.
     */
    mode: ToneMode;

    /**
     * Number of gray levels from 2 to 256 in quantized mode.
     */
    levels: number;

    /**
     * Bitonal threshold from 0 to 1.
     * Higher values produce more black.
     */
    threshold: number;

    /**
     * Dither pattern applied before tone reduction.
     */
    dither: DitherMode;

    /**
     * Dither strength from 0 to 1.
     */
    ditherAmount: number;
  };

  artifacts: {
    /**
     * Amount of photographic grain from 0 to 1.
     */
    grain: number;

    /**
     * Density of dust specks from 0 to 1.
     */
    dust: number;

    /**
     * Density of scratches from 0 to 1.
     */
    scratches: number;

    /**
     * Amount of ink bleeding through from the reverse side,
     * from 0 to 1.
     */
    bleedThrough: number;

    /**
     * Ghost of the reverse side showing through
     * the sheet, from 0 to 1.
     */
    shineThrough: number;

    /**
     * Density of vertical copy streaks from 0 to 1.
     */
    verticalStreaks: number;

    /**
     * Amount of horizontal banding from 0 to 1.
     */
    horizontalBands: number;

    /**
     * Noise along the sheet edges from 0 to 1.
     */
    edgeNoise: number;
  };

  capture: {
    /**
     * Convert the content to grayscale before tone treatment.
     */
    grayscale: boolean;

    /**
     * Fixed page rotation in degrees.
     */
    rotation: number;

    /**
     * Perspective or keystone distortion from 0 to 1.
     */
    perspective: number;

    /**
     * Seeded random rotation jitter from 0 to 1.
     * Adds a small random misalignment on top of the
     * fixed rotation, different for every seed.
     */
    rotationJitter: number;
  };

  border: {
    /**
     * Whether to draw the copier frame around the sheet.
     */
    enabled: boolean;

    /**
     * Frame darkness from 0 to 1.
     */
    darkness: number;

    /**
     * Frame thickness in pixels.
     */
    thickness: number;

    /**
     * Irregularity of the frame edges from 0 to 1.
     */
    roughness: number;

    /**
     * Which sides of the sheet receive the frame.
     * Spreads suppress the binding side so that
     * facing pages meet at the spine.
     */
    sides: {
      top: boolean;
      right: boolean;
      bottom: boolean;
      left: boolean;
    };
  };
}

/**
 * Partial settings stored in a named preset.
 *
 * A preset may inherit from another preset through `extends`.
 */
export type PresetDefinition = DeepPartial<ScanSettings> & {
  extends?: string;
};

/**
 * Mapping of preset names to preset definitions.
 */
export type PresetMap = Record<string, PresetDefinition>;

/**
 * Options for creating a single archive page.
 */
export interface CourseReaderPageOptions {
  /**
   * Name of the preset to resolve. Defaults to `"clean"`.
   */
  preset?: string;

  /**
   * Settings merged over the resolved preset.
   */
  overrides?: DeepPartial<ScanSettings>;

  /**
   * Seed for deterministic noise, artifacts, jitter and the
   * placement of exposure falloff, show-through pattern, noise
   * tiles and edge shadows.
   */
  seed?: string | number;

  /**
   * Custom preset registry. Defaults to the global `presets`.
   */
  registry?: PresetRegistry;

  /**
   * "auto" uses SVG filters where supported and otherwise falls back to CSS.
   * "svg" requests SVG filters.
   * "css" forces the basic HTML/CSS fallback.
   */
  enhancement?: "auto" | "svg" | "css";
}

/**
 * Handle returned by `createCourseReaderPage`.
 */
export interface CourseReaderPage {
  /**
   * Wrapper element inserted into the document.
   */
  readonly element: HTMLDivElement;

  /**
   * Original source element, now inside the wrapper.
   */
  readonly content: HTMLElement;

  /**
   * Resolved settings currently applied to the page.
   */
  readonly settings: ScanSettings;

  /**
   * Merges overrides into the current settings and re-renders.
   */
  update(overrides: DeepPartial<ScanSettings>): void;

  /**
   * Removes the wrapper and restores the original element.
   */
  destroy(): void;
}

/**
 * Appearance of a scanned book gutter.
 */
export interface GutterOptions {
  /**
   * Gutter width in pixels.
   */
  width: number;

  /**
   * Shadow darkness from 0 to 1.
   */
  darkness: number;

  /**
   * Shadow blur in pixels.
   */
  blur: number;

  /**
   * Curvature of the gutter gradient from 0 to 1.
   */
  curvature: number;

  /**
   * Highlight strength along the gutter from 0 to 1.
   */
  highlight: number;
}

/**
 * Responsive behavior for a viewer.
 *
 * The first layout whose `query` matches the viewport is used.
 */
export interface ResponsiveLayout {
  /**
   * Media query that activates this layout.
   */
  query: string;

  /**
   * Show one page or a facing-page spread.
   */
  mode: "single" | "spread";

  /**
   * How pages fill the available space. Defaults to `"contain"`.
   */
  pageFit?: "width" | "height" | "contain";

  /**
   * Gap between pages in spread mode, in pixels.
   */
  gap?: number;

  /**
   * CSS background for the viewer area.
   */
  background?: string;

  /**
   * Gutter style: `false` disables the gutter, a string selects a
   * registered binding style, and an object overrides the `subtle`
   * built-in style.
   */
  gutter?: false | string | DeepPartial<GutterOptions>;

  spread?: {
    /**
     * Which side the first page sits on. With the default `"left"`
     * pages pair sequentially (1-2, 3-4, 5-6, …) so every spread is
     * full. With `"right"` the first page sits alone on the right
     * like a book cover, then pages pair (2-3, 4-5, …).
     */
    firstPageSide?: "left" | "right";
  };
}

/**
 * Options for creating a multi-page archive viewer.
 */
export interface CourseReaderViewerOptions {
  /**
   * Page elements or selectors, in reading order.
   */
  pages: Array<HTMLElement | string>;

  /**
   * Preset name applied to every page.
   */
  preset?: string;

  /**
   * Settings overrides applied to every page.
   */
  overrides?: DeepPartial<ScanSettings>;

  /**
   * Base seed. The page index is appended to keep pages distinct.
   */
  seed?: string | number;

  /**
   * Zero-based index of the initially visible page. Defaults to 0.
   */
  initialPage?: number;

  /**
   * Stack every seat below the previous one instead of showing a
   * single page or spread. Single layouts stack the pages, spread
   * layouts stack the paired rows. Navigation scrolls through the
   * stack. Defaults to `false`.
   */
  continuous?: boolean;

  /**
   * Enhancement strategy used for every page.
   */
  enhancement?: "auto" | "svg" | "css";

  /**
   * Number of sheets stacked per side of the spine. Scales the
   * spine curl and the fore-edge page blocks the same way the
   * playground desk does. Defaults to the original look
   * (curl 24px, block depth 11px).
   */
  spinePages?: number;

  /**
   * Ordered responsive layouts. The first matching query wins.
   */
  layouts: ResponsiveLayout[];

  /**
   * Custom preset registry. Defaults to the global `presets`.
   */
  registry?: PresetRegistry;

  /**
   * Custom gutter style registry. Defaults to the global `bindings`.
   */
  bindingRegistry?: BindingRegistry;
}

/**
 * Handle returned by `createCourseReaderViewer`.
 */
export interface CourseReaderViewer {
  /**
   * Viewer wrapper element.
   */
  readonly element: HTMLDivElement;

  /**
   * Number of pages in the viewer.
   */
  readonly pageCount: number;

  /**
   * Returns the zero-based index of the current page.
   */
  getPage(): number;

  /**
   * Navigates to a zero-based page index. The index is clamped to
   * the valid range.
   */
  goTo(index: number): Promise<void>;

  /**
   * Advances by one page in single mode or two pages in spread mode.
   */
  next(): Promise<void>;

  /**
   * Moves back by one page in single mode or two pages in spread mode.
   */
  previous(): Promise<void>;

  /**
   * Re-applies the current layout and binding after external changes.
   */
  refresh(): Promise<void>;

  /**
   * Tears down the pages and media-query listeners and removes the viewer.
   */
  destroy(): void;
}
