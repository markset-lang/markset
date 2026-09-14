/** Remove `position` fields recursively so ASTs compare on structure alone (spec §7). */
export function stripPositions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPositions);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key !== "position") out[key] = stripPositions(item);
    }
    return out;
  }
  return value;
}
