/* ==========================================================================
 * Live DOM page renderer
 * ========================================================================== */

import { buildContentFilter, buildSvgFilter } from "./filters.js";
import {
  createGrainAlphaTable,
  createNoiseImage,
  createTextureAlphaTable,
} from "./noise.js";
import { presets } from "./presets.js";
import { installStyles } from "./styles.js";
import type {
  CourseReaderPage,
  CourseReaderPageOptions,
  DeepPartial,
  ScanSettings,
} from "./types.js";
import {
  clamp,
  clone,
  createRandom,
  deepMerge,
  hashSeed,
  resolveElement,
  resolveNumericRanges,
  supportsSvgFilters,
} from "./utils.js";

let instanceCounter = 0;

function createOverlay(className: string): HTMLDivElement {
  const element = document.createElement("div");

  element.className = `archive-scan-overlay ${className}`;

  element.setAttribute("aria-hidden", "true");

  return element;
}

/**
 * Draws a signed offset around zero: `amount` scales the drift
 * and `span` is its full reach at amount 1.
 */
function seededDrift(
  random: () => number,
  amount: number,
  span: number,
): number {
  return (random() * 2 - 1) * amount * span;
}

function createArtifacts(
  settings: ScanSettings,
  random: () => number,
): HTMLDivElement {
  const container = document.createElement("div");

  container.className = "archive-scan-generated-artifacts";

  container.setAttribute("aria-hidden", "true");

  const dustCount = Math.floor(clamp(settings.artifacts.dust) * 80);

  for (let index = 0; index < dustCount; index += 1) {
    const dust = document.createElement("i");

    dust.className = "archive-scan-dust";

    dust.style.setProperty("--x", `${(random() * 100).toFixed(2)}%`);

    dust.style.setProperty("--y", `${(random() * 100).toFixed(2)}%`);

    dust.style.setProperty("--size", `${(0.7 + random() * 3.5).toFixed(2)}px`);

    dust.style.setProperty(
      "--opacity",
      `${(0.14 + random() * 0.6).toFixed(3)}`,
    );

    dust.style.setProperty("--blur", `${(random() * 0.6).toFixed(2)}px`);

    container.append(dust);
  }

  const scratchCount = Math.floor(clamp(settings.artifacts.scratches) * 16);

  for (let index = 0; index < scratchCount; index += 1) {
    const scratch = document.createElement("i");

    scratch.className = "archive-scan-scratch";

    scratch.style.setProperty("--x", `${(random() * 100).toFixed(2)}%`);

    scratch.style.setProperty("--y", `${(random() * 100).toFixed(2)}%`);

    scratch.style.setProperty(
      "--width",
      `${(0.4 + random() * 1.3).toFixed(2)}px`,
    );

    scratch.style.setProperty("--height", `${(5 + random() * 45).toFixed(2)}%`);

    scratch.style.setProperty(
      "--opacity",
      `${(0.08 + random() * settings.artifacts.scratches * 0.75).toFixed(3)}`,
    );

    scratch.style.setProperty(
      "--rotation",
      `${(-2 + random() * 4).toFixed(2)}deg`,
    );

    container.append(scratch);
  }

  const streakCount = Math.floor(
    clamp(settings.artifacts.verticalStreaks) * 18,
  );

  for (let index = 0; index < streakCount; index += 1) {
    const streak = document.createElement("i");

    streak.className = "archive-scan-streak";

    const useLeft = random() < 0.5;

    const position = useLeft ? random() * 10 : 90 + random() * 10;

    streak.style.setProperty("--x", `${position.toFixed(2)}%`);

    streak.style.setProperty(
      "--width",
      `${(0.5 + random() * 2.5).toFixed(2)}px`,
    );

    streak.style.setProperty(
      "--opacity",
      `${(
        settings.artifacts.verticalStreaks *
        (0.08 + random() * 0.45)
      ).toFixed(3)}`,
    );

    container.append(streak);
  }

  const bandCount = Math.floor(clamp(settings.artifacts.horizontalBands) * 10);

  for (let index = 0; index < bandCount; index += 1) {
    const band = document.createElement("i");

    band.className = "archive-scan-band";

    band.style.setProperty("--y", `${(random() * 100).toFixed(2)}%`);

    band.style.setProperty("--height", `${(0.5 + random() * 3).toFixed(2)}px`);

    band.style.setProperty(
      "--opacity",
      `${(
        settings.artifacts.horizontalBands *
        (0.05 + random() * 0.22)
      ).toFixed(3)}`,
    );

    container.append(band);
  }

  return container;
}

