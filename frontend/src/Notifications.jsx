import { useEffect, useRef, useState } from 'react';
import AdminAnnouncements, { AnnouncementPhotos } from './AdminAnnouncements.jsx';
import PortalIcon from './PortalIcon.jsx';

const endpoint = '/api/notifications';
const button = 'rounded-lg border border-slate-400 px-3 py-2 font-medium disabled:opacity-60';
const unavailable = 'Cererea nu a putut fi finalizată. Încearcă din nou.';
const offerLabels = {
  accepted: 'Rezervare confirmată',
  declined: 'Ofertă refuzată',
  expired: 'Oferta a expirat',
  withdrawn: 'Oferta a fost retrasă',
};
const noticeLabels = {
  shutdown: ['Echipament defect', 'warning', 'error'],
  inspection: ['Verificare programată', 'warning', 'warning'],
  restored: ['Echipament disponibil din nou', 'check', 'success'],
  'report-new': ['Sesizare nouă', 'reports', 'info'],
  'report-taken': ['Sesizare preluată', 'reports', 'info'],
  'report-resolved': ['Sesizare rezolvată', 'check', 'success'],
  'access-request': ['Cerere de acces nouă', 'account', 'info'],
  'reservation-reminder': ['Rezervarea ta se apropie', 'clock', 'info'],
  'reservation-end-reminder': ['Utilizarea se încheie în curând', 'clock', 'info'],
  'strike-issued': ['Strike pentru neprezentare', 'warning', 'warning'],
  'strike-received': ['Ai primit un strike', 'warning', 'warning'],
  'strike-corrected': ['Strike corectat', 'check', 'success'],
  'reservation-start': ['Rezervarea ta a început', 'calendar', 'info'],
  'queue-turn': ['Interval disponibil astăzi', 'queue', 'info'],
  announcement: ['Notificare de la Administrator', 'bell', 'info'],
};
const timeZone = 'Europe/Bucharest';
const dateTime = new Intl.DateTimeFormat('ro-RO', {
  timeZone, dateStyle: 'short', timeStyle: 'short',
});
const noticeTime = new Intl.DateTimeFormat('ro-RO', { timeZone, hour: '2-digit', minute: '2-digit' });
const dayKey = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' });
const noticeDay = new Intl.DateTimeFormat('ro-RO', { timeZone, dateStyle: 'long' });
const pushSupported = () => window.isSecureContext &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let badgeRevision = 0;

export async function syncDeviceBadge(unreadCount) {
  if (!Number.isSafeInteger(unreadCount) || unreadCount < 0 || typeof navigator.setAppBadge !== 'function') return;
  const revision = ++badgeRevision;
  try {
    const registration = unreadCount > 0 && await navigator.serviceWorker?.getRegistration();
    const subscribed = registration && await registration.pushManager.getSubscription();
    if (revision === badgeRevision) await navigator.setAppBadge(subscribed ? unreadCount : 0);
  } catch {
    // Badges are optional and can be disabled in the device settings.
  }
}

