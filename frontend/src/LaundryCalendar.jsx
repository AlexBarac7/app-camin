import LaundryStatus from './LaundryStatus.jsx';
import { useEffect, useRef, useState } from 'react';

const timeZone = 'Europe/Bucharest';
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' });
const dayFormat = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', dateStyle: 'full' });
const weekdayFormat = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', weekday: 'short' });
const monthFormat = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('ro-RO', { timeZone, hour: '2-digit', minute: '2-digit' });
const minute = 60_000;
const step = 5 * minute;
const handover = 10 * minute;
const closingExtension = 15 * minute;
const control = 'camin-control';
const primary = 'camin-primary';
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

function CalendarDay({ machine, day, onChange, children }) {
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
    <div className="booking-layout">
      <div className="camin-panel booking-availability">
        {children}
        <h3 className="booking-availability-title">Disponibilitatea zilei</h3>
        {feedback && <div ref={feedbackRegion} tabIndex={-1}>
          {feedback.error ? <p role="alert" className="camin-notice" data-tone="error">{feedback.text}</p>
            : <p role="status" className="camin-notice" data-tone="success">{feedback.text}</p>}
        </div>}
        {!calendar && (feedback?.error
          ? <button type="button" className={control} onClick={() => {
            setFeedback(null);
            setRevision(value => value + 1);
          }}>Reîncarcă data</button>
          : <p role="status" className="camin-notice" data-tone="info">Se încarcă intervalele…</p>)}
        {machine.technicalStatus === 'broken' && calendar?.cancellations?.map((entry, index) => <p key={index} className="camin-notice" data-tone="warning">
          Rezervarea ta {interval(entry.startsAt, entry.endsAt)} · <LaundryStatus status="cancelled">Anulată</LaundryStatus> · {entry.reason}
        </p>)}
        {calendar && !calendar.bookable && <p>Rezervare indisponibilă pentru acest echipament.</p>}
        {calendar && !calendar.open && <p><LaundryStatus status="unavailable">Închis</LaundryStatus></p>}
        {calendar?.open && !blocks.length && <p>Nu mai sunt intervale pentru această zi.</p>}
        {!!blocks.length && (
          <ul aria-label="Intervalele zilei" className="booking-intervals">
            {blocks.map(({ start, end, reservation }) => (
              <li key={start}>
                <div className="booking-interval-row"><strong>{interval(start, end)}</strong>{reservation?.hold
                  ? <LaundryStatus status="unavailable">Indisponibil temporar</LaundryStatus> : reservation
                  ? <LaundryStatus status="reserved">{reservation.id ? 'Rezervarea ta' : machine.technicalStatus === 'inspection' ? 'Rezervat' : 'Ocupat'}</LaundryStatus>
                  : calendar.bookable ? <LaundryStatus status="available">Liber</LaundryStatus>
                    : <LaundryStatus status="unavailable">Indisponibil</LaundryStatus>}
                </div>
                {reservation?.id && <>
                  {machine.technicalStatus === 'inspection' && !calendar.bookable &&
                    currentTime < Date.parse(reservation.useEndsAt) &&
                    (start > currentTime || machine.status === 'inspection') && (
                      <p className="camin-notice" data-tone="warning">
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
      </div>
      <div className="camin-panel booking-selection">
        <h3>Alege intervalul</h3>
        <p className="camin-muted">{dayFormat.format(new Date(day))}</p>
        {calendar?.open && calendar.bookable && (options.size ? (
          <form className="grid gap-3" onSubmit={event => mutate(event)}>
            <fieldset disabled={pending} className="grid gap-3">
              <div className="grid gap-1">
                <label htmlFor={'start-' + machine.id}>Început</label>
                <select id={'start-' + machine.id} className={control} value={start}
                  onChange={event => setSelection({ start: +event.target.value, end: 0 })} required>
                  <option value={0} disabled>Alege ora</option>
                  {[...options.keys()].map(value => <option key={value} value={value}>{time(value)}</option>)}
                </select>
              </div>
              <div className="grid gap-1">
                <label htmlFor={'end-' + machine.id}>Sfârșitul blocului</label>
                <select id={'end-' + machine.id} className={control} value={end} disabled={!start}
                  onChange={event => setSelection({ start, end: +event.target.value })} required>
                  <option value={0} disabled>Alege ora</option>
                  {endings.map(value => <option key={value} value={value}>{time(value)}</option>)}
                </select>
              </div>
              <div aria-live="polite" className="booking-recap">
                {end > 0 && <>
                  <p><span>Utilizare</span><strong>{interval(start, useEnd)}</strong></p>
                  {useEnd < end && <p><span>Predare</span><strong>{interval(useEnd, end)}</strong></p>}
                </>}
                {!end && <p className="camin-muted">Alege orele pentru a vedea rezumatul.</p>}
              </div>
              <button className={primary} disabled={!end}>Confirmă rezervarea</button>
            </fieldset>
          </form>
        ) : <p>Nu poți face o rezervare pentru această zi. Rezervările se pot face cu până la 7 zile în avans.</p>)}
        {(!calendar?.open || !calendar.bookable) && <p className="camin-muted">Alege o zi cu intervale libere pentru a continua.</p>}
      </div>
    </div>
  );
}

export default function LaundryCalendar({ machine, onChange }) {
  const [today] = useState(() => dateFormat.format(new Date()));
  const [day, setDay] = useState(today);
  const calendarRegion = useRef(null);
  const restoreFocus = useRef(null);
  const weekStart = moveDay(today, 7 * Math.floor((Date.parse(day) - Date.parse(today)) / (7 * 24 * 60 * minute)));
  const week = Array.from({ length: 7 }, (_, index) => moveDay(weekStart, index));
  const startMonth = monthFormat.format(new Date(week[0]));
  const endMonth = monthFormat.format(new Date(week.at(-1)));

  useEffect(() => {
    if (!restoreFocus.current) return;
    calendarRegion.current.querySelector('[data-calendar-nav="' + restoreFocus.current + '"]')?.focus();
    restoreFocus.current = null;
  }, [day]);

  function changeDay(date, event) {
    if (date === day) return;
    if (event.currentTarget.matches(':focus-visible')) restoreFocus.current = event.currentTarget.dataset.calendarNav;
    setDay(date);
  }

  return (
    <section ref={calendarRegion} aria-label={'Calendar · ' + machine.name} className="booking-calendar">
      <header><h2>Rezervă un interval</h2><p className="camin-muted">{machine.name} · {machine.location}</p></header>
      <CalendarDay machine={machine} day={day} onChange={onChange} key={day}>
        <div className="booking-day-header">
          <div><h3>Alege ziua</h3><p className="camin-muted booking-month">{startMonth === endMonth ? startMonth : startMonth + ' – ' + endMonth}</p></div>
          <div className="booking-day-arrows">
            <button type="button" className={control} aria-label="Ziua anterioară" data-calendar-nav="previous"
              onClick={event => changeDay(moveDay(day, -1), event)}>←</button>
            <button type="button" className={control} aria-label="Ziua următoare" data-calendar-nav="next"
              onClick={event => changeDay(moveDay(day, 1), event)}>→</button>
          </div>
        </div>
        <div className="booking-week" role="group" aria-label="Zile din calendar">
          {week.map(date => <button type="button" key={date} className={control} aria-pressed={date === day}
            data-calendar-nav={date} aria-label={dayFormat.format(new Date(date))} onClick={event => changeDay(date, event)}>
            <span>{weekdayFormat.format(new Date(date))}</span><strong>{new Date(date).getUTCDate()}</strong>
          </button>)}
        </div>
      </CalendarDay>
      <p className="camin-muted">În pilot, calendarul aplicației are prioritate pentru rezervări. Caietul poate fi folosit pentru consemnarea utilizării.</p>
    </section>
  );
}
