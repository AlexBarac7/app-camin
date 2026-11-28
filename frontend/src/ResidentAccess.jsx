import LaundryStatus from './LaundryStatus.jsx';
import { useEffect, useRef, useState } from 'react';
import LaundryCalendar, { upcomingInterval } from './LaundryCalendar.jsx';
import Notifications, { disableDevicePush, syncDeviceBadge } from './Notifications.jsx';
import LaundryReports, { ReportEquipment } from './LaundryReports.jsx';
import UsageGuide from './UsageGuide.jsx';
import GuideLink, { guidePath } from './GuideLink.jsx';
import PortalIcon from './PortalIcon.jsx';
import { portalAfterSignIn, portalSignInPath } from './sign-in-return.js';
import logo from './camin-3-logo.png';

const invalidLink = 'Invitația nu mai este valabilă. Cere o invitație nouă.';
const invalidResetLink = 'Linkul de resetare nu mai este valabil. Cere un link nou.';
const unavailable = 'Momentan nu putem finaliza cererea. Încearcă din nou.';
const buttonStyle = 'camin-primary';
const authLinkStyle = 'camin-link';
const personalReportsPath = '/sesizari';
const operatorReportsPath = '/admin/sesizari';
const invitationReplacementPath = '/?invitatie=noua';

export function InvitationReplacementLink() {
  return <a className="camin-link" href={invitationReplacementPath}>Nu ai activat contul? Solicită o altă invitație</a>;
}

const route = window.location.pathname.replace(/\/+$/, '') || '/';
const tokenRoute = route === '/activeaza' || route === '/reseteaza-parola';
const linkToken = tokenRoute ? window.location.hash.slice(1) : '';
if (tokenRoute && window.location.hash) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export async function authRequest(action, data) {
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
      code: body.code,
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
        className="camin-control w-full" />
      {error && <p id={name + '-error'} role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}

export function FirstLoginWelcome() {
  const heading = useRef(null);
  useEffect(() => { heading.current.focus(); }, []);
  return <div className="first-login-welcome">
    <h1 ref={heading} tabIndex={-1}>Bun venit în Căminul Meu!</h1>
    <p className="camin-muted">Contul tău este activ. Vezi cum folosești aplicația sau mergi direct la resurse.</p>
    <div className="first-login-actions">
      <a className="camin-primary" href={guidePath}>Consultă ghidul</a>
      <a className="camin-control" href="/resurse">Mergi la resurse</a>
    </div>
  </div>;
}

export function AccessForm({ activation = false, reset = false, embedded = false, onFirstLogin }) {
  const choosePassword = activation || reset;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [invalid, setInvalid] = useState(choosePassword && !/^[\w-]{43}$/.test(linkToken));
  const [changed, setChanged] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = data.get('password');
    setError('');
    setFieldErrors({});

    if (choosePassword) {
      const length = Array.from(password).length;
      const errors = {};
      if (length < 8 || length > 128) errors.password = 'Alege o parolă între 8 și 128 de caractere.';
      if (password !== data.get('confirmation')) errors.confirmation = 'Parolele trebuie să coincidă.';
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        form.elements.namedItem(Object.keys(errors)[0]).focus();
        return;
      }
    }

    setPending(true);
    try {
      const response = await authRequest(reset ? 'reset-password' : activation ? 'activate' : 'login', choosePassword
        ? { token: linkToken, password }
        : { email: data.get('email'), password });
      if (reset) {
        setChanged(true);
        return;
      }
      if (activation) {
        window.location.replace('/autentificare');
        return;
      }
      if ((await response.json().catch(() => null))?.showWelcome === true) {
        onFirstLogin();
        return;
      }
      window.location.replace(portalAfterSignIn(window.location.search));
    } catch (failure) {
      if (failure.code === 'invalid_invitation' || failure.code === 'invalid_password_reset') setInvalid(true);
      else setError(failure.status ? failure.message : unavailable);
      setPending(false);
    }
  }

  if (changed) return <div className="mt-5 grid gap-4">
    <p role="status" className="rounded-xl bg-teal-50 p-4 text-teal-950">Parola ta a fost schimbată</p>
    <a className={authLinkStyle} href="/autentificare">Înapoi la autentificare</a>
  </div>;
  if (invalid) return <div className="mt-5 grid gap-4">
    <p role="alert" className="text-red-800">{reset ? invalidResetLink : invalidLink}</p>
    {reset ? <a className={authLinkStyle} href="/am-uitat-parola">Cere un link nou</a> : <InvitationReplacementLink />}
  </div>;

  return (
    <form onSubmit={submit} className={embedded ? 'mt-5 grid gap-4' : 'mt-6 grid gap-5'}>
      {!choosePassword && <Field name="email" label="E-mail" type="email" autoComplete="username" />}
      <Field name="password" label={reset ? 'Parola nouă' : activation ? 'Alege o parolă' : 'Parolă'} type="password" error={fieldErrors.password}
        autoComplete={choosePassword ? 'new-password' : 'current-password'} />
      {choosePassword && <Field name="confirmation" label={reset ? 'Confirmă parola nouă' : 'Confirmă parola'} type="password"
        error={fieldErrors.confirmation} autoComplete="new-password" />}
      {!choosePassword && <a className={authLinkStyle} href="/am-uitat-parola">Am uitat parola</a>}
      {!choosePassword && !embedded && <InvitationReplacementLink />}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button className={buttonStyle} disabled={pending}>
        {pending ? 'Se trimite…' : reset ? 'Schimbă parola' : activation ? 'Activează contul' : 'Autentifică-te'}
      </button>
    </form>
  );
}

