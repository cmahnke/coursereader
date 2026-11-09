/* ==========================================================================
 * Playground — a self-contained demo UI for the archive scan effects.
 *
 * `createPlayground(target)` renders the full UI (header, tabs,
 * control panel, sample desk and the multi-page viewer) into any
 * container and returns a handle with a destroy method.
 * ========================================================================== */

import { bindings } from "./bindings.js";
import { buildSvgFilter, createToneFilter } from "./filters.js";
import { archiveScan } from "./page.js";
import {
  SAMPLE_DOCUMENT,
  SAMPLE_DOCUMENT_RIGHT,
  VIEWER_PAGES,
} from "./playground-samples.js";
import { installPlaygroundStyles } from "./playground-styles.js";
import { presets } from "./presets.js";
import type {
  ArchivePage,
  ArchivePageOptions,
  ArchiveViewer,
  DeepPartial,
  ResponsiveLayout,
  ScanSettings,
} from "./types.js";
import { clamp, hashSeed, resolveElement } from "./utils.js";
import { createArchiveViewer } from "./viewer.js";

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
   * HTML for the viewer pages. Keep the ids "viewer-page-1"
   * through "viewer-page-4".
   */
  viewerPages?: string[];

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

const CUSTOM_BINDING = "demo-binding";

const VIEWER_PAGE_SELECTORS = [
  "#viewer-page-1",
  "#viewer-page-2",
  "#viewer-page-3",
  "#viewer-page-4",
];

const RING_FRAME_TOP = 72;

interface ViewerConfig {
  preset: string;
  seed: string | number;
  enhancement: ArchivePageOptions["enhancement"];
  overrides: DeepPartial<ScanSettings>;
}

interface PlaygroundShared {
  viewerConfig: ViewerConfig | null;
  refreshViewer: (() => void) | null;
  setViewerBinding: ((name: string) => void) | null;
  showViewerTab: (() => void) | null;
}

