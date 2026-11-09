/* ==========================================================================
 * Shared test fixtures
 * ========================================================================== */

import { BindingRegistry, builtInBindings } from "../src/ts/bindings.js";
import { builtInPresets, PresetRegistry } from "../src/ts/presets.js";

/**
 * Creates an isolated preset registry holding copies of the built-in
 * presets, so tests never pollute the global registry singleton.
 */
export function freshPresetRegistry(): PresetRegistry {
  return new PresetRegistry(builtInPresets);
}

/**
 * Creates an isolated binding registry holding copies of the built-in
 * gutter styles.
 */
export function freshBindingRegistry(): BindingRegistry {
  return new BindingRegistry(builtInBindings);
}

/**
 * Appends a simple attached document element and returns it.
 */
export function sampleDocument(id: string): HTMLElement {
  const element = document.createElement("article");

  element.id = id;

  element.innerHTML = "<h1>Report</h1><p>Archival sample content.</p>";

  document.body.append(element);

  return element;
}

/**
 * Reads an inline CSS custom property from an element.
 */
export function customProperty(element: HTMLElement, name: string): string {
  return element.style.getPropertyValue(name);
}