function PasswordResetRequest() {
  const [state, setState] = useState('ready');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setError('');
    setState('pending');
    try {
      await authRequest('request-password-reset', { email });
      setState('sent');
    } catch (failure) {
      setState('ready');
      setError(failure.status ? failure.message : unavailable);
    }
  }

  return <div className="mt-5 grid gap-5">
    {state === 'sent' ? <p role="status" className="rounded-xl bg-teal-50 p-4 text-teal-950">
      Dacă există un cont cu această adresă, vei primi un link de resetare prin e-mail.
    </p> : <form className="grid gap-4" onSubmit={submit}>
      <Field name="email" label="E-mail" type="email" autoComplete="email" />
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button className={buttonStyle} disabled={state === 'pending'}>
        {state === 'pending' ? 'Se trimite…' : 'Trimite linkul de resetare'}
      </button>
    </form>}
    <a className={authLinkStyle} href="/autentificare">Înapoi la autentificare</a>
  </div>;
}

function Account({ account }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    setError('');
    try {
      await disableDevicePush().catch(() => {});
      await authRequest('logout', {});
      await syncDeviceBadge(0);
      window.location.replace('/autentificare');
    } catch {
      setError(unavailable);
      setPending(false);
    }
  }

  return (
    <div className="mt-5 grid gap-5">
      {account && <>
        <dl className="grid gap-3">
          <div><dt className="text-sm font-medium text-slate-600">E-mail</dt><dd className="break-all">{account.email}</dd></div>
          <div><dt className="text-sm font-medium text-slate-600">Rol</dt>
            <dd className="font-semibold">{{ admin: 'Admin', administrator: 'Administrator', resident: 'Rezident' }[account.role]}</dd>
          </div>
        </dl>
        {account.role !== 'resident' && (
          <nav aria-label="Administrare" className="grid gap-2 border-t border-slate-200 pt-4">
            {account.role === 'admin' && <a className="underline" href="/admin/cereri-acces">Cereri de acces și roluri</a>}
            <a className="underline" href="/admin/echipamente">Gestionează echipamentele</a>
            <a className="underline" href={operatorReportsPath}>Sesizări de întreținere</a>
            <a className="underline" href="/admin/rezervari">Istoricul rezervărilor</a>
            {account.role === 'admin' && <>
              <a className="underline" href="/admin/stare-servicii">Starea serviciilor</a>
              <a className="underline" href="/admin/baza-de-date">Baza de date</a>
            </>}
          </nav>
        )}
        <button type="button" className={buttonStyle} disabled={pending} onClick={logout}>
          {pending ? 'Se deconectează…' : 'Deconectare'}
        </button>
      </>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
    </div>
  );
}

