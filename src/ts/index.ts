/* ==========================================================================
 * CourseReader
 *
 * Dependency-free live-DOM renderer.
 *
 * - Preserves selectable text, links, controls, images and accessibility.
 * - Uses HTML, CSS and inline SVG filters.
 * - Provides a CSS fallback when SVG filters are unavailable.
 * - Keeps rendering, presets and bindings in separate modules.
 * ========================================================================== */

export * from "./types.js";
export * from "./presets.js";
export * from "./bindings.js";
export * from "./book.js";
export { createToneFilter, createToneTable } from "./filters.js";
export * from "./page.js";
export * from "./viewer.js";
export * from "./playground.js";
