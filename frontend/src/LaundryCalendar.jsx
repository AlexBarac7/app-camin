import LaundryStatus from './LaundryStatus.jsx';
import { useEffect, useRef, useState } from 'react';

const timeZone = 'Europe/Bucharest';
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' });
const dayFormat = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', dateStyle: 'full' });
const timeFormat = new Intl.DateTimeFormat('ro-RO', { timeZone, hour: '2-digit', minute: '2-digit' });
const minute = 60_000;
const step = 5 * minute;
const handover = 10 * minute;
const closingExtension = 15 * minute;
const control = 'rounded-lg border border-slate-400 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60';
const primary = 'rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60';
const time = value => timeFormat.format(new Date(value));
const interval = (start, end) => time(start) + '–' + time(end);

export function upcomingInterval({ startsAt, endsAt }) {
  return dayFormat.format(new Date(dateFormat.format(new Date(startsAt)))) + ', ' + interval(startsAt, endsAt);
}

function moveDay(day, offset) {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function calendarBlocks(calendar, now) {
  const closes = +new Date(calendar.closesAt);
  let cursor = +new Date(calendar.opensAt);
  const blocks = [];
  const intervals = [...calendar.reservations, ...(calendar.holds ?? []).map(hold => ({ ...hold, hold: true }))]
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt));
  for (const reservation of intervals) {
    const start = +new Date(reservation.startsAt);
    const end = +new Date(reservation.endsAt);
    if (start > cursor) blocks.push({ start: cursor, end: Math.min(start, closes) });
    blocks.push({ start, end, reservation });
    cursor = Math.max(cursor, end);
  }
  if (cursor < closes) blocks.push({ start: cursor, end: closes });
  const earliest = Math.ceil(now / step) * step;
  return blocks.map(block => block.reservation ? block : { ...block, start: Math.max(block.start, earliest) })
    .filter(block => block.reservation || block.start < block.end);
}

function bookingOptions(calendar, blocks, now, maxUse) {
  const closes = +new Date(calendar.closesAt);
  const latest = +new Date(calendar.latestStart);
  const options = new Map();
  for (const block of blocks) {
    if (block.reservation) continue;
    const earliest = Math.ceil(Math.max(now, block.start) / step) * step;
    for (let start = earliest; start < block.end && start <= latest; start += step) {
      const ends = [];
      const regularEnd = Math.min(block.end, closes - step, start + maxUse + handover);
      for (let end = start + handover + step; end <= regularEnd; end += step) {
        ends.push(end);
      }
      if (block.end === closes && closes - start <= maxUse + closingExtension) {
        ends.push(closes);
      }
      if (ends.length) options.set(start, ends);
    }
  }
  return options;
}

async function request(path, options) {
  const response = await fetch(path, options);
  if (response.status === 401) window.location.replace('/autentificare');
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Momentan nu putem finaliza cererea. Încearcă din nou.');
  }
  return response;
}