const laundryRooms = [
  { id: '1', path: '/spalatorie/1', name: 'Spălătoria 1', accent: 'wash-first' },
  { id: '2', path: '/spalatorie/2', name: 'Spălătoria 2', accent: 'wash-second' },
  { id: 'uscatorie', path: '/spalatorie/uscatorie', name: 'Uscătoria', accent: 'dry' },
];

function ResidentNav({ inboxUnreadCount, canManage }) {
  const [unreadCount, setUnreadCount] = useState(null);
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
        if (response.status === 401 && !controller.signal.aborted) setUnreadCount(null);
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
  useEffect(() => { void syncDeviceBadge(count); }, [count]);
  return (
    <nav id="resident-navigation" aria-label="Navigare principală" className="resident-navigation">
      {[['/resurse', 'Resurse', 'resources'],
        [canManage ? operatorReportsPath : personalReportsPath, canManage ? 'Sesizări' : 'Sesizările mele', 'reports', 'Sesizări'],
        ['/notificari', 'Notificări', 'bell'], ['/cont', 'Contul meu', 'account', 'Cont']].map(([path, label, icon, mobileLabel]) => {
        const showCount = path === '/notificari' && count > 0;
        const profile = path === '/cont';
        const current = route === path ? 'page' : path === '/resurse' && currentRoom ? 'location' : undefined;
        return <a key={path} href={path} aria-current={current} className={profile ? 'resident-profile' : undefined}>
          {profile && <span className="resident-avatar" aria-hidden="true">C</span>}
          <span className="resident-nav-icon"><PortalIcon name={icon} /></span>
          <span className={mobileLabel ? 'resident-nav-full-label' : undefined}>{label}</span>
          {mobileLabel && <span className="resident-nav-short-label">{mobileLabel}</span>}
          {showCount && <>
            <span aria-hidden="true" className="resident-unread">
              {count}
            </span>
            <span className="sr-only">{count === 1 ? ', 1 mesaj necitit' : ', ' + count + ' mesaje necitite'}</span>
          </>}
        </a>;
      })}
    </nav>
  );
}

export function CaminBrand() {
  return <a className="camin-brand" href="/"><img src={logo} alt="" width="44" height="44" /><span>Cămin 3</span></a>;
}