async function send(path, method, body) {
  return fetch(endpoint + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export async function disableDevicePush(subscription) {
  const registration = !subscription && await navigator.serviceWorker?.getRegistration();
  const device = subscription ?? await registration?.pushManager.getSubscription();
  if (!device) return;
  const response = await send('/push-subscription', 'DELETE', { endpoint: device.endpoint });
  if (!response.ok && response.status !== 401) throw new Error(unavailable);
  await device.unsubscribe();
}

function PushControls({ publicKey, unreadCount }) {
  const [registration, setRegistration] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const supported = pushSupported();
  useEffect(() => {
    if (!publicKey || !supported) return;
    let active = true;
    navigator.serviceWorker.register('/push-worker.js')
      .then(() => navigator.serviceWorker.ready)
      .then(async worker => {
        const device = await worker.pushManager.getSubscription();
        if (!active) return;
        setRegistration(worker);
        setSubscription(device);
      })
      .catch(() => { if (active) setFeedback('Alertele nu sunt disponibile în acest browser.'); });
    return () => { active = false; };
  }, [publicKey, supported]);

  async function toggle() {
    setBusy(true);
    setFeedback('');
    let device;
    try {
      if (subscription) {
        await disableDevicePush(subscription);
        setSubscription(null);
        void syncDeviceBadge(0);
        setFeedback('Alertele sunt dezactivate pe acest dispozitiv.');
      } else {
        device = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
        const response = await send('/push-subscription', 'PUT', device.toJSON());
        if (!response.ok) throw new Error(unavailable);
        setSubscription(device);
        void syncDeviceBadge(unreadCount);
        setFeedback('Alertele sunt activate pe acest dispozitiv.');
      }
    } catch {
      if (device) await device.unsubscribe().catch(() => {});
      setFeedback(Notification.permission === 'denied'
        ? 'Permite notificările pentru aplicație în setările dispozitivului.' : unavailable);
    } finally {
      setBusy(false);
    }
  }

  if (!publicKey) return null;
  if (!supported) return <p className="text-sm">Pe iPhone, adaugă aplicația pe ecranul principal și deschide-o de acolo pentru a activa alertele.</p>;
  return <div className="grid justify-items-start gap-2">
    <button type="button" className={button} disabled={!registration || busy} onClick={toggle}>
      {subscription ? 'Dezactivează alertele pe acest dispozitiv' : 'Activează alertele pe acest dispozitiv'}
    </button>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
  </div>;
}

function groupNotices(items, now) {
  const groups = new Map();
  for (const item of items) {
    const key = dayKey.format(new Date(item.createdAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const today = dayKey.format(now);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const previous = yesterday.toISOString().slice(0, 10);
  return Array.from(groups, ([day, notices]) => ({
    day, notices,
    label: day === today ? 'Astăzi' : day === previous ? 'Ieri' : noticeDay.format(new Date(notices[0].createdAt)),
  }));
}

function NotificationCard({ item, now, target, busy, reading, onAnswer, onMarkRead, onConfirm }) {
  const { offer } = item;
  const queue = item.kind === 'queue-turn';
  const strike = item.kind === 'strike-issued';
  const remaining = offer ? Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - now) / 1000)) : 0;
  const status = offer?.status === 'pending' && !remaining ? 'expired' : offer?.status;
  const [defaultTitle, defaultIcon, defaultTone] = noticeLabels[item.kind] ?? ['Notificare', 'bell', 'info'];
  const title = offerLabels[status] ?? (queue && offer?.immediate ? 'E rândul tău' : defaultTitle);
  const icon = status === 'accepted' ? 'calendar' : status === 'expired' ? 'clock' : defaultIcon;
  const tone = status === 'accepted' ? 'success' : status === 'expired' ? 'warning' : defaultTone;
  const equipment = [item.machineName, item.machineLocation].filter(Boolean).join(' · ');
  const calendar = item.room && item.machineId ? '/spalatorie/' + encodeURIComponent(item.room) + '?echipament=' + item.machineId : null;
  const reservation = !strike && calendar && item.reservation && calendar +
    '&zi=' + dayKey.format(new Date(item.reservation.startsAt)) + '#rezervare-' + item.reservation.id;
  const stamp = new Date(item.createdAt);

  return <li id={'notificare-' + item.id} className="notice-card" data-unread={item.readAt ? undefined : 'true'}
    data-target={target === item.id ? 'true' : undefined}>
    <span className="notice-icon" data-tone={tone}><PortalIcon name={icon} /></span>
    <div className="notice-copy">
      <div className="notice-card-heading">
        <h3>{title}</h3>
        <time dateTime={item.createdAt} title={dateTime.format(stamp)}>{noticeTime.format(stamp)}</time>
      </div>
      {equipment && <p className="camin-muted">{equipment}</p>}
      {(!queue || !equipment) && <p className="notice-message">{item.message}</p>}
      {item.announcement && <AnnouncementPhotos id={item.announcement.id} photoIds={item.announcement.photoIds} />}
      {item.strikeProgressMessage && <p className="camin-muted">{item.strikeProgressMessage}</p>}
      {offer && !offer.immediate && <p>
        {dayKey.format(new Date(offer.startsAt)) !== dayKey.format(stamp) &&
          <span className="camin-muted">{noticeDay.format(new Date(offer.startsAt))} · </span>}
        {noticeTime.format(new Date(offer.startsAt))}–{noticeTime.format(new Date(offer.endsAt))}
      </p>}
      {status === 'pending' && <>
        <p>Oferta expiră în <span role="timer">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>.</p>
        <div className="notice-actions">
          <button type="button" className="camin-primary" disabled={busy} onClick={() => onAnswer(item, 'accept')}>
            {queue ? (offer.immediate ? 'Începe' : 'Rezervă intervalul') : 'Continuă rezervarea'}
          </button>
          <button type="button" className="camin-control" disabled={busy} onClick={() => onAnswer(item, 'decline')}>
            {queue ? 'Refuză oferta' : 'Încheie rezervarea'}
          </button>
        </div>
      </>}
      {strike && item.reservation && <>
        {item.residentEmail && <p className="[overflow-wrap:anywhere]"><strong>Rezident</strong> {item.residentEmail}</p>}
        <p>Rezervare din {dateTime.format(new Date(item.reservation.startsAt))}</p>
        <a className="camin-link" href={'/admin/rezervari?rezervare=' + encodeURIComponent(item.reservation.id)}>
          Mergi la rezervare <span aria-hidden="true">→</span>
        </a>
      </>}
      {reservation && <a className="camin-link" href={reservation}>Deschide rezervarea <span aria-hidden="true">→</span></a>}
      {calendar && (queue || (!offer && item.kind === 'restored')) &&
        <a className="camin-link" href={calendar}>Deschide calendarul <span aria-hidden="true">→</span></a>}
      {item.kind === 'access-request' && <a className="camin-link" href="/admin/cereri-acces">Vezi cererile de acces</a>}
      {item.reportId && <a className="camin-link"
        href={(item.kind === 'report-new' ? '/admin/sesizari' : '/sesizari') + '#sesizare-' + item.reportId}>
        Deschide sesizarea
      </a>}
      {item.announcement && (item.announcement.confirmedAt ? <p>Ai confirmat citirea.</p>
        : <div className="notice-actions"><button type="button" className="camin-control" disabled={reading !== null}
          onClick={() => onConfirm(item.id)}>Confirm că am citit</button></div>)}
      {!item.readAt && <button type="button" className="camin-control notice-read"
        aria-label="OK, marchează notificarea ca citită" disabled={reading !== null}
        onClick={() => onMarkRead(item.id)}>OK</button>}
    </div>
  </li>;
}

export default function Notifications({ onUnreadCount, canAnnounce }) {
  const [snapshot, setSnapshot] = useState(null);
  const [time, setTime] = useState(() => performance.now());
  const [revision, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);
  const target = /^#notificare-(\d+)$/.exec(window.location.hash)?.[1];

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const version = ++loadVersion.current;
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
        if (controller.signal.aborted || version !== loadVersion.current) return;
        if (response.status === 401) {
          window.location.replace('/autentificare' + (target ? '?notificare=' + target : ''));
          return;
        }
        if (!response.ok) throw new Error(unavailable);
        const data = await response.json();
        if (controller.signal.aborted || version !== loadVersion.current) return;
        const received = performance.now();
        setTime(received);
        setSnapshot({ ...data, received });
        setLoadError('');
      } catch {
        if (!controller.signal.aborted && version === loadVersion.current) setLoadError(unavailable);
      }
    }
    load();
    const timer = setInterval(load, 15_000);
    const clock = setInterval(() => setTime(performance.now()), 1000);
    const onReturn = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      controller.abort();
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [revision, target]);

  const unreadCount = snapshot?.items.filter(item => !item.readAt).length;
  useEffect(() => {
    if (unreadCount !== undefined) onUnreadCount(unreadCount);
  }, [unreadCount, onUnreadCount]);

  const showTarget = snapshot?.items.some(item => item.id === target);
  useEffect(() => {
    if (showTarget) document.getElementById('notificare-' + target)?.scrollIntoView({ block: 'center' });
  }, [showTarget, target]);

  async function answer(item, action) {
    setBusy(true);
    setFeedback('');
    try {
      const { offer } = item;
      const response = item.kind === 'queue-turn'
        ? await fetch('/api/laundry-machines/' + item.machineId + '/queue/offers/' + offer.id, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
        })
        : await send('/offers/' + offer.id, 'POST', { action });
      if (response.status === 401) {
        window.location.replace('/autentificare' + (target ? '?notificare=' + target : ''));
        return;
      }
      const body = !response.ok ? await response.json().catch(() => null) : null;
      if (body?.message) setFeedback(body.message);
      else if (response.status === 409) setFeedback('Oferta nu mai este disponibilă.');
      else if (response.ok) setFeedback(action === 'accept' ? 'Rezervarea a fost confirmată.' : 'Intervalul a fost eliberat.');
      else throw new Error(unavailable);
    } catch {
      setFeedback(unavailable);
    } finally {
      refresh(value => value + 1);
      setBusy(false);
    }
  }

  async function acknowledge(id, action) {
    setReading(id);
    setFeedback('');
    try {
      const response = await send('/' + id + '/' + action, 'PUT');
      if (response.status === 401) {
        window.location.replace('/autentificare' + (target ? '?notificare=' + target : ''));
        return;
      }
      if (!response.ok) throw new Error(unavailable);
      const result = await response.json();
      // An inbox request started before this update can still contain the unread state.
      loadVersion.current += 1;
      setSnapshot(current => ({
        ...current,
        items: current.items.map(item => item.id !== id ? item : action === 'confirm'
          ? { ...item, announcement: { ...item.announcement, ...result } }
          : { ...item, ...result }),
      }));
    } catch {
      setFeedback(action === 'confirm' ? 'Citirea nu a putut fi confirmată. Încearcă din nou.'
        : 'Mesajul nu a putut fi marcat drept citit. Încearcă din nou.');
    } finally {
      setReading(null);
    }
  }

  const now = snapshot ? Date.parse(snapshot.now) + time - snapshot.received : 0;
  const groups = snapshot ? groupNotices(snapshot.items, now) : [];
  const strikeProgress = snapshot?.strikeProgress;
  return <section className="notice-inbox">
    <header className="portal-heading-row">
      <h1>Notificări</h1>
      {snapshot?.pushPublicKey && <details className="notice-settings">
        <summary className="portal-icon-button" aria-label="Setări pentru alertele pe dispozitiv" title="Setări pentru alertele pe dispozitiv">
          <PortalIcon name="settings" />
        </summary>
        <div className="camin-panel"><PushControls publicKey={snapshot.pushPublicKey} unreadCount={unreadCount} /></div>
      </details>}
    </header>
    {canAnnounce && <AdminAnnouncements />}
    {strikeProgress && <p className="camin-muted">
      {strikeProgress.suspendedUntil
        ? 'Suspendare activă până la ' + dateTime.format(new Date(strikeProgress.suspendedUntil))
        : `${strikeProgress.active} ${strikeProgress.active === 1 ? 'strike activ' : 'strike-uri active'} · Mai ai ${strikeProgress.remaining} până la suspendare`}
    </p>}
    {loadError && <p role="alert">{loadError} <button className="underline" onClick={() => refresh(value => value + 1)}>Reîncarcă</button></p>}
    {!snapshot && !loadError && <p role="status">Se încarcă notificările…</p>}
    {feedback && <p role="status">{feedback}</p>}
    {snapshot?.items.length === 0 && <p>Nu ai notificări.</p>}
    {groups.map(({ day, label, notices }) => <section className="notice-group" key={day}>
      <h2>{label}</h2>
      <ul>{notices.map(item => <NotificationCard key={item.id} item={item} now={now} target={target}
        busy={busy} reading={reading} onAnswer={answer}
        onMarkRead={id => acknowledge(id, 'read')} onConfirm={id => acknowledge(id, 'confirm')} />)}</ul>
    </section>)}
  </section>;
}