function CalendarDay({ machine, day, onChange }) {
  const [data, setData] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const feedbackRegion = useRef(null);
  const endpoint = '/api/laundry-machines/' + machine.id;

  useEffect(() => {
    const controller = new AbortController();
    request(endpoint + '/calendar?day=' + day, { signal: controller.signal })
      .then(response => response.json())
      .then(calendar => {
        if (controller.signal.aborted) return;
        setData({ calendar, receivedAt: performance.now() });
        setElapsed(0);
      })
      .catch(error => {
        if (!controller.signal.aborted) setFeedback({ error: true, text: error.message });
      });
    return () => controller.abort();
  }, [endpoint, day, revision, machine.observedAt]);

  useEffect(() => {
    if (!data) return;
    // Start from the server snapshot at receipt so latency cannot hide a valid slot early.
    const updateClock = () => setElapsed(performance.now() - data.receivedAt);
    const timer = setInterval(updateClock, 1000);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, [data]);

  useEffect(() => {
    if (feedback?.afterAction) feedbackRegion.current.focus();
  }, [feedback]);

  async function mutate(event, id) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    try {
      await request(endpoint + '/reservations' + (id ? '/' + id : ''), id ? { method: 'DELETE' } : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }),
      });
      setFeedback({ afterAction: true, text: id ? 'Rezervarea a fost anulată.' : 'Rezervarea a fost confirmată.' });
      setSelection({ start: 0, end: 0 });
    } catch (error) {
      setFeedback({ afterAction: true, error: true, text: error.message });
    } finally {
      setData(null);
      setRevision(value => value + 1);
      onChange();
      setPending(false);
    }
  }

  const calendar = data?.calendar;
  const currentTime = calendar ? Date.parse(calendar.now) + elapsed : 0;
  const nextHoldExpiration = calendar?.nextHoldExpiration;
  useEffect(() => {
    if (!nextHoldExpiration) return;
    const delay = Date.parse(nextHoldExpiration) - Date.parse(data.calendar.now);
    const timer = setTimeout(() => setRevision(value => value + 1), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [data, nextHoldExpiration]);
  const blocks = calendar?.open ? calendarBlocks(calendar, currentTime) : [];
  const options = calendar?.open && calendar.bookable
    ? bookingOptions(calendar, blocks, currentTime, (machine.type === 'dryer' ? 240 : 180) * minute)
    : new Map();
  const start = options.has(selection.start) ? selection.start : 0;
  const endings = options.get(start) ?? [];
  const end = endings.includes(selection.end) ? selection.end : 0;
  const useEnd = end && (end === +new Date(calendar.closesAt) ? end : end - handover);

  return (
    <div className="grid gap-3">
      {feedback && <div ref={feedbackRegion} tabIndex={-1}>
        {feedback.error ? <p role="alert" className="text-red-800">{feedback.text}</p>
          : <p role="status">{feedback.text}</p>}
      </div>}
      {!calendar && (feedback?.error
        ? <button type="button" className={control} onClick={() => {
          setFeedback(null);
          setRevision(value => value + 1);
        }}>Reîncarcă data</button>
        : <p role="status">Se încarcă intervalele…</p>)}
      {machine.technicalStatus === 'broken' && calendar?.cancellations?.map((entry, index) => <p key={index} className="rounded-lg bg-amber-50 p-3">
        Rezervarea ta {interval(entry.startsAt, entry.endsAt)} · <LaundryStatus status="cancelled">Anulată</LaundryStatus> · {entry.reason}
      </p>)}
      {calendar && !calendar.bookable && <p>Rezervare indisponibilă pentru acest echipament.</p>}
      {calendar && !calendar.open && <p><LaundryStatus status="unavailable">Închis</LaundryStatus></p>}
      {calendar?.open && !blocks.length && <p>Nu mai sunt intervale pentru această zi.</p>}
      {!!blocks.length && (
        <ul aria-label="Intervalele zilei" className="grid gap-2">
          {blocks.map(({ start, end, reservation }) => (
            <li key={start} className="grid gap-1 rounded-lg bg-slate-100 p-2">
              <span>{interval(start, end)} · {reservation?.hold
                ? <LaundryStatus status="unavailable">Indisponibil temporar</LaundryStatus> : reservation
                ? <LaundryStatus status="reserved">{reservation.id ? 'Rezervarea ta' : machine.technicalStatus === 'inspection' ? 'Rezervat' : 'Ocupat'}</LaundryStatus>
                : calendar.bookable ? <LaundryStatus status="available">Liber</LaundryStatus>
                  : <LaundryStatus status="unavailable">Indisponibil</LaundryStatus>}
              </span>
              {reservation?.id && <>
                {machine.technicalStatus === 'inspection' && !calendar.bookable &&
                  currentTime < Date.parse(reservation.useEndsAt) &&
                  (start > currentTime || machine.status === 'inspection') && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-950">
                      {machine.status === 'occupied' ? 'Echipamentul va fi verificat după ciclul curent.' : 'Echipamentul este în verificare.'}
                      {' '}Rezervarea ta este păstrată. Poți folosi echipamentul după repunerea în serviciu, în timpul rezervat pentru utilizare.
                    </p>
                  )}
                <span>Utilizare {interval(start, reservation.useEndsAt)}</span>
                {+new Date(reservation.useEndsAt) < end && <span><LaundryStatus status="handover">Predare</LaundryStatus> {interval(reservation.useEndsAt, end)}</span>}
                {start > currentTime && <button type="button" className={control + ' justify-self-start'}
                  disabled={pending} onClick={event => mutate(event, reservation.id)}>Anulează rezervarea</button>}
              </>}
            </li>
          ))}
        </ul>
      )}
      {calendar?.open && calendar.bookable && (options.size ? (
        <form className="grid gap-3" onSubmit={event => mutate(event)}>
          <fieldset disabled={pending} className="grid gap-3">
            <legend className="font-semibold">Alege intervalul</legend>
            <label className="grid gap-1">
              Început
              <select className={control} value={start}
                onChange={event => setSelection({ start: +event.target.value, end: 0 })} required>
                <option value={0} disabled>Alege ora</option>
                {[...options.keys()].map(value => <option key={value} value={value}>{time(value)}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              Sfârșitul blocului
              <select className={control} value={end} disabled={!start}
                onChange={event => setSelection({ start, end: +event.target.value })} required>
                <option value={0} disabled>Alege ora</option>
                {endings.map(value => <option key={value} value={value}>{time(value)}</option>)}
              </select>
            </label>
            <div aria-live="polite">
              {end > 0 && <>
                <p>Utilizare {interval(start, useEnd)}</p>
                {useEnd < end && <p><LaundryStatus status="handover">Predare</LaundryStatus> {interval(useEnd, end)}</p>}
              </>}
            </div>
            <button className={primary} disabled={!end}>Confirmă rezervarea</button>
          </fieldset>
        </form>
      ) : <p>Nu poți face o rezervare pentru această zi. Rezervările se pot face cu până la 7 zile în avans.</p>)}
    </div>
  );
}

export default function LaundryCalendar({ machine, onChange }) {
  const [day, setDay] = useState(() => dateFormat.format(new Date()));
  return (
    <section aria-label={'Calendar · ' + machine.name} className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <h3 aria-live="polite" aria-atomic="true" className="col-span-2 font-semibold">{dayFormat.format(new Date(day))}</h3>
        <button type="button" className={control} onClick={() => setDay(moveDay(day, -1))}>Ziua anterioară</button>
        <button type="button" className={control} onClick={() => setDay(moveDay(day, 1))}>Ziua următoare</button>
      </div>
      <CalendarDay key={day} machine={machine} day={day} onChange={onChange} />
      <p className="text-slate-600">În pilot, calendarul aplicației are prioritate pentru rezervări. Caietul poate fi folosit pentru consemnarea utilizării.</p>
    </section>
  );
}
