/** One command of SVG path data: its letter and the numbers written after it. */
export interface PathDataCommand {
  type: string;
  values: number[];
}

const NUMBERS_PER_COMMAND: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

/**
 * Strict reader for the path data SVG export writes for glyph outlines: absolute
 * M/L/Q/C/Z commands, each followed by exactly the numbers it takes, as plain decimals
 * with a space between them.
 *
 * Anything else throws, just as an SVG renderer stops drawing at the first command it
 * cannot read. That covers a number written as `NaN`, and a number written without a
 * separator so that it runs into the one before it (`L74.200` for `L74.20 0`), which
 * leaves the command a number short.
 */
export function parsePathData(d: string): PathDataCommand[] {
  if (d.trim() === '') return [];

  // A command runs from its letter up to the next letter.
  return d
    .trim()
    .split(/(?=[A-Za-z])/)
    .map((chunk) => {
      const type = chunk[0];
      const expected = NUMBERS_PER_COMMAND[type];
      if (expected === undefined) {
        throw new Error(`Unexpected "${chunk.trim()}" in path data: ${excerpt(d, chunk)}`);
      }

      const text = chunk.slice(1).trim();
      const tokens = text === '' ? [] : text.split(/\s+/);
      for (const token of tokens) {
        if (!/^-?\d+(\.\d+)?$/.test(token)) {
          throw new Error(`Unreadable number "${token}" in path data: ${excerpt(d, chunk)}`);
        }
      }
      if (tokens.length !== expected) {
        throw new Error(
          `${type} takes ${expected} numbers but has ${tokens.length}: ${excerpt(d, chunk)}`,
        );
      }

      return { type, values: tokens.map(Number) };
    });
}

/** The part of `d` around `chunk`, so a failure shows where in a long path it happened. */
function excerpt(d: string, chunk: string): string {
  const at = d.indexOf(chunk);
  return `…${d.slice(Math.max(0, at - 30), at + chunk.length + 30)}…`;
}
