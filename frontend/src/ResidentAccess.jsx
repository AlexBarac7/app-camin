import LaundryStatus from './LaundryStatus.jsx';
import { useEffect, useState } from 'react';
import LaundryCalendar, { upcomingInterval } from './LaundryCalendar.jsx';
import Notifications, { disableDevicePush } from './Notifications.jsx';
import LaundryReports, { ReportEquipment } from './LaundryReports.jsx';

const invalidLink = 'Invitația nu mai este valabilă. Cere o invitație nouă.';
const unavailable = 'Momentan nu putem finaliza cererea. Încearcă din nou.';
const buttonStyle = 'rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 disabled:opacity-60';

const route = window.location.pathname;
const invitation = route === '/activeaza' ? window.location.hash.slice(1) : '';
if (route === '/activeaza' && window.location.hash) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

async function authRequest(action, data) {
  const response = await fetch('/api/auth/' + action, data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.code === 'invalid_invitation' ? invalidLink : body.message;
    throw Object.assign(new Error(response.status >= 500 ? unavailable : message || unavailable), {
      status: response.status,
      invalidInvitation: body.code === 'invalid_invitation',
    });
  }
  return response;
}

function Field({ name, label, type, autoComplete, error }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={name} className="font-medium">{label}</label>
      <input id={name} name={name} type={type} autoComplete={autoComplete} required
        aria-invalid={error ? true : undefined} aria-describedby={error ? name + '-error' : undefined}
        className="w-full rounded-lg border border-slate-400 bg-white px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" />
      {error && <p id={name + '-error'} role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}

function AccessForm({ activation }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [invalid, setInvalid] = useState(activation && !/^[\w-]{43}$/.test(invitation));

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = data.get('password');
    setError('');
    setFieldErrors({});

    if (activation) {
      const length = Array.from(password).length;
      const errors = {};
      if (length < 15 || length > 128) errors.password = 'Alege o parolă între 15 și 128 de caractere.';
      if (password !== data.get('confirmation')) errors.confirmation = 'Parolele trebuie să coincidă.';
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        form.elements.namedItem(Object.keys(errors)[0]).focus();
        return;
      }
    }

    setPending(true);
    try {
      await authRequest(activation ? 'activate' : 'login', activation
        ? { token: invitation, password }
        : { email: data.get('email'), password });
      const notice = new URLSearchParams(window.location.search).get('notificare');
      const destination = notice && /^\d+$/.test(notice) ? '/notificari#notificare-' + notice : '/resurse';
      window.location.replace(activation ? '/autentificare' : destination);
    } catch (failure) {
      if (failure.invalidInvitation) setInvalid(true);
      else setError(failure.status ? failure.message : unavailable);
      setPending(false);
    }
  }

  if (invalid) return <p role="alert" className="mt-5 text-red-800">{invalidLink}</p>;

  return (
    <form onSubmit={submit} className="mt-6 grid gap-5">
      {!activation && <Field name="email" label="E-mail" type="email" autoComplete="username" />}
      <Field name="password" label="Parolă" type="password" error={fieldErrors.password}
        autoComplete={activation ? 'new-password' : 'current-password'} />
      {activation && <Field name="confirmation" label="Confirmă parola" type="password"
        error={fieldErrors.confirmation} autoComplete="new-password" />}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button className={buttonStyle} disabled={pending}>
        {pending ? 'Se trimite…' : activation ? 'Activează contul' : 'Autentifică-te'}
      </button>
    </form>
  );
}

function Account() {
  const [email, setEmail] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadAccount() {
      try {
        const response = await authRequest('session');
        const account = await response.json();
        if (active) setEmail(account.email);
      } catch (failure) {
        if (!active) return;
        if (failure.status === 401) window.location.replace('/autentificare');
        else setError(unavailable);
      }
    }
    loadAccount();
    return () => { active = false; };
  }, []);

  async function logout() {
    setPending(true);
    setError('');
    try {
      await disableDevicePush().catch(() => {});
      await authRequest('logout', {});
      window.location.replace('/autentificare');
    } catch {
      setError(unavailable);
      setPending(false);
    }
  }

  return (
    <div className="mt-5 grid gap-5">
      {email && <>
        <p className="break-all">{email}</p>
        <button type="button" className={buttonStyle} disabled={pending} onClick={logout}>
          {pending ? 'Se deconectează…' : 'Deconectare'}
        </button>
      </>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {!email && !error && <p role="status">Se verifică sesiunea…</p>}
    </div>
  );
}

