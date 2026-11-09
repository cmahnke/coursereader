/* ==========================================================================
 * Generic definition registry — internal base for the preset and
 * binding registries.
 * ========================================================================== */

import type { DeepPartial } from "./types.js";
import { clone, deepMerge } from "./utils.js";

/**
 * Named store of configuration definitions.
 *
 * Serves as the base class for the preset and binding registries.
 * Definitions are cloned on the way in and out so callers cannot
 * mutate registry state by reference.
 */
export class Registry<T> {
  private readonly definitions = new Map<string, T>();

  /**
   * @param label - Human-readable name used in error messages.
   * @param requireName - Whether empty definition names are rejected.
   */
  constructor(
    private readonly label: string,
    private readonly requireName: boolean,
  ) {}

  protected load(initial: Record<string, T>): void {
    for (const [name, definition] of Object.entries(initial)) {
      this.set(name, definition);
    }
  }

  /**
   * Registers a new definition.
   *
   * @param name - Unique definition name.
   * @param definition - Definition to store.
   * @throws {Error} When the name already exists.
   */
  define(name: string, definition: T): void {
    if (this.definitions.has(name)) {
      throw new Error(`${this.label} "${name}" already exists.`);
    }

    this.set(name, definition);
  }

  /**
   * Stores or replaces a definition.
   *
   * @param name - Unique definition name.
   * @param definition - Definition to store.
   * @throws {Error} When empty names are not allowed and `name` is blank.
   */
  set(name: string, definition: T): void {
    if (this.requireName && !name.trim()) {
      throw new Error(`${this.label} names may not be empty.`);
    }

    this.definitions.set(name, clone(definition));
  }

  /**
   * Merges changes into an existing definition.
   *
   * @param name - Name of the definition to update.
   * @param changes - Partial definition merged over the current value.
   * @throws {Error} When the definition does not exist.
   */
  update(name: string, changes: DeepPartial<T>): void {
    this.set(name, deepMerge(this.get(name), changes));
  }

  /**
   * Returns a copy of a definition.
   *
   * @param name - Name of the definition to read.
   * @throws {Error} When the definition does not exist.
   */
  get(name: string): T {
    const value = this.definitions.get(name);

    if (!value) {
      throw new Error(`Unknown ${this.label.toLowerCase()} "${name}".`);
    }

    return clone(value);
  }

  /**
   * Checks whether a definition is registered.
   */
  has(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Returns all registered definition names.
   */
  names(): string[] {
    return [...this.definitions.keys()];
  }

  /**
   * Removes a definition.
   *
   * @returns `true` when the definition existed.
   */
  remove(name: string): boolean {
    return this.definitions.delete(name);
  }
}
