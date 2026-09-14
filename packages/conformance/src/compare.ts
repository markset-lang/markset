/**
 * Structural comparison for expected-vs-actual values. Object key order is
 * ignored; array order is significant. Returns a description of the first
 * difference found, or null when the values are equivalent.
 */
export function firstDifference(expected: unknown, actual: unknown, path = "$"): string | null {
  if (expected === actual) return null;

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return `${path}: expected ${show(expected)}, got ${show(actual)}`;
    }
    if (expected.length !== actual.length) {
      return `${path}: expected ${expected.length} item(s), got ${actual.length}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const diff = firstDifference(expected[i], actual[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) return `${path}.${key}: expected ${show(expected[key])}, got <absent>`;
      const diff = firstDifference(expected[key], actual[key], `${path}.${key}`);
      if (diff) return diff;
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) return `${path}.${key}: unexpected ${show(actual[key])}`;
    }
    return null;
  }

  return `${path}: expected ${show(expected)}, got ${show(actual)}`;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return firstDifference(a, b) === null;
}

/** Order-insensitive multiset comparison of diagnostic codes. */
export function sameCodes(expected: string[], actual: string[]): boolean {
  return JSON.stringify([...expected].sort()) === JSON.stringify([...actual].sort());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value: unknown): string {
  if (value === undefined) return "<absent>";
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
