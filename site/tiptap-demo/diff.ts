/**
 * Which lines of the saved file differ from the file that was loaded. The demo
 * highlights these, so a reader sees the claim being kept as they type: only
 * the lines they touched change.
 */
export interface LineChanges {
  /** Indexes into the new file's lines that are not in the original. */
  changed: Set<number>;
  /** How many of the original's lines are gone. */
  removed: number;
}

export function lineChanges(before: string, after: string): LineChanges {
  const a = before.split("\n");
  const b = after.split("\n");
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const changed = new Set<number>();
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) {
      changed.add(j++);
    } else {
      removed++;
      i++;
    }
  }
  return { changed, removed };
}
