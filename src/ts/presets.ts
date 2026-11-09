/* ==========================================================================
 * Defaults and built-in presets
 * ========================================================================== */

import { Registry } from "./registry.js";
import type {
  DeepPartial,
  PresetDefinition,
  PresetMap,
  ScanSettings,
} from "./types.js";
import { deepMerge } from "./utils.js";

/**
 * Baseline settings used when a preset does not override a value.
 */
export const defaultSettings: ScanSettings = {
  paper: {
    tone: 0.97,
    texture: 0.04,
  },

  exposure: {
    brightness: 1,
    contrast: 1,
    gamma: 1,
    unevenness: 0,
    blownHighlights: 0,
    crushedShadows: 0,
  },

  ink: {
    spread: 0,
    erosion: 0,
    blur: 0,
  },

  tone: {
    mode: "continuous",
    levels: 256,
    threshold: 0.55,
    dither: "none",
    ditherAmount: 0,
  },

  artifacts: {
    grain: 0,
    dust: 0,
    scratches: 0,
    bleedThrough: 0,
    shineThrough: 0,
    verticalStreaks: 0,
    horizontalBands: 0,
    edgeNoise: 0,
  },

  capture: {
    grayscale: true,
    rotation: 0,
    perspective: 0,
    rotationJitter: 0,
  },

  border: {
    enabled: false,
    darkness: 0.9,
    thickness: 24,
    roughness: 0.25,
    sides: {
      top: true,
      right: true,
      bottom: true,
      left: true,
    },
  },
};

/**
 * Built-in scan presets.
 *
 * These presets contain only scan and reproduction properties.
 *
 * They deliberately do not contain gutters, facing-page layout, page gaps,
 * mobile behavior or desktop behavior.
 */
