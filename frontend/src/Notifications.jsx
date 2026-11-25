import { useEffect, useRef, useState } from 'react';
import { upcomingInterval } from './LaundryCalendar.jsx';

const endpoint = '/api/notifications';
const button = 'rounded-lg border border-slate-400 px-3 py-2 font-medium disabled:opacity-60';
const unavailable = 'Cererea nu a putut fi finalizată. Încearcă din nou.';
const offerLabels = {
  accepted: 'Rezervare confirmată',
  declined: 'Ofertă refuzată',
  expired: 'Oferta a expirat',
  withdrawn: 'Oferta a fost retrasă',
};
const dateTime = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short',
});
const pushSupported = () => window.isSecureContext &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

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

function PushControls({ publicKey }) {
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
        setFeedback('Alertele sunt dezactivate pe acest dispozitiv.');
      } else {
        device = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
        const response = await send('/push-subscription', 'PUT', device.toJSON());
        if (!response.ok) throw new Error(unavailable);
        setSubscription(device);
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

export default function Notifications({ onUnreadCount }) {
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

  useEffect(() => {
    if (snapshot) onUnreadCount(snapshot.items.filter(item => !item.readAt).length);
  }, [snapshot, onUnreadCount]);

  const showTarget = snapshot?.items.some(item => item.id === target);
  useEffect(() => {
    if (showTarget) document.getElementById('notificare-' + target)?.scrollIntoView({ block: 'center' });
  }, [showTarget, target]);

  async function answer(offer, action) {
    setBusy(true);
    setFeedback('');
    try {
      const response = await send('/offers/' + offer.id, 'POST', { action });
      if (response.status === 401) {
        window.location.replace('/autentificare' + (target ? '?notificare=' + target : ''));
        return;
      }
      if (response.status === 409) setFeedback('Oferta nu mai este disponibilă.');
      else if (response.ok) setFeedback(action === 'accept' ? 'Rezervarea a fost confirmată.' : 'Intervalul a fost eliberat.');
      else throw new Error(unavailable);
    } catch {
      setFeedback(unavailable);
    } finally {
      refresh(value => value + 1);
      setBusy(false);
    }
  }

  async function markRead(id) {
    setReading(id);
    setFeedback('');
    try {
      const response = await send('/' + id + '/read', 'PUT');
      if (response.status === 401) {
        window.location.replace('/autentificare' + (target ? '?notificare=' + target : ''));
        return;
      }
      if (!response.ok) throw new Error(unavailable);
      const { readAt } = await response.json();
      // An inbox request started before this update can still contain the unread state.
      loadVersion.current += 1;
      setSnapshot(current => ({
        ...current,
        items: current.items.map(item => item.id === id ? { ...item, readAt } : item),
      }));
    } catch {
      setFeedback('Mesajul nu a putut fi marcat drept citit. Încearcă din nou.');
    } finally {
      setReading(null);
    }
  }

  const now = snapshot ? Date.parse(snapshot.now) + time - snapshot.received : 0;
  return <section className="mt-5 grid gap-4">
    {loadError && <p role="alert">{loadError} <button className="underline" onClick={() => refresh(value => value + 1)}>Reîncarcă</button></p>}
    {!snapshot && !loadError && <p role="status">Se încarcă notificările…</p>}
    {snapshot && <PushControls publicKey={snapshot.pushPublicKey} />}
    {feedback && <p role="status">{feedback}</p>}
    {snapshot?.items.length === 0 && <p>Nu ai notificări.</p>}
    {!!snapshot?.items.length && <ul className="grid gap-3">
      {snapshot.items.map(item => {
        const { offer } = item;
        const remaining = offer ? Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - now) / 1000)) : 0;
        const status = offer?.status === 'pending' && !remaining ? 'expired' : offer?.status;
        return <li key={item.id} id={'notificare-' + item.id}
          className={'grid gap-2 rounded-lg border p-3 ' + (target === item.id ? 'border-slate-900' : 'border-slate-200')
            + (item.readAt ? '' : ' bg-slate-50')}>
          <time dateTime={item.createdAt} className="text-sm text-slate-600">{dateTime.format(new Date(item.createdAt))}</time>
          <p className="whitespace-pre-line break-words">{item.message}</p>
          {offer && <p>{upcomingInterval(offer)}</p>}
          {status === 'pending' && <>
            <p>Oferta expiră în <span role="timer">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} disabled={busy} onClick={() => answer(offer, 'accept')}>Continuă rezervarea</button>
              <button type="button" className={button} disabled={busy} onClick={() => answer(offer, 'decline')}>Încheie rezervarea</button>
            </div>
          </>}
          {status && status !== 'pending' && <p className="font-medium">{offerLabels[status]}</p>}
          {!offer && item.kind === 'restored' && <a className="underline"
            href={'/spalatorie/' + encodeURIComponent(item.room) + '?echipament=' + item.machineId}>Deschide calendarul</a>}
          {item.reportId && <a className="underline"
            href={(item.kind === 'report-new' ? '/admin/sesizari' : '/sesizari') + '#sesizare-' + item.reportId}>
            Deschide sesizarea
          </a>}
          {!item.readAt && <button type="button" className={button + ' justify-self-end bg-blue-700 text-white hover:bg-blue-800'
            + ' focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'}
            aria-label="OK, marchează notificarea ca citită" disabled={reading !== null}
            onClick={() => markRead(item.id)}>OK</button>}
        </li>;
      })}
    </ul>}
  </section>;
}
