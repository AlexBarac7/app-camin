import { closingExtensionMinutes, handoverTime, maximumCycleMinutes, residenceZone } from './reservation-rules.js';

const minute = 60_000;
const offerTime = 5 * minute;
const localClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: residenceZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
});

export function queueDay(now) {
  const [day, time] = localClock.format(now).replace(',', '.').split(' ');
  const midnight = +new Date(day);
  const offset = +new Date(day + 'T' + time + 'Z') - +now;
  const weekday = ![0, 6].includes(new Date(midnight).getUTCDay());
  const opens = midnight - offset + 8 * 60 * minute;
  const closes = midnight - offset + 20 * 60 * minute;
  return { day, opens, closes, open: weekday && opens <= now && now < closes };
}

export function fitQueueOffer({ start, end }, minutes, type, now, closes) {
  const duration = minutes * minute;
  const maximum = maximumCycleMinutes(type);
  if (minutes <= maximum) {
    const limit = Math.min(end, closes - 1);
    const latestStart = limit - duration - handoverTime;
    if (start <= latestStart) {
      const immediate = start === now;
      // Protect enough time for the full cycle even if the resident starts near the deadline.
      const expiresAt = immediate ? Math.min(now + offerTime, latestStart) : Math.min(now + offerTime, start);
      if (expiresAt > now) {
        return { immediate, startsAt: start, endsAt: (immediate ? expiresAt : start) + duration + handoverTime, expiresAt };
      }
    }
  }
  const startsAt = closes - duration;
  if (end === closes && minutes <= maximum + closingExtensionMinutes && startsAt >= start) {
    const expiresAt = Math.min(now + offerTime, startsAt);
    if (expiresAt > now) return { immediate: false, startsAt, endsAt: closes, expiresAt };
  }
  return null;
}

export function queueOpenings(blocks, releases, now, closes) {
  const gaps = [];
  let cursor = now;
  const sorted = [...blocks, { starts_at: closes, ends_at: closes }].sort((a, b) => a.starts_at - b.starts_at);
  for (const block of sorted) {
    const boundary = Math.min(+block.starts_at, closes);
    if (cursor < boundary) {
      // Future gaps join the queue flow when a previously held interval is released.
      const released = releases.find(release => +release.starts_at < boundary && +release.ends_at > cursor);
      if (cursor === now || released) {
        gaps.push({ start: cursor === now ? now : Math.max(cursor, +released.starts_at), end: boundary });
      }
    }
    cursor = Math.max(cursor, +block.ends_at);
    if (cursor >= closes) break;
  }
  return gaps;
}