const laundryRooms = [
  { id: '1', path: '/spalatorie/1', name: 'Spălătoria 1' },
  { id: '2', path: '/spalatorie/2', name: 'Spălătoria 2' },
  { id: 'uscatorie', path: '/spalatorie/uscatorie', name: 'Uscătoria' },
];

const linkFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

function ResidentNav({ inboxUnreadCount }) {
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (route === '/notificari') return;
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const response = await fetch('/api/notifications/unread-count', {
          signal: controller.signal, cache: 'no-store',
        });
        if (response.status === 401) setUnreadCount(0);
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted) setUnreadCount(data.unreadCount);
      } catch {
        // Keep the last count through a temporary connection failure.
      } finally {
        loading = false;
      }
    }
    load();
    const timer = setInterval(load, 15_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);
  const count = route === '/notificari' ? inboxUnreadCount : unreadCount;
  return (
    <nav aria-label="Navigare principală" className="mb-5 flex flex-wrap gap-2">
      {[['/resurse', 'Resurse'], ['/sesizari', 'Sesizările mele'], ['/notificari', 'Notificări'],
        ['/cont', 'Contul meu']].map(([path, label]) => {
        const showCount = path === '/notificari' && count > 0;
        return <a key={path} href={path} aria-current={route === path ? 'page' : undefined}
          className={'inline-flex items-center gap-2 rounded-lg px-3 py-3 font-semibold aria-[current=page]:bg-slate-900 aria-[current=page]:text-white hover:underline ' + linkFocus}>
          {label}
          {showCount && <>
            <span aria-hidden="true" className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-700 px-1.5 text-sm text-white tabular-nums">
              {count}
            </span>
            <span className="sr-only">{count === 1 ? ', 1 mesaj necitit' : ', ' + count + ' mesaje necitite'}</span>
          </>}
        </a>;
      })}
    </nav>
  );
}

const technicalStatus = {
  inspection: 'În verificare',
  broken: 'Defectă',
  working: 'Funcțională',
  unspecified: 'Neprecizată',
};

const occupancy = {
  available: 'Disponibilă',
  occupied: 'Ocupată',
  handover: 'Predare',
  inspection: 'În verificare',
  broken: 'Defectă',
  unspecified: 'Neprecizată',
};

function EquipmentCard({ machine, selected, onSelect, onChange }) {
  const dryer = machine.type === 'dryer';

  return (
    <li>
      <details className="rounded-xl border border-slate-300" open={selected ? true : undefined}>
        <summary className={'cursor-pointer rounded-xl px-4 py-4 ' + linkFocus}>
          <span className="ml-1 font-semibold">
            {dryer ? 'Uscător' : 'Mașină de spălat'}{' '}
            <span className={'rounded border border-slate-300 bg-white px-2 py-0.5 ' + (dryer ? 'text-red-700' : 'text-black')}>
              {machine.label}
            </span>
          </span>
          <span className="mt-2 block text-sm text-slate-600">{machine.location}</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <LaundryStatus status={machine.status}>{occupancy[machine.status]}</LaundryStatus>
            {machine.status === 'occupied' && machine.technicalStatus === 'inspection' &&
              <LaundryStatus status="inspection">Verificare după ciclu</LaundryStatus>}
            {Date.parse(machine.repairVerifiedUntil) > Date.now() &&
              <span className="rounded-full bg-green-50 px-2 py-1 text-sm font-medium text-green-800">
                <span aria-hidden="true">✓ </span>Remediere verificată
              </span>}
          </span>
          {machine.nextReservation && <span className="mt-2 block text-sm">
            Următoarea rezervare · {upcomingInterval(machine.nextReservation)}
          </span>}
        </summary>
        <div className="grid gap-3 border-t border-slate-200 px-4 py-4 text-sm">
          <p><strong>Stare tehnică</strong> · <LaundryStatus status={machine.technicalStatus}>{technicalStatus[machine.technicalStatus]}</LaundryStatus></p>
          <p><strong>Program</strong> · luni–vineri, 08:00–20:00</p>
          <button type="button" className={buttonStyle} aria-expanded={selected} onClick={onSelect}>
            {selected ? 'Închide calendarul' : 'Vezi calendarul'}
          </button>
          {selected && <LaundryCalendar machine={machine} onChange={onChange} />}
          <ReportEquipment machine={machine} onChange={onChange} />
        </div>
      </details>
    </li>
  );
}