interface SliderDefinition {
  input: HTMLInputElement;
  output: HTMLOutputElement;
  read(settings: ScanSettings): number;
  apply(value: number): DeepPartial<ScanSettings>;
}

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
    <select id="control-binding-style" aria-label="Binding style">
      <option value="spine" selected>Spine shadow</option>
      <option value="subtle">subtle</option>
      <option value="bound-volume">bound-volume</option>
      <option value="deep-bound-volume">deep-bound-volume</option>
      <option value="demo-binding">demo-binding</option>
    </select>
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

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Contrast
        <button
          class="demo-info"
          type="button"
          aria-label="About contrast"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-contrast" type="range" min="0.5" max="2.5" step="0.05" />
      <output id="output-contrast">–</output>
      <span class="demo-popover" role="tooltip"
        >Pushes midtones toward black or white as part of the exposure
        curve, before tone reduction.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Gray levels
        <button
          class="demo-info"
          type="button"
          aria-label="About gray levels"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-levels" type="range" min="0" max="1" step="0.01" />
      <output id="output-levels">–</output>
      <span class="demo-popover" role="tooltip"
        >Limits the page to a fixed number of gray levels: 2 is pure
        black and white, 256 is effectively continuous. Moving it
        switches the page to quantized tone.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Threshold
        <button
          class="demo-info"
          type="button"
          aria-label="About threshold"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-threshold" type="range" min="0.3" max="0.9" step="0.01" />
      <output id="output-threshold">–</output>
      <span class="demo-popover" role="tooltip"
        >The black point of two-tone output: pixels below the threshold
        turn black, above it white. Higher values produce more black.
        Moving it switches the page to bitonal tone.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Ink spread
        <button
          class="demo-info"
          type="button"
          aria-label="About ink spread"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-ink-spread" type="range" min="0" max="1" step="0.02" />
      <output id="output-ink-spread">–</output>
      <span class="demo-popover" role="tooltip"
        >Thickens dark marks, as if the toner gained weight on a
        well-used copier.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Blur
        <button
          class="demo-info"
          type="button"
          aria-label="About blur"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-blur" type="range" min="0" max="1" step="0.02" />
      <output id="output-blur">–</output>
      <span class="demo-popover" role="tooltip"
        >Soft-focus blur applied to the inked sheet before tone
        reduction, as if the scanner lens were slightly out of focus.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Grain
        <button
          class="demo-info"
          type="button"
          aria-label="About grain"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-grain" type="range" min="0" max="1" step="0.02" />
      <output id="output-grain">–</output>
      <span class="demo-popover" role="tooltip"
        >Fine toner and paper noise across the sheet.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Dither amount
        <button
          class="demo-info"
          type="button"
          aria-label="About dither amount"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-dither" type="range" min="0" max="1" step="0.02" />
      <output id="output-dither">–</output>
      <span class="demo-popover" role="tooltip"
        >Random noise applied before tone reduction. It keeps detail
        alive in coarse gray levels.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Rotation — left page
        <button
          class="demo-info"
          type="button"
          aria-label="About left page rotation"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-rotation-left" type="range" min="0" max="1" step="0.02" />
      <output id="output-rotation-left">–</output>
      <span class="demo-popover" role="tooltip"
        >Seeded random misalignment of the left (verso) sheet. In
        facing-pages mode each page tilts independently of the
        other.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Rotation — right page
        <button
          class="demo-info"
          type="button"
          aria-label="About right page rotation"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-rotation-right" type="range" min="0" max="1" step="0.02" />
      <output id="output-rotation-right">–</output>
      <span class="demo-popover" role="tooltip"
        >Seeded random misalignment of the right (recto) sheet. In
        facing-pages mode each page tilts independently of the other;
        single-page mode follows the left setting.</span
      >
    </label>

    <label class="demo-slider">
      <span class="demo-slider-title"
        >Shine-through
        <button
          class="demo-info"
          type="button"
          aria-label="About shine-through"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-shinethru" type="range" min="0" max="1" step="0.02" />
      <output id="output-shinethru">–</output>
      <span class="demo-popover" role="tooltip"
        >Mirrored ghost of the reverse side of the page showing through
        the sheet.</span
      >
    </label>

    <label class="demo-slider demo-toggle">
      <span class="demo-slider-title"
        >Copier frame
        <button
          class="demo-info"
          type="button"
          aria-label="About the copier frame"
          aria-expanded="false"
        >
          i
        </button>
      </span>
      <input id="control-frame" type="checkbox" checked />
      <span class="demo-popover" role="tooltip"
        >The dark surround of the copier bed captured around the sheet.
        In spreads the binding side is suppressed so facing pages meet
        at the spine.</span
      >
    </label>

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
  </fieldset>

  <button id="control-destroy" type="button">Destroy effect</button>
  <button id="control-to-viewer" type="button">Show in viewer</button>

  <fieldset>
    <legend>Resolved settings</legend>
    <pre id="control-settings" aria-label="Resolved scan settings"></pre>
  </fieldset>
