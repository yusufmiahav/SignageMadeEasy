// Lightweight page-count heuristic: scans the raw PDF bytes for page object markers
// rather than pulling in a full PDF parser. Good enough for the per-page duration the
// player needs; not a substitute for real PDF parsing if more is ever needed.
export function countPdfPages(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches && matches.length > 0 ? matches.length : 1;
}