/* ==========================================================================
 * Show-through ghost
 * ========================================================================== */

function createShinethru(source: HTMLElement): HTMLDivElement {
  const ghost = document.createElement("div");

  ghost.className = "archive-scan-shinethru";

  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");

  const mirror = source.cloneNode(true) as HTMLElement;

  mirror.removeAttribute("id");
  mirror.style.background = "transparent";

  for (const element of mirror.querySelectorAll("[id]")) {
    element.removeAttribute("id");
  }

  ghost.append(mirror);

  return ghost;
}

/**
 * Wraps an attached element in a live archive-scan treatment.
 *
 * The original element stays in the document and remains selectable
 * and interactive. Call {@link CourseReaderPage.destroy} on the returned
 * handle to restore it.
 *
 * @param source - The element to wrap, or a selector for it.
 * @param options - Preset, overrides, seed and enhancement strategy.
 * @returns A handle for updating and destroying the effect.
 * @throws {Error} When the source cannot be found or is not attached.
 *
 * @example
 * ```ts
 * const page = createCourseReaderPage("#document", {
 *   preset: "microfilm-journal",
 *   seed: 1971,
 * });
 * ```
 */
export function createCourseReaderPage(
  source: HTMLElement | string,
  options: CourseReaderPageOptions = {},
): CourseReaderPage {
  installStyles();

  const content = resolveElement(source);
  const parent = content.parentNode;

  if (!parent) {
    throw new Error("The source element must be attached to the document.");
  }

  const registry = options.registry ?? presets;

  const presetName = options.preset ?? "clean";

  const seed = options.seed ?? `${presetName}:${instanceCounter}`;

  /*
   * Authored ranges in the preset and the overrides resolve here,
   * so the renderer always works with concrete numbers.
   */
  let settings = resolveNumericRanges(
    deepMerge(registry.resolve(presetName), options.overrides ?? {}),
    seed,
  );

  const random = createRandom(seed);

  const placeholder = document.createComment("archive-scan-original-position");

  parent.insertBefore(placeholder, content);

  const page = document.createElement("div");

  page.className = "archive-scan-page";

  const contentWrapper = document.createElement("div");

  contentWrapper.className = "archive-scan-content";

  const stage = document.createElement("div");

  stage.className = "archive-scan-stage";

  parent.insertBefore(page, content);

  const shinethru = createShinethru(content);

  contentWrapper.append(shinethru, content);
  stage.append(contentWrapper);
  page.append(stage);

  const texture = createOverlay("archive-scan-paper-texture");

  const exposure = createOverlay("archive-scan-exposure");

  const bleed = createOverlay("archive-scan-bleed");

  const grain = createOverlay("archive-scan-grain");

  const edge = createOverlay("archive-scan-edge");

  stage.append(texture, exposure, bleed, grain, edge);

  let artifacts = createArtifacts(settings, random);

  stage.append(artifacts);

  const id = `archive-scan-filter-${++instanceCounter}`;

  let svg: SVGSVGElement | null = null;
  let contentSvg: SVGSVGElement | null = null;
  let destroyed = false;

  const requestedEnhancement = options.enhancement ?? "auto";

  const enhancement =
    requestedEnhancement === "css"
      ? "css"
      : requestedEnhancement === "svg"
        ? "svg"
        : supportsSvgFilters()
          ? "svg"
          : "css";

  page.dataset.enhancement = enhancement;

  function render(): void {
    const paperValue = Math.round(clamp(settings.paper.tone) * 255);

    page.style.setProperty(
      "--archive-paper",
      `rgb(${paperValue}, ${paperValue}, ${paperValue})`,
    );

    page.style.setProperty(
      "--archive-texture",
      String(clamp(settings.paper.texture)),
    );

    page.style.setProperty(
      "--archive-texture-image",
      createNoiseImage(
        hashSeed(`${seed}:texture`) % 100000,
        0.35,
        3,
        createTextureAlphaTable(),
        260,
      ),
    );

    page.style.setProperty(
      "--archive-grain-image",
      createNoiseImage(
        hashSeed(`${seed}:grain`) % 100000,
        0.45,
        3,
        createGrainAlphaTable(clamp(settings.artifacts.grain)),
        320,
      ),
    );

    page.style.setProperty(
      "--archive-unevenness",
      String(clamp(settings.exposure.unevenness)),
    );

    page.style.setProperty(
      "--archive-bleed",
      String(clamp(settings.artifacts.bleedThrough)),
    );

    page.style.setProperty(
      "--archive-shinethru",
      String(clamp(settings.artifacts.shineThrough) * 0.38),
    );

    page.style.setProperty(
      "--archive-edge-noise",
      String(clamp(settings.artifacts.edgeNoise)),
    );

    /*
     * The seed also steers the geometry of the light falloff,
     * the show-through pattern, the noise tile alignment and
     * the sheet edge shadows, so pages with different seeds
     * diverge beyond the artifact specks. Every drift scales
     * with its effect's strength, keeping subtle presets
     * subtle; with the strength at zero the placement matches
     * the CSS fallbacks exactly.
     */
    const unevenRandom = createRandom(`${seed}:unevenness`);

    const unevenness = clamp(settings.exposure.unevenness);

    exposure.style.setProperty(
      "--archive-unevenness-x",
      `${(44 + seededDrift(unevenRandom, unevenness, 24)).toFixed(2)}%`,
    );

    exposure.style.setProperty(
      "--archive-unevenness-y",
      `${(37 + seededDrift(unevenRandom, unevenness, 18)).toFixed(2)}%`,
    );

    exposure.style.setProperty(
      "--archive-unevenness-angle-a",
      `${(96 + seededDrift(unevenRandom, unevenness, 30)).toFixed(2)}deg`,
    );

    exposure.style.setProperty(
      "--archive-unevenness-angle-b",
      `${seededDrift(unevenRandom, unevenness, 24).toFixed(2)}deg`,
    );

    const bleedRandom = createRandom(`${seed}:bleed`);

    const bleedThrough = clamp(settings.artifacts.bleedThrough);

    bleed.style.setProperty(
      "--archive-bleed-angle",
      `${(2 + seededDrift(bleedRandom, bleedThrough, 6)).toFixed(2)}deg`,
    );

    bleed.style.setProperty(
      "--archive-bleed-x",
      `${(63 + seededDrift(bleedRandom, bleedThrough, 18)).toFixed(2)}%`,
    );

    bleed.style.setProperty(
      "--archive-bleed-y",
      `${(24 + seededDrift(bleedRandom, bleedThrough, 14)).toFixed(2)}%`,
    );

    const offsetRandom = createRandom(`${seed}:offsets`);

    texture.style.setProperty(
      "--archive-texture-position",
      `${(offsetRandom() * 260).toFixed(1)}px ${(offsetRandom() * 260).toFixed(1)}px`,
    );

    grain.style.setProperty(
      "--archive-grain-position",
      `${(offsetRandom() * 320).toFixed(1)}px ${(offsetRandom() * 320).toFixed(1)}px`,
    );

    const edgeRandom = createRandom(`${seed}:edge`);

    const edgeNoise = clamp(settings.artifacts.edgeNoise);

    const edgeBlur = {
      left: 0.6 + seededDrift(edgeRandom, edgeNoise, 0.3),
      right: 0.6 + seededDrift(edgeRandom, edgeNoise, 0.3),
      top: 0.4 + seededDrift(edgeRandom, edgeNoise, 0.3),
      bottom: 0.4 + seededDrift(edgeRandom, edgeNoise, 0.3),
    };

    for (const [side, factor] of Object.entries(edgeBlur)) {
      edge.style.setProperty(`--archive-edge-blur-${side}`, factor.toFixed(3));
    }

    const borderOpacity = settings.border.enabled
      ? clamp(settings.border.darkness)
      : 0;

    const borderWidth = settings.border.enabled
      ? Math.max(0, settings.border.thickness)
      : 0;

    page.style.setProperty("--archive-border-darkness", String(borderOpacity));

    page.style.setProperty("--archive-border-width", `${borderWidth}px`);

    /*
     * The copier frame sits outside the sheet: the stage gains a
     * dark band around the content, representing the machine
     * background captured around the page. The seeded jitter makes
     * the band slightly uneven, the roughness softens the inner
     * edge where the sheet meets the glass.
     */
    const frameThickness = Math.max(0, settings.border.thickness);

    const frameActive = settings.border.enabled && frameThickness > 0;

    if (frameActive) {
      const frameRandom = createRandom(seed);
      const frameDarkness = clamp(settings.border.darkness);
      const frameValue = Math.round((1 - frameDarkness) * 255);

      const sideMask = [
        settings.border.sides.top,
        settings.border.sides.right,
        settings.border.sides.bottom,
        settings.border.sides.left,
      ];

      const sideThickness = [
        frameThickness * (0.82 + frameRandom() * 0.36),
        frameThickness * (0.82 + frameRandom() * 0.36),
        frameThickness * (0.82 + frameRandom() * 0.36),
        frameThickness * (0.82 + frameRandom() * 0.36),
      ].map((value, index) => (sideMask[index] ? value : 0));

      stage.style.padding = sideThickness
        .map((value) => `${value.toFixed(1)}px`)
        .join(" ");

      stage.style.background = `rgb(${frameValue}, ${frameValue}, ${frameValue})`;

      /*
       * Expose the frame band widths so applications can
       * align elements to the sheet edge rather than to
       * the scan window.
       */
      const frameSides = ["top", "right", "bottom", "left"] as const;

      for (const [index, side] of frameSides.entries()) {
        page.style.setProperty(
          `--archive-frame-${side}`,
          `${sideThickness[index].toFixed(1)}px`,
        );
      }

      const frameRoughness = clamp(settings.border.roughness);

      if (frameRoughness > 0) {
        contentWrapper.style.boxShadow = `inset 0 0 ${(frameRoughness * 16).toFixed(1)}px rgba(0, 0, 0, ${(frameDarkness * 0.55).toFixed(3)})`;
      } else {
        contentWrapper.style.removeProperty("box-shadow");
      }
    } else {
      stage.style.removeProperty("padding");

      stage.style.removeProperty("background");

      contentWrapper.style.removeProperty("box-shadow");

      for (const side of ["top", "right", "bottom", "left"] as const) {
        page.style.removeProperty(`--archive-frame-${side}`);
      }
    }

    page.style.setProperty(
      "--archive-grayscale",
      settings.capture.grayscale ? "1" : "0",
    );

    page.style.setProperty(
      "--archive-brightness",
      String(settings.exposure.brightness),
    );

    page.style.setProperty(
      "--archive-contrast",
      String(settings.exposure.contrast),
    );

    page.style.setProperty(
      "--archive-blur",
      `${clamp(settings.ink.blur) * 0.6}px`,
    );

    const transforms: string[] = [];

    if (settings.capture.perspective) {
      transforms.push("perspective(1200px)");
      transforms.push(`rotateY(${settings.capture.perspective}deg)`);
    }

    let rotation = settings.capture.rotation;

    const rotationJitter = clamp(settings.capture.rotationJitter);

    if (rotationJitter > 0) {
      const rotationRandom = createRandom(seed);

      rotation += (rotationRandom() * 2 - 1) * rotationJitter * 1.2;
    }

    if (rotation) {
      transforms.push(`rotate(${rotation.toFixed(3)}deg)`);
    }

    /*
     * Capture transforms apply to the sheet, never to the
     * copier frame: the frame is the fixed scan window, the
     * sheet is what lies slightly askew on the glass. When
     * no frame is present the sheet is the whole scan, so
     * the transforms stay on the page element.
     */
    const captureTransform = transforms.join(" ");

    if (frameActive) {
      page.style.removeProperty("transform");

      contentWrapper.style.transform = captureTransform;
    } else {
      contentWrapper.style.removeProperty("transform");

      page.style.transform = captureTransform;
    }

    /*
     * Expose the sheet's effective rotation so edge elements
     * (fore-edge stacks) can follow the tilt. Without a copier
     * frame the page itself already carries the rotation, so
     * the variable stays neutral there.
     */
    page.style.setProperty(
      "--archive-rotation",
      frameActive ? `${rotation.toFixed(3)}deg` : "0deg",
    );

    svg?.remove();
    svg = null;

    contentSvg?.remove();
    contentSvg = null;

    if (enhancement === "svg") {
      contentSvg = buildContentFilter(`${id}-content`, settings);
      svg = buildSvgFilter(id, settings, hashSeed(seed) % 10000);

      page.prepend(contentSvg, svg);

      contentWrapper.style.filter = `url("#${id}-content")`;
      stage.style.filter = `url("#${id}")`;
    } else {
      contentWrapper.style.removeProperty("filter");
      stage.style.removeProperty("filter");
    }

    artifacts.remove();

    artifacts = createArtifacts(settings, createRandom(seed));

    stage.append(artifacts);
  }

  render();

  return {
    element: page,
    content,
    get settings(): ScanSettings {
      return clone(settings);
    },

    update(overrides: DeepPartial<ScanSettings>): void {
      if (destroyed) {
        return;
      }

      settings = resolveNumericRanges(deepMerge(settings, overrides), seed);

      render();
    },

    destroy(): void {
      if (destroyed) {
        return;
      }

      destroyed = true;

      const originalParent = placeholder.parentNode;

      if (originalParent) {
        originalParent.insertBefore(content, placeholder);

        placeholder.remove();
      }

      page.remove();
    },
  };
}

/**
 * Alias for applications that prefer the library name.
 *
 * @see createCourseReaderPage
 */
export const courseReader = createCourseReaderPage;
