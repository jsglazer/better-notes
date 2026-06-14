/**
 * Pure line-based 3-way merge (diff3) for U2b sync auto-merge.
 *
 * Given the common ancestor (`base`) and two descendants (`mine` = the current
 * note, `theirs` = the current MD file), produce a merged text when the two
 * sides changed *disjoint* regions, and flag a conflict when they changed the
 * same region differently. Conflicts fall back to the manual diff dialog.
 *
 * No Zotero/DOM access → runs and is unit-tested in Node. Intentionally
 * line-oriented (Markdown notes are line documents) and conservative: anything
 * ambiguous is reported as a conflict rather than silently guessed.
 */

export { threeWayMerge };

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Longest common subsequence of two line arrays → matched index pairs
 * `[indexInA, indexInB]`, monotonically increasing in both.
 */
function lcsMatches(a: string[], b: string[]): Array<[number, number]> {
  const m = a.length;
  const n = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * Resolve one changed segment between two stable anchors. Returns the merged
 * lines, or `null` when both sides changed it differently (a conflict).
 */
function resolveSegment(
  baseSeg: string[],
  mineSeg: string[],
  theirsSeg: string[],
): string[] | null {
  if (arraysEqual(mineSeg, theirsSeg)) {
    return mineSeg; // both made the same change (or neither changed)
  }
  if (arraysEqual(mineSeg, baseSeg)) {
    return theirsSeg; // only theirs changed
  }
  if (arraysEqual(theirsSeg, baseSeg)) {
    return mineSeg; // only mine changed
  }
  return null; // both changed it, differently → conflict
}

/**
 * 3-way merge of `base` → (`mine`, `theirs`). `clean: true` means the result in
 * `text` is a safe automatic merge; `clean: false` means there was a real
 * conflict and the caller should fall back to manual resolution (`text` is then
 * undefined-quality and should be ignored).
 */
function threeWayMerge(
  base: string,
  mine: string,
  theirs: string,
): { clean: boolean; text: string } {
  // Fast paths.
  if (mine === theirs) {
    return { clean: true, text: mine };
  }
  if (base === mine) {
    return { clean: true, text: theirs };
  }
  if (base === theirs) {
    return { clean: true, text: mine };
  }

  const baseLines = base.split("\n");
  const mineLines = mine.split("\n");
  const theirsLines = theirs.split("\n");

  const anchorsA = new Map<number, number>(); // base index → mine index
  for (const [o, a] of lcsMatches(baseLines, mineLines)) {
    anchorsA.set(o, a);
  }
  const anchorsB = new Map<number, number>(); // base index → theirs index
  for (const [o, b] of lcsMatches(baseLines, theirsLines)) {
    anchorsB.set(o, b);
  }

  // Stable anchors: base lines preserved by BOTH sides (monotonic in o/a/b).
  const stable: Array<[number, number, number]> = [];
  for (let o = 0; o < baseLines.length; o++) {
    if (anchorsA.has(o) && anchorsB.has(o)) {
      stable.push([o, anchorsA.get(o)!, anchorsB.get(o)!]);
    }
  }

  const out: string[] = [];
  let conflict = false;
  let prevO = -1;
  let prevA = -1;
  let prevB = -1;

  const emitGap = (o: number, a: number, b: number) => {
    const baseSeg = baseLines.slice(prevO + 1, o);
    const mineSeg = mineLines.slice(prevA + 1, a);
    const theirsSeg = theirsLines.slice(prevB + 1, b);
    const merged = resolveSegment(baseSeg, mineSeg, theirsSeg);
    if (merged === null) {
      conflict = true;
    } else {
      out.push(...merged);
    }
  };

  for (const [o, a, b] of stable) {
    emitGap(o, a, b);
    out.push(baseLines[o]); // the stable anchor line itself
    prevO = o;
    prevA = a;
    prevB = b;
  }
  // Trailing gap after the last stable anchor.
  emitGap(baseLines.length, mineLines.length, theirsLines.length);

  if (conflict) {
    return { clean: false, text: "" };
  }
  return { clean: true, text: out.join("\n") };
}