export const builtInPresets: PresetMap = {
  /**
   * Neutral defaults with no visible degradation.
   */
  clean: {},

  /**
   * Photographed book page with mild rotation, perspective and
   * uneven illumination.
   */
  "book-photo": {
    paper: {
      tone: 0.96,
      texture: 0.09,
    },

    exposure: {
      brightness: 1.02,
      contrast: 0.96,
      gamma: 1.02,
      unevenness: 0.18,
      blownHighlights: 0.04,
      crushedShadows: 0.02,
    },

    artifacts: {
      grain: 0.025,
      dust: 0.025,
      scratches: 0.01,
      bleedThrough: 0.02,
      shineThrough: 0.15,
      verticalStreaks: 0,
      horizontalBands: 0,
      edgeNoise: 0.04,
    },

    capture: {
      grayscale: true,
      rotation: 0.08,
      perspective: 0.04,
      rotationJitter: 0.3,
    },
  },

  /**
   * Book photo variant with slightly higher contrast and edge wear.
   */
  "bound-volume": {
    extends: "book-photo",

    exposure: {
      contrast: 1.03,
      unevenness: 0.13,
    },

    artifacts: {
      grain: 0.035,
      dust: 0.04,
      edgeNoise: 0.1,
    },
  },

  /**
   * Microfilm scan with heavy grain, scratches, streaks and a
   * dark frame.
   */
  "microfilm-journal": {
    paper: {
      tone: 0.91,
      texture: 0.22,
    },

    exposure: {
      brightness: 1.06,
      contrast: 1.3,
      gamma: 0.94,
      unevenness: 0.4,
      blownHighlights: 0.2,
      crushedShadows: 0.32,
    },

    ink: {
      spread: 0.22,
      erosion: 0.04,
      blur: 0.1,
    },

    tone: {
      mode: "continuous",
      levels: 256,
      threshold: 0.55,
      dither: "random",
      ditherAmount: 0.05,
    },

    artifacts: {
      grain: 0.09,
      dust: 0.24,
      scratches: 0.38,
      bleedThrough: 0.15,
      shineThrough: 0.35,
      verticalStreaks: 0.72,
      horizontalBands: 0.08,
      edgeNoise: 0.7,
    },

    capture: {
      grayscale: true,
      rotation: -0.14,
      perspective: 0.02,
      rotationJitter: 0.55,
    },

    border: {
      enabled: true,
      darkness: 0.94,
      thickness: 38,
      roughness: 0.72,
    },
  },

  /**
   * A deliberately harsh, two-tone office-copy appearance.
   *
   * This is an aesthetic approximation. Historical analog xerographic
   * copies were not necessarily literal digital one-bit images.
   */
  "early-office-bitonal": {
    paper: {
      tone: 1,
      texture: 0.07,
    },

    exposure: {
      brightness: 1.02,
      contrast: 1.58,
      gamma: 0.9,
      unevenness: 0.15,
      blownHighlights: 0.24,
      crushedShadows: 0.42,
    },

    ink: {
      spread: 0.38,
      erosion: 0.05,
      blur: 0.03,
    },

    tone: {
      mode: "bitonal",
      levels: 2,
      threshold: 0.61,
      dither: "random",
      ditherAmount: 0.1,
    },

    artifacts: {
      grain: 0.063,
      dust: 0.11,
      scratches: 0.05,
      bleedThrough: 0.025,
      shineThrough: 0.22,
      verticalStreaks: 0.07,
      horizontalBands: 0.035,
      edgeNoise: 0.22,
    },

    capture: {
      grayscale: true,
      rotation: 0.04,
      perspective: 0,
      rotationJitter: 0.45,
    },
  },

  /**
   * Harsher bitonal variant with stronger ink spread and a worn frame.
   */
  "xerox-zine": {
    extends: "early-office-bitonal",

    exposure: {
      contrast: 1.9,
      unevenness: 0.22,
      blownHighlights: 0.34,
      crushedShadows: 0.58,
    },

    ink: {
      spread: 0.62,
      erosion: 0.09,
      blur: 0.025,
    },

    tone: {
      threshold: 0.64,
      ditherAmount: 0.16,
    },

    artifacts: {
      grain: 0.076,
      dust: 0.2,
      scratches: 0.12,
      shineThrough: 0.3,
      edgeNoise: 0.46,
    },

    border: {
      enabled: true,
      darkness: 1,
      thickness: 20,
      roughness: 0.86,
    },
  },

  /**
   * Quantized eight-level analog office-copy appearance.
   */
  "analog-gray-copy": {
    paper: {
      tone: 0.98,
      texture: 0.08,
    },

    exposure: {
      brightness: 1.01,
      contrast: 1.2,
      gamma: 0.96,
      unevenness: 0.12,
      blownHighlights: 0.1,
      crushedShadows: 0.14,
    },

    ink: {
      spread: 0.14,
      erosion: 0.025,
      blur: 0.07,
    },

    tone: {
      mode: "quantized",
      levels: 8,
      threshold: 0.55,
      dither: "random",
      ditherAmount: 0.32,
    },

    artifacts: {
      grain: 0.05,
      dust: 0.05,
      scratches: 0.015,
      bleedThrough: 0.02,
      shineThrough: 0.12,
      verticalStreaks: 0.025,
      horizontalBands: 0.02,
      edgeNoise: 0.09,
    },

    capture: {
      grayscale: true,
      rotation: 0,
      perspective: 0,
      rotationJitter: 0.3,
    },
  },

  /**
   * Cleaner 32-level digital copier appearance.
   */
  "digital-gray-copy": {
    paper: {
      tone: 0.99,
      texture: 0.02,
    },

    exposure: {
      brightness: 1,
      contrast: 1.08,
      gamma: 1,
      unevenness: 0.035,
      blownHighlights: 0.04,
      crushedShadows: 0.06,
    },

    ink: {
      spread: 0.05,
      erosion: 0.01,
      blur: 0.02,
    },

    tone: {
      mode: "quantized",
      levels: 32,
      threshold: 0.55,
      dither: "random",
      ditherAmount: 0.16,
    },

    artifacts: {
      grain: 0.016,
      dust: 0.008,
      scratches: 0,
      bleedThrough: 0,
      shineThrough: 0.04,
      verticalStreaks: 0.008,
      horizontalBands: 0.006,
      edgeNoise: 0.02,
    },

    capture: {
      grayscale: true,
      rotation: 0,
      perspective: 0,
      rotationJitter: 0.12,
    },
  },
};

/* ==========================================================================
 * Preset registry
 * ========================================================================== */

/**
 * Registry of named scan presets.
 *
 * Presets are plain serializable objects and may inherit from another
 * preset through `extends`.
 */
