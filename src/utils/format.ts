export function formatRange(start: string, end: string): string {
  const sd = new Date(`${start}T00:00:00`);
  const ed = new Date(`${end}T00:00:00`);
  const shortOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const sStr = sd.toLocaleDateString(undefined, shortOpts);
  const eStr = ed.toLocaleDateString(undefined, sd.getMonth() === ed.getMonth() ? { day: 'numeric' } : shortOpts);
  return `${sStr}–${eStr}`;
}