function Resources({ room }) {
  const [canManage, setCanManage] = useState(false);
  const [machines, setMachines] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(() =>
    Number(new URLSearchParams(window.location.search).get('echipament')) || null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const refresh = () => setRevision(value => value + 1);
    function refreshOnReturn() {
      if (!document.hidden) refresh();
    }

    async function loadResources() {
      let refreshAfter = 30_000;
      try {
        const response = await fetch(room ? '/api/laundry-machines?availability=1' : '/api/auth/session', {
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.replace('/autentificare');
          return;
        }
        if (!response.ok) throw new Error(unavailable);
        const inventory = room ? (await response.json()).filter(machine => machine.room === room.id) : [];
        if (controller.signal.aborted) return;
        for (const machine of inventory) {
          for (const changeAt of [machine.nextStatusAt, machine.repairVerifiedUntil].filter(Boolean)) {
            const delay = Date.parse(changeAt) - Date.parse(machine.observedAt);
            refreshAfter = Math.min(refreshAfter, Math.max(1, delay));
          }
        }
        setError(false);
        setMachines(inventory);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (room && !controller.signal.aborted) timer = setTimeout(refresh, refreshAfter);
      }
    }

    if (!room) fetch('/api/equipment-access', { signal: controller.signal })
      .then(response => setCanManage(response.ok)).catch(() => {});
    loadResources();
    if (room) document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [room, revision]);

  return (
    <div className="mt-5 grid gap-4">
      {!room && canManage && <a className="w-fit rounded py-2 underline" href="/admin/echipamente">Gestionează echipamentele</a>}
      {room && <a className={'w-fit rounded py-2 underline ' + linkFocus} href="/resurse">Înapoi la Resurse</a>}
      {error && <p role="alert" className="text-red-800">{unavailable}</p>}
      {!machines && !error && <p role="status">{room ? 'Se încarcă inventarul…' : 'Se verifică sesiunea…'}</p>}
      {machines && (room ? (
        machines.length ? (
          <ul className="grid gap-3">
            {machines.map(machine => <EquipmentCard key={machine.id} machine={machine}
              selected={selectedMachine === machine.id}
              onSelect={() => setSelectedMachine(selectedMachine === machine.id ? null : machine.id)}
              onChange={() => setRevision(value => value + 1)} />)}
          </ul>
        ) : <p role="status">Inventarul acestei încăperi nu a fost încă publicat.</p>
      ) : (
        <ul className="grid gap-3">
          {laundryRooms.map(item => (
            <li key={item.id}>
              <a href={item.path} className={'block rounded-xl border border-slate-300 p-4 font-semibold hover:bg-slate-50 ' + linkFocus}>
                {item.name} <span className="font-normal text-slate-600">– subsol</span>
              </a>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

const currentRoom = laundryRooms.find(room => room.path === route);
const headings = {
  '/activeaza': 'Activează contul',
  '/autentificare': 'Autentificare',
  '/cont': 'Contul meu',
  '/notificari': 'Notificări',
  '/resurse': 'Resurse',
  '/sesizari': 'Sesizările mele',
  '/spalatorie': 'Resurse',
  ...Object.fromEntries(laundryRooms.map(room => [room.path, room.name])),
};

export const isResidentRoute = Object.hasOwn(headings, route);
if (isResidentRoute) {
  document.documentElement.lang = 'ro';
  document.title = headings[route] + ' · app-camin';
}

export default function ResidentAccess() {
  const legacyRoute = route === '/spalatorie';
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  useEffect(() => {
    if (legacyRoute) window.location.replace('/resurse');
  }, [legacyRoute]);

  const showNav = route === '/cont' || route === '/notificari' || route === '/resurse' || route === '/sesizari' || currentRoom;
  let content;
  if (route === '/cont') content = <Account />;
  else if (route === '/notificari') content = <Notifications onUnreadCount={setInboxUnreadCount} />;
  else if (route === '/sesizari') content = <LaundryReports />;
  else if (route === '/resurse' || currentRoom) content = <Resources room={currentRoom} />;
  else if (legacyRoute) content = <a href="/resurse">Deschide Resurse</a>;
  else content = <AccessForm activation={route === '/activeaza'} />;

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-20">
      {showNav && <ResidentNav inboxUnreadCount={inboxUnreadCount} />}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{headings[route]}</h1>
        {content}
      </div>
    </main>
  );
}