export class PresetRegistry extends Registry<PresetDefinition> {
  /**
   * @param initial - Definitions loaded into the registry.
   */
  constructor(initial: PresetMap = {}) {
    super("Preset", true);

    this.load(initial);
  }

  /**
   * Merges changes into an existing preset.
   *
   * @param name - Name of the preset to update.
   * @param changes - Partial preset merged over the current definition.
   * @throws {Error} When the preset does not exist.
   */
  override update(name: string, changes: PresetDefinition): void {
    super.update(name, changes);
  }

  /**
   * Loads presets from a JSON document over HTTP.
   *
   * The document is either a single preset definition — registered
   * under the supplied `name` — or a preset map of
   * `{ presetName: definition }` entries imported wholesale.
   *
   * @param url - URL of the JSON document.
   * @param name - Preset name for a single definition. Required
   * when the document is not a preset map.
   * @returns The registered preset names.
   * @throws {Error} When the fetch fails or the document shape
   * cannot be identified.
   *
   * @example
   * ```ts
   * // A map of presets: { "newsprint": { ... }, ... }
   * await presets.fromUrl("./presets/office.json");
   *
   * // A single definition: { "extends": "clean", ... }
   * await presets.fromUrl("./presets/newsprint.json", "newsprint");
   * ```
   */
  async fromUrl(url: string, name?: string): Promise<string[]> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to load presets from "${url}": ${response.status} ${response.statusText}.`,
      );
    }

    const definition = (await response.json()) as
      | PresetDefinition
      | PresetMap;

    if (typeof definition !== "object" || definition === null) {
      throw new Error(
        `The preset document "${url}" is not a JSON object.`,
      );
    }

    if (name) {
      this.set(name, definition);

      return [name];
    }

    const settingsKeys: ReadonlyArray<keyof ScanSettings | "extends"> = [
      "paper",
      "exposure",
      "ink",
      "tone",
      "artifacts",
      "capture",
      "border",
      "extends",
    ];

    const isSingleDefinition = settingsKeys.some(
      (key) => key in definition,
    );

    if (isSingleDefinition) {
      throw new Error(
        `The preset document "${url}" contains a single preset definition; pass a preset name to presets.fromUrl().`,
      );
    }

    this.import(definition as PresetMap);

    return Object.keys(definition);
  }

  /**
   * Registers every definition in a preset map.
   *
   * @param definitions - Presets to add or replace by name.
   */
  import(definitions: PresetMap): void {
    for (const [name, definition] of Object.entries(definitions)) {
      this.set(name, definition);
    }
  }

  /**
   * Returns one preset by name, or a map of all presets.
   *
   * @param name - Optional preset name.
   * @returns The requested preset or a map of every preset.
   */
  export(name?: string): PresetDefinition | PresetMap {
    if (name) {
      return this.get(name);
    }

    const result: PresetMap = {};

    for (const presetName of this.names()) {
      result[presetName] = this.get(presetName);
    }

    return result;
  }

  /**
   * Resolves a preset and its inheritance chain into complete settings.
   *
   * The resolved definition is merged over {@link defaultSettings}.
   *
   * @param name - Preset name to resolve. Defaults to `"clean"`.
   * @returns Complete scan settings.
   * @throws {Error} When the preset is unknown or its `extends` chain
   * is circular.
   */
  resolve(name = "clean"): ScanSettings {
    const stack = new Set<string>();

    const resolveDefinition = (
      presetName: string,
    ): DeepPartial<ScanSettings> => {
      if (stack.has(presetName)) {
        throw new Error(
          `Circular preset inheritance involving "${presetName}".`,
        );
      }

      stack.add(presetName);

      const definition = this.get(presetName);
      const parentName = definition.extends;
      const own = { ...definition };

      delete own.extends;

      let result: DeepPartial<ScanSettings>;

      if (parentName) {
        result = deepMerge(resolveDefinition(parentName), own);
      } else {
        result = own;
      }

      stack.delete(presetName);

      return result;
    };

    return deepMerge(defaultSettings, resolveDefinition(name));
  }
}

/**
 * Global preset registry preloaded with the built-in presets.
 */
export const presets = new PresetRegistry(builtInPresets);