`;

const VIEWER_TOOLBAR_MARKUP = `
  <button id="viewer-previous" type="button">← Previous</button>
  <span id="viewer-indicator" aria-live="polite">1 / 4</span>
  <button id="viewer-next" type="button">Next →</button>
  <label class="demo-inline-label">
    Binding
    <select id="viewer-gutter" aria-label="Binding style">
      <option value="subtle">subtle</option>
      <option value="bound-volume">bound-volume</option>
      <option value="deep-bound-volume" selected>deep-bound-volume</option>
      <option value="demo-binding">demo-binding</option>
      <option value="ring-top">ring binder — top</option>
    </select>
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
          ${(options.viewerPages ?? VIEWER_PAGES).join("")}
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

  const bindingStyleSelect = document.querySelector<HTMLSelectElement>(
    "#control-binding-style",
  )!;

  const toViewerButton =
    document.querySelector<HTMLButtonElement>("#control-to-viewer")!;

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

  const desk = document.querySelector<HTMLDivElement>("#playground-desk")!;

  const parking = document.querySelector<HTMLDivElement>(
    "#sample-page-2-parking",
  )!;

  const firstSheet = document.querySelector<HTMLElement>("#sample-document")!;

  const secondSheet =
    document.querySelector<HTMLElement>("#sample-document-2")!;

  function requireSlider(
    inputId: string,
    outputId: string,
    read: (settings: ScanSettings) => number,
    apply: (value: number) => DeepPartial<ScanSettings>,
  ): SliderDefinition {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`)!;

    const output = document.querySelector<HTMLOutputElement>(`#${outputId}`)!;

    return { input, output, read, apply };
  }

  const sliders: SliderDefinition[] = [
    requireSlider(
      "control-contrast",
      "output-contrast",
      (settings) => settings.exposure.contrast,
      (value) => ({ exposure: { contrast: value } }),
    ),

    requireSlider(
      "control-levels",
      "output-levels",
      (settings) => positionFromLevels(settings.tone.levels),
      (value) => ({
        tone: {
          mode: "quantized",
          levels: levelsFromPosition(value),
        },
      }),
    ),

    requireSlider(
      "control-threshold",
      "output-threshold",
      (settings) => settings.tone.threshold,
      (value) => ({
        tone: {
          mode: "bitonal",
          threshold: value,
        },
      }),
    ),

    requireSlider(
      "control-ink-spread",
      "output-ink-spread",
      (settings) => settings.ink.spread,
      (value) => ({ ink: { spread: value } }),
    ),

    requireSlider(
      "control-blur",
      "output-blur",
      (settings) => settings.ink.blur,
      (value) => ({ ink: { blur: value } }),
    ),

    requireSlider(
      "control-grain",
      "output-grain",
      (settings) => settings.artifacts.grain,
      (value) => ({ artifacts: { grain: value } }),
    ),

    requireSlider(
      "control-dither",
      "output-dither",
      (settings) => settings.tone.ditherAmount,
      (value) => ({ tone: { ditherAmount: value } }),
    ),

    requireSlider(
      "control-rotation-left",
      "output-rotation-left",
      (settings) => settings.capture.rotationJitter,
      (value) => ({ capture: { rotationJitter: value } }),
    ),

    requireSlider(
      "control-rotation-right",
      "output-rotation-right",
      (settings) => settings.capture.rotationJitter,
      (value) => ({ capture: { rotationJitter: value } }),
    ),

    requireSlider(
      "control-shinethru",
      "output-shinethru",
      (settings) => settings.artifacts.shineThrough,
      (value) => ({ artifacts: { shineThrough: value } }),
    ),
  ];

  let pages: ArchivePage[] = [];

  let spreadElement: HTMLDivElement | null = null;

  let spreadToneSvg: SVGSVGElement | null = null;

  let bindingContainer: HTMLElement | null = null;

  let bindingSign = 0;

  /*
   * Rotation amounts while the pages are not locked, restored
   * when the ring binder is switched off again.
   */
  const unlockedJitter = { left: 0, right: 0 };

  function rotationSliderValue(id: string): number {
    const slider = sliders.find((entry) => entry.input.id === id);

    return slider ? Number(slider.input.value) : 0;
  }

  /*
   * In facing-pages mode the reproduction pipeline (dither and
   * tone reduction) runs once, globally, in the spread overlay.
   * The pages therefore render the optical pipeline only, and
   * this holds the tone settings the overlay applies.
   */
  let intendedTone: ScanSettings["tone"];

  function updateReadout(): void {
    settingsOutput.textContent = pages.length
      ? JSON.stringify(pages[0].settings, null, 2)
      : "// effect destroyed";
  }

  /*
   * Tone sliders report the intended tone in facing-pages
   * mode, because the pages themselves render continuously
   * and the spread overlay carries the tone settings.
   */
  function sliderValue(
    slider: SliderDefinition,
    settings: ScanSettings,
  ): number {
    if (layoutSelect.value !== "spread") {
      return slider.read(settings);
    }

    if (slider.input.id === "control-levels") {
      return positionFromLevels(intendedTone.levels);
    }

    if (slider.input.id === "control-threshold") {
      return intendedTone.threshold;
    }

    if (slider.input.id === "control-dither") {
      return intendedTone.ditherAmount;
    }

    return slider.read(settings);
  }

  function syncSliders(): void {
    if (!pages.length) {
      return;
    }

    const settings = pages[0].settings;

    frameToggle.checked = settings.border.enabled;

    for (const slider of sliders) {
      if (slider.input.id === "control-rotation-left") {
        if (!ringBinderToggle.checked) {
          slider.input.value = String(pages[0].settings.capture.rotationJitter);
        }
      } else if (slider.input.id === "control-rotation-right") {
        slider.input.disabled =
          layoutSelect.value !== "spread" || ringBinderToggle.checked;

        slider.input.value = String(
          layoutSelect.value === "spread" && pages.length > 1
            ? pages[1].settings.capture.rotationJitter
            : 0,
        );
      } else {
        slider.input.value = String(sliderValue(slider, settings));
      }

      slider.output.textContent =
        slider.input.id === "control-levels"
          ? String(levelsFromPosition(Number(slider.input.value)))
          : slider.input.value;
    }
  }

  function setOverridesDisabled(disabled: boolean): void {
    overridesFieldset.disabled = disabled;
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

    const leftHost = document.createElement("div");

    leftHost.className = "demo-sheet-host demo-sheet-verso";

    const rightHost = document.createElement("div");

    rightHost.className = "demo-sheet-host demo-sheet-recto";

    leftHost.append(firstSheet);
    rightHost.append(secondSheet);

    spread.append(leftHost, rightHost);

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
      { ...settings, tone: intendedTone },
      seedInput.value.trim() || presetSelect.value,
      "demo-spread-tone",
    );

    spreadElement.prepend(svg);

    spreadElement.style.filter = "url(#demo-spread-tone)";

    spreadToneSvg = svg;
  }

  /*
   * Ring binder chrome: the rail hangs above the sheets, and the
   * top frame band is removed so the holes punch through clean
   * paper. The spine curl stays — the binding is an addition to
   * the open book, not a replacement of it.
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

      container.append(binder);
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
      bindingContainer.classList.remove("ring-framed");

      clearBinderLayout(binder);

      return;
    }

    const pages = [
      ...bindingContainer.querySelectorAll<HTMLElement>(".archive-scan-page"),
    ];

    const framed = prepareRingFrame(pages);

    bindingContainer.classList.toggle("ring-framed", framed);

    const bounds = sheetBounds(bindingContainer);

    if (!bounds) {
      return;
    }

    positionBinder(binder, bounds);
  }

  /*
   * Ring-bound sheets are locked in alignment, so the per-page
   * rotation is disabled and the whole copy — pages and binding
   * together — carries one seeded tilt instead.
   */
  function applyBindingTilt(): void {
    if (!bindingContainer) {
      return;
    }

    if (!ringBinderToggle.checked) {
      bindingContainer.style.removeProperty("transform");

      return;
    }

    const angle =
      rotationSliderValue("control-rotation-left") * 1.2 * bindingSign;

    bindingContainer.style.transform = angle
      ? `rotate(${angle.toFixed(3)}deg)`
      : "";
  }

  /*
   * The viewer's binding styles drive the spine curl: width,
   * darkness and highlight come from the binding registry.
   */
  function applyBindingStyle(): void {
    if (!bindingContainer) {
      return;
    }

    const name = bindingStyleSelect.value;

    const variables = [
      "--demo-curl-half",
      "--demo-curl-edge",
      "--demo-curl-mid",
      "--demo-curl-core",
      "--demo-curl-light-1",
      "--demo-curl-light-2",
    ];

    if (name === "spine" || !bindings.has(name)) {
      for (const variable of variables) {
        bindingContainer.style.removeProperty(variable);
      }

      return;
    }

    const style = bindings.get(name);

    bindingContainer.style.setProperty(
      "--demo-curl-half",
      `${style.width / 2}px`,
    );

    bindingContainer.style.setProperty(
      "--demo-curl-edge",
      String(clamp(style.darkness * 0.36)),
    );

    bindingContainer.style.setProperty(
      "--demo-curl-mid",
      String(clamp(style.darkness)),
    );

    bindingContainer.style.setProperty(
      "--demo-curl-core",
      String(clamp(style.darkness * 1.07)),
    );

    bindingContainer.style.setProperty(
      "--demo-curl-light-1",
      String(clamp(style.highlight * 3.5)),
    );

    bindingContainer.style.setProperty(
      "--demo-curl-light-2",
      String(clamp(style.highlight * 1.6)),
    );
  }

  function createPages(): void {
    destroyPages();

    const preset = presetSelect.value;

    const seed = seedInput.value.trim() || preset;

    const enhancement =
      enhancementSelect.value as ArchivePageOptions["enhancement"];

    const resolved = presets.resolve(preset);

    intendedTone = resolved.tone;

    unlockedJitter.left = resolved.capture.rotationJitter;

    unlockedJitter.right = resolved.capture.rotationJitter;

    bindingSign = (hashSeed(`${seed}:binding`) / 4294967296) * 2 - 1;

    const ringTop = ringBinderToggle.checked;

    if (layoutSelect.value === "spread") {
      arrangeSpread();

      pages = [
        archiveScan(firstSheet, {
          preset,
          seed: `${seed}:verso`,
          enhancement,

          overrides: {
            capture: ringTop ? { rotation: 0, rotationJitter: 0 } : undefined,

            tone: {
              mode: "continuous",
              dither: "none",
              ditherAmount: 0,
            },

            border: {
              enabled: true,
              sides: {
                right: false,
                top: true,
              },
            },
          },
        }),

        archiveScan(secondSheet, {
          preset,
          seed: `${seed}:recto`,
          enhancement,

          overrides: {
            capture: ringTop ? { rotation: 0, rotationJitter: 0 } : undefined,

            tone: {
              mode: "continuous",
              dither: "none",
              ditherAmount: 0,
            },

            border: {
              enabled: true,
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
    } else {
      arrangeSingle();

      pages = [
        archiveScan(firstSheet, {
          preset,
          seed,
          enhancement,

          overrides: {
            capture: ringTop ? { rotation: 0, rotationJitter: 0 } : undefined,

            border: {
              enabled: true,
              sides: {
                left: !ringTop,
              },
            },
          },
        }),
      ];
    }

    applyBinding(ringTop);

    applyBindingStyle();

    applyBindingTilt();

    syncSliders();
    syncSpreadTone();
    updateReadout();
    setOverridesDisabled(false);
    destroyButton.textContent = "Destroy effect";
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

  bindingStyleSelect.addEventListener("change", () => applyBindingStyle());

  /*
   * Toggling the binder only touches the head frame, the page
   * rotation lock and the binding chrome — every other live
   * override survives.
   */
  ringBinderToggle.addEventListener("change", () => {
    const ringTop = ringBinderToggle.checked;

    const baseRotation = presets.resolve(presetSelect.value).capture.rotation;

    const sideUpdate =
      layoutSelect.value === "spread" ? { top: true } : { left: !ringTop };

    for (const [index, page] of pages.entries()) {
      page.update({
        border: { sides: sideUpdate },

        capture: ringTop
          ? { rotation: 0, rotationJitter: 0 }
          : {
              rotation: baseRotation,

              rotationJitter:
                index === 1 && layoutSelect.value === "spread"
                  ? unlockedJitter.right
                  : unlockedJitter.left,
            },
      });
    }

    applyBinding(ringTop);
    applyBindingTilt();
    syncSliders();
    updateReadout();
  });

  seedInput.addEventListener("change", () => createPages());

  seedRandomButton.addEventListener("click", () => {
    seedInput.value = Math.random().toString(36).slice(2, 10);

    createPages();
  });

  frameToggle.addEventListener("change", () => {
    for (const page of pages) {
      page.update({
        border: { enabled: frameToggle.checked },
      });
    }

    updateReadout();
    syncDeskBindingWidth();
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

  function applyToneSlider(id: string, value: number): void {
    if (id === "control-levels") {
      intendedTone = {
        ...intendedTone,
        mode: "quantized",
        levels: levelsFromPosition(value),
      };
    } else if (id === "control-threshold") {
      intendedTone = {
        ...intendedTone,
        mode: "bitonal",
        threshold: value,
      };
    } else if (id === "control-dither") {
      intendedTone = {
        ...intendedTone,
        dither: value > 0 ? "random" : intendedTone.dither,
        ditherAmount: value,
      };
    }
  }

  const toneSliderIds = new Set([
    "control-levels",
    "control-threshold",
    "control-dither",
  ]);

  for (const slider of sliders) {
    slider.input.addEventListener("input", () => {
      const value = Number(slider.input.value);

      slider.output.textContent =
        slider.input.id === "control-levels"
          ? String(levelsFromPosition(value))
          : slider.input.value;

      if (slider.input.id === "control-rotation-left") {
        if (ringBinderToggle.checked) {
          applyBindingTilt();
        } else {
          unlockedJitter.left = value;

          pages[0]?.update({
            capture: { rotationJitter: value },
          });
        }
      } else if (slider.input.id === "control-rotation-right") {
        if (layoutSelect.value === "spread" && !ringBinderToggle.checked) {
          unlockedJitter.right = value;

          pages[1]?.update({
            capture: { rotationJitter: value },
          });
        }
      } else if (
        layoutSelect.value === "spread" &&
        toneSliderIds.has(slider.input.id)
      ) {
        applyToneSlider(slider.input.id, value);
      } else {
        const overrides = slider.apply(value);

        for (const page of pages) {
          page.update(overrides);
        }
      }

      if (toneSliderIds.has(slider.input.id)) {
        syncSpreadTone();
      }

      updateReadout();
      syncDeskBindingWidth();
    });
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

      enhancement: enhancementSelect.value as ArchivePageOptions["enhancement"],

      overrides: {
        ...settings,

        tone: intendedTone,

        border: {
          ...settings.border,
          sides: { top: true, right: true, bottom: true, left: true },
        },
      },
    };

    const ring = ringBinderToggle.checked;

    const bindingStyle = bindingStyleSelect.value;

    shared.setViewerBinding?.(
      ring
        ? "ring-top"
        : bindingStyle === "spine"
          ? "deep-bound-volume"
          : bindingStyle,
    );

    shared.refreshViewer?.();
    shared.showViewerTab?.();
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

  const indicator = document.querySelector<HTMLElement>("#viewer-indicator")!;

  const gutterSelect =
    document.querySelector<HTMLSelectElement>("#viewer-gutter")!;

  let viewer: ArchiveViewer | null = null;

  function buildLayouts(gutter: string | false): ResponsiveLayout[] {
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
        gutter,
        background: "#222",

        spread: {
          firstPageSide: "right",
        },
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

    const ringTop = gutterSelect.value === "ring-top";

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

    viewer = createArchiveViewer("#reader", {
      pages: VIEWER_PAGE_SELECTORS,

      preset: config?.preset ?? "microfilm-journal",

      seed: config?.seed ?? 1971,

      enhancement: config?.enhancement,

      layouts: buildLayouts(ringTop ? false : gutterSelect.value),

      overrides,
    });

    viewer.element.classList.toggle("demo-ring-top", ringTop);

    if (ringTop) {
      const binder = document.createElement("div");

      binder.className = "demo-ring-binder";

      binder.setAttribute("aria-hidden", "true");

      /* The binding is part of the copy: same filter as the pages. */
      const settings = presets.resolve("microfilm-journal");

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
  }

  shared.refreshViewer = createViewer;

  shared.setViewerBinding = (name: string) => {
    gutterSelect.value = name;
  };

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

  gutterSelect.addEventListener("change", () => createViewer());

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

  if (!bindings.has(CUSTOM_BINDING)) {
    bindings.define(CUSTOM_BINDING, {
      width: 40,
      darkness: 0.72,
      blur: 14,
      curvature: 0.6,
      highlight: 0.12,
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
    refreshViewer: null,
    setViewerBinding: null,
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
