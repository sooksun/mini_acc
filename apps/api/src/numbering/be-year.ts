const BANGKOK_TZ = 'Asia/Bangkok';
const yearFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  timeZone: BANGKOK_TZ,
});

export function getBuddhistYear(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Number(yearFmt.format(d)) + 543;
}
