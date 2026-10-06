// বাংলাদেশ সময় (Asia/Dhaka) ভিত্তিক তারিখ সহায়ক
export const todayStr = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

export function addDays(str, n) {
  const d = new Date(str + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const monthStart = (str) => str.slice(0, 8) + '01';

export const rangeISO = (from, to) => ({
  start: `${from}T00:00:00+06:00`,
  end: `${to}T23:59:59.999+06:00`,
});

export function quickRange(kind) {
  const t = todayStr();
  if (kind === 'today') return [t, t];
  if (kind === 'week') return [addDays(t, -6), t];
  if (kind === 'month') return [monthStart(t), t];
  if (kind === 'lastMonth') {
    const end = addDays(monthStart(t), -1);
    return [monthStart(end), end];
  }
  return [t, t];
}
