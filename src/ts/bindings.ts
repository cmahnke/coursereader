/* ==========================================================================
 * Built-in binding (gutter) styles
 * ========================================================================== */

import { Registry } from "./registry.js";
import type { GutterOptions } from "./types.js";

/**
 * Built-in gutter styles for spread layouts.
 */
export const builtInBindings: Record<string, GutterOptions> = {
  /**
   * Soft, narrow gutter suitable for lightly bound pages.
   */
  subtle: {
    width: 18,
    darkness: 0.28,
    blur: 10,
    curvature: 0.14,
    highlight: 0.06,
  },

  /**
   * Pronounced gutter for a typical bound volume.
   */
  "bound-volume": {
    width: 32,
    darkness: 0.58,
    blur: 13,
    curvature: 0.46,
    highlight: 0.1,
  },

  /**
   * Deep, dark gutter for thick tightly bound volumes.
   */
  "deep-bound-volume": {
    width: 48,
    darkness: 0.82,
    blur: 16,
    curvature: 0.72,
    highlight: 0.15,
  },
};

/* ==========================================================================
 * Binding registry
 * ========================================================================== */

/**
 * Registry of named gutter styles.
 */
export class BindingRegistry extends Registry<GutterOptions> {
  /**
   * @param initial - Definitions loaded into the registry.
   */
  constructor(initial: Record<string, GutterOptions> = {}) {
    super("Binding style", false);

    this.load(initial);
  }
}

/**
 * Global gutter style registry preloaded with the built-in styles.
 */
export const bindings = new BindingRegistry(builtInBindings);
