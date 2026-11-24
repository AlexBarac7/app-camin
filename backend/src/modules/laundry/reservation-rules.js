export const residenceZone = 'Europe/Bucharest';
const localClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: residenceZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const minute = 60_000;

export function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000')) return false;
  const date = new Date(day);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === day;
}

function parseInstant(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !validDay(value.slice(0, 10)) || value.slice(11, 13) > '23') return null;
  const instant = new Date(value);
  return Number.isFinite(+instant) ? instant : null;
}

export function reservationWindow(startValue, endValue, type, now) {
  const start = parseInstant(startValue);
  const end = parseInstant(endValue);
  if (!start || !end || start < now) return null;
  const [day, starts] = localClock.format(start).split(' ');
  const [endDay, ends] = localClock.format(end).split(' ');
  const dayOfWeek = new Date(day).getUTCDay();
  if (day !== endDay || dayOfWeek === 0 || dayOfWeek === 6 ||
      starts < '08:00:00' || ends > '20:00:00' ||
      Number(starts.slice(3, 5)) % 5 || Number(ends.slice(3, 5)) % 5) return null;

  // Compare local wall times so a daylight-saving change does not shift the booking horizon.
  const horizon = new Date(localClock.format(now).replace(' ', 'T') + 'Z');
  horizon.setUTCDate(horizon.getUTCDate() + 7);
  if (day + 'T' + starts > horizon.toISOString().slice(0, 19)) return null;

  const atClosing = ends === '20:00:00';
  const useEnd = new Date(+end - (atClosing ? 0 : 10 * minute));
  const maxMinutes = (type === 'washer' ? 180 : 240) + (atClosing ? 15 : 0);
  return useEnd > start && useEnd - start <= maxMinutes * minute ? useEnd : null;
}

export function occupiedBlock(row) {
  return { startsAt: row.starts_at, endsAt: row.ends_at };
}

export function calendarEntry(row, userId) {
  return {
    ...occupiedBlock(row),
    ...(row.user_id === userId && { id: row.id, useEndsAt: row.use_ends_at }),
  };
}

export function equipmentStatus(technicalStatus, current, now, inspectionReservationId) {
  if (technicalStatus === 'inspection' && current && current.id === inspectionReservationId &&
      current.starts_at <= now && now < current.use_ends_at) return 'occupied';
  if (technicalStatus !== 'working') return technicalStatus ?? 'unspecified';
  if (!current || now < current.starts_at || now >= current.ends_at) return 'available';
  return now < current.use_ends_at ? 'occupied' : 'handover';
}