function EquipmentArt({ accent }) {
  return <span aria-hidden="true" className="equipment-art" data-accent={accent}>
    <span className="equipment-drawing"><span /></span>
  </span>;
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

function EquipmentCard({ machine, selected, onSelect, onChange, canReport }) {
  const dryer = machine.type === 'dryer';

  return (
    <li className={'camin-panel equipment-card' + (selected ? ' equipment-selected' : '')}>
      <div className="equipment-card-heading">
        <EquipmentArt accent={dryer ? 'dry' : 'wash-first'} />
        <div className="min-w-0">
          <h2>{dryer ? 'Uscător' : 'Mașină de spălat'} {machine.label}</h2>
          <p className="camin-muted">{machine.location}</p>
          <span className="mt-2 flex flex-wrap gap-2">
            <LaundryStatus status={machine.status}>{occupancy[machine.status]}</LaundryStatus>
            {machine.status === 'occupied' && machine.technicalStatus === 'inspection' &&
              <LaundryStatus status="inspection">Verificare după ciclu</LaundryStatus>}
            {Date.parse(machine.repairVerifiedUntil) > Date.now() &&
              <span className="camin-tag" data-tone="success">
                <span aria-hidden="true">✓ </span>Remediere verificată
              </span>}
          </span>
          {machine.nextReservation && <span className="mt-2 block text-sm">
            Următoarea rezervare · {upcomingInterval(machine.nextReservation)}
          </span>}
        </div>
      </div>
      <div className="equipment-card-actions">
        <div className="grid gap-2 text-sm">
          <p><strong>Stare tehnică</strong> · <LaundryStatus status={machine.technicalStatus}>{technicalStatus[machine.technicalStatus]}</LaundryStatus></p>
          <p><strong>Program</strong> · luni–vineri, 08:00–20:00</p>
        </div>
        <div className="grid items-start gap-3">
          <button type="button" className={machine.status === 'available' && !selected ? buttonStyle : 'camin-control'}
            aria-expanded={selected} aria-controls={selected ? `calendar-${machine.id}` : undefined} onClick={onSelect}>
            {selected ? 'Închide calendarul' : 'Vezi calendarul'}
          </button>
          {canReport && <ReportEquipment machine={machine} onChange={onChange} />}
        </div>
      </div>
      {selected && <div id={`calendar-${machine.id}`} className="equipment-calendar"><LaundryCalendar machine={machine} onChange={onChange} /></div>}
    </li>
  );
}

function Resources({ room, canManage }) {
  const [machines, setMachines] = useState(() => room ? null : []);
  const [selectedMachine, setSelectedMachine] = useState(() =>
    Number(new URLSearchParams(window.location.search).get('echipament')) || null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!room) return;
    const controller = new AbortController();
    let timer;
    const refresh = () => setRevision(value => value + 1);
    function refreshOnReturn() {
      if (!document.hidden) refresh();
    }

    async function loadResources() {
      let refreshAfter = 30_000;
      try {
        const response = await fetch('/api/laundry-machines?availability=1', {
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.replace(portalSignInPath(window.location));
          return;
        }
        if (!response.ok) throw new Error(unavailable);
        const inventory = (await response.json()).filter(machine => machine.room === room.id);
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
        if (!controller.signal.aborted) timer = setTimeout(refresh, refreshAfter);
      }
    }

    loadResources();
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [room, revision]);

  return (
    <div className="mt-5 grid gap-4">
      {!room && canManage && <a className="w-fit rounded py-2 underline" href="/admin/echipamente">Gestionează echipamentele</a>}
      {error && <p role="alert" className="text-red-800">{unavailable}</p>}
      {!machines && !error && <p role="status">Se încarcă inventarul…</p>}
      {machines && (room ? (
        machines.length ? (
          <ul className="resident-card-grid equipment-grid">
            {machines.map(machine => <EquipmentCard key={machine.id} machine={machine}
              selected={selectedMachine === machine.id}
              canReport={!canManage}
              onSelect={() => setSelectedMachine(selectedMachine === machine.id ? null : machine.id)}
              onChange={() => setRevision(value => value + 1)} />)}
          </ul>
        ) : <p role="status">Inventarul acestei încăperi nu a fost încă publicat.</p>
      ) : (
        <ul className="resident-card-grid">
          {laundryRooms.map(item => (
            <li key={item.id}>
              <a href={item.path} className="camin-panel resource-card">
                <EquipmentArt accent={item.accent} />
                <span className="resource-card-copy"><strong>{item.name}</strong><span className="camin-muted">Subsol</span></span>
                <span className="resource-card-action"><span>Vezi echipamentele</span><span aria-hidden="true">→</span></span>
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
  '/am-uitat-parola': 'Am uitat parola',
  '/autentificare': 'Autentificare',
  '/cont': 'Contul meu',
  [guidePath]: 'Ghid de utilizare',
  '/notificari': 'Notificări',
  '/reseteaza-parola': 'Resetează parola',
  '/resurse': 'Resurse',
  [personalReportsPath]: 'Sesizările mele',
  [operatorReportsPath]: 'Sesizări de întreținere',
  '/spalatorie': 'Resurse',
  ...Object.fromEntries(laundryRooms.map(room => [room.path, room.name])),
};

export const isResidentRoute = Object.hasOwn(headings, route);
if (isResidentRoute) {
  document.documentElement.lang = 'ro';
  document.title = headings[route] + ' · Căminul Meu';
}

export default function ResidentAccess() {
  const legacyRoute = route === '/spalatorie';
  const reportsRoute = route === personalReportsPath || route === operatorReportsPath;
  const guide = route === guidePath;
  const inbox = route === '/notificari';
  const helpTopic = reportsRoute ? 'sesizari' : inbox ? 'notificari' : route === '/resurse' || currentRoom ? 'rezervari' : undefined;
  const showNav = Boolean(guide || route === '/cont' || inbox
    || route === '/resurse' || reportsRoute || currentRoom);
  const [account, setAccount] = useState(null);
  const [sessionError, setSessionError] = useState(false);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(null);
  const [firstLogin, setFirstLogin] = useState(false);
  useEffect(() => {
    if (legacyRoute) window.location.replace('/resurse');
  }, [legacyRoute]);

  useEffect(() => {
    if (!showNav) return;
    const controller = new AbortController();
    async function loadAccount() {
      try {
        const response = await fetch('/api/auth/session', { signal: controller.signal, cache: 'no-store' });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.location.replace(portalSignInPath(window.location));
          return;
        }
        if (!response.ok) throw new Error(unavailable);
        const current = await response.json();
        if (controller.signal.aborted) return;
        if (route === personalReportsPath && current.role !== 'resident') {
          window.location.replace(operatorReportsPath + window.location.hash);
          return;
        }
        setAccount(current);
      } catch {
        if (!controller.signal.aborted) setSessionError(true);
      }
    }
    loadAccount();
    return () => controller.abort();
  }, [showNav]);

  const canManage = account?.role === 'admin' || account?.role === 'administrator';
  let content;
  if (showNav && !account) content = sessionError ? <p role="alert">{unavailable}</p> : <p role="status">Se verifică sesiunea…</p>;
  else if (guide) content = <UsageGuide reportsPath={canManage ? operatorReportsPath : personalReportsPath} canManage={canManage} />;
  else if (route === '/cont') content = <Account account={account} />;
  else if (route === '/am-uitat-parola') content = <PasswordResetRequest />;
  else if (inbox) content = <Notifications onUnreadCount={setInboxUnreadCount} canAnnounce={account.role === 'administrator'} />;
  else if (route === operatorReportsPath) content = canManage
    ? <LaundryReports operator heading={headings[route]} />
    : <div className="grid gap-3"><h1>Acces interzis</h1><a className={authLinkStyle} href={personalReportsPath}>Sesizările mele</a></div>;
  else if (route === personalReportsPath) content = <LaundryReports heading={headings[route]} />;
  else if (route === '/resurse' || currentRoom) content = <Resources room={currentRoom} canManage={canManage} />;
  else if (legacyRoute) content = <a href="/resurse">Deschide Resurse</a>;
  else content = <AccessForm activation={route === '/activeaza'} reset={route === '/reseteaza-parola'}
    onFirstLogin={() => setFirstLogin(true)} />;

  if (showNav) return (
    <div className="camin-design resident-shell">
      <aside className="resident-sidebar">
        <CaminBrand />
        {account && <ResidentNav inboxUnreadCount={inboxUnreadCount} canManage={canManage} />}
      </aside>
      <main className="resident-page">
        <div className="resident-toolbar">
          <div className="resident-mobile-brand"><CaminBrand /></div>
          {account && !guide && <GuideLink section={helpTopic} />}
        </div>
        {currentRoom && <p className="resident-breadcrumb"><a href="/resurse">Resurse</a> / {currentRoom.name}</p>}
        {!reportsRoute && !guide && !inbox && <h1>{route === '/resurse' ? 'Resursele căminului' : headings[route]}</h1>}
        {route === '/resurse' && <p className="camin-muted">Alege spațiul pe care dorești să îl utilizezi.</p>}
        <div className={route === '/cont' ? 'camin-panel resident-account' : undefined}>{content}</div>
      </main>
    </div>
  );

  return <main className={'camin-design standalone-access' + (route === '/autentificare' ? ' access-background' : '')}>
    <div className="camin-panel"><CaminBrand />
      {firstLogin ? <FirstLoginWelcome /> : <><h1>{headings[route]}</h1>{content}</>}
    </div>
  </main>;
}
