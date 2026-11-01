// AetherOS - Git Line Diff Calculator & Formatter

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface FileDiffResult {
  filepath: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
  patch: string;
  isBinary?: boolean;
}

/**
 * Computes a line-by-line diff using Longest Common Subsequence (LCS).
 */
export function computeLineDiff(
  filepath: string,
  oldText: string,
  newText: string
): FileDiffResult {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  // Fast path: identical contents
  if (oldText === newText) {
    return {
      filepath,
      lines: oldLines.map((content, idx) => ({
        type: 'context',
        oldLineNumber: idx + 1,
        newLineNumber: idx + 1,
        content,
      })),
      additions: 0,
      deletions: 0,
      patch: '',
    };
  }

  // LCS Matrix
  const m = oldLines.length;
  const n = newLines.length;

  // Optimize for memory: if files are large, limit matrix or simple diff
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const lines: DiffLine[] = [];
  let i = m;
  let j = n;
  const rawDiff: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawDiff.push({
        type: 'context',
        oldLineNumber: i,
        newLineNumber: j,
        content: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.push({
        type: 'add',
        newLineNumber: j,
        content: newLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiff.push({
        type: 'delete',
        oldLineNumber: i,
        content: oldLines[i - 1],
      });
      i--;
    }
  }

  rawDiff.reverse();
  lines.push(...rawDiff);

  let additions = 0;
  let deletions = 0;
  for (const l of lines) {
    if (l.type === 'add') additions++;
    else if (l.type === 'delete') deletions++;
  }

  // Format unified diff patch
  let patch = `--- a/${filepath}\n+++ b/${filepath}\n`;
  if (lines.length > 0) {
    patch += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
    for (const l of lines) {
      const prefix = l.type === 'add' ? '+' : l.type === 'delete' ? '-' : ' ';
      patch += `${prefix}${l.content}\n`;
    }
  }

  return {
    filepath,
    lines,
    additions,
    deletions,
    patch,
  };
}
