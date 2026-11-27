import { useEffect, useRef, useState } from 'react';
import EquipmentManagement from './EquipmentManagement.jsx';
import AdminData, { AdminNav } from './AdminData.jsx';
import AdminAccessRequests from './AdminAccessRequests.jsx';
import { AccessForm, authRequest, CaminBrand, FirstLoginWelcome, InvitationReplacementLink } from './ResidentAccess.jsx';

const initial = { state: 'checking', message: 'Checking service…' };

async function checkService(path, signal) {
  try {
    const response = await fetch(path, { signal, cache: 'no-store' });
    if (response.status === 401 || response.status === 403) return { denied: response.status };
    const result = await response.json();
    if (!response.ok || result.status !== 'ok') {
      return { state: 'error', message: result.message || 'Service check failed.' };
    }
    return { state: 'success', message: result.message };
  } catch {
    return { state: 'error', message: 'Unable to reach the service. Check that Docker Compose is running, then try again.' };
  }
}

function StatusCard({ title, result }) {
  const labels = { checking: 'Checking', success: 'Connected', error: 'Unavailable' };
  const colors = { checking: 'bg-slate-100 text-slate-700', success: 'bg-emerald-100 text-emerald-900', error: 'bg-red-100 text-red-900' };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${colors[result.state]}`}>{labels[result.state]}</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{result.message}</p>
    </section>
  );
}

function ServiceStatus() {
  const [access, setAccess] = useState('checking');
  const [api, setApi] = useState(initial);
  const [database, setDatabase] = useState(initial);
  const [checking, setChecking] = useState(true);
  const active = useRef(null);

  async function refresh() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 6000);
    setChecking(true);
    setApi(initial);
    setDatabase(initial);
    setAccess('checking');
    try {
      const response = await fetch('/api/admin/access', { signal: controller.signal, cache: 'no-store' });
      if (active.current !== controller) return;
      if (response.status === 401) {
        window.location.replace('/autentificare');
        return;
      }
      if (response.status === 403) {
        setAccess('denied');
        return;
      }
      if (response.status !== 204) throw new Error('Access check failed');

      setAccess('allowed');
      const [apiResult, databaseResult] = await Promise.all([
        checkService('/api/health', controller.signal),
        checkService('/api/ready', controller.signal),
      ]);
      if (active.current !== controller) return;
      if (apiResult.denied === 401 || databaseResult.denied === 401) {
        setAccess('checking');
        window.location.replace('/autentificare');
      } else if (apiResult.denied || databaseResult.denied) {
        setAccess('denied');
      } else {
        setApi(apiResult);
        setDatabase(databaseResult);
      }
    } catch {
      if (active.current === controller) setAccess('unavailable');
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) setChecking(false);
    }
  }

  useEffect(() => {
    refresh();
    return () => { active.current?.abort(); active.current = null; };
  }, []);

  if (access !== 'allowed') {
    if (access === 'denied') return <Page title="Acces interzis"><HomeLink /></Page>;
    return (
      <Page title="Starea serviciilor">
        {access === 'checking' ? <p role="status">Se verifică accesul…</p> : <>
          <p role="alert">Verificarea accesului este indisponibilă.</p>
          <button type="button" className={actionStyle} onClick={refresh}>Încearcă din nou</button>
        </>}
      </Page>
    );
  }

  return (
    <main lang="en" className="mx-auto max-w-3xl px-5 py-12 sm:py-20">
      <AdminNav current="/admin/stare-servicii" role="admin" />
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Service status</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-600">Check the backend and PostgreSQL connection.</p>
      <div className="mt-8 grid gap-4" aria-live="polite" aria-atomic="true" aria-busy={checking}>
        <StatusCard title="REST API" result={api} />
        <StatusCard title="PostgreSQL" result={database} />
      </div>
      <button type="button" onClick={refresh} disabled={checking} className="mt-6 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 disabled:opacity-60">
        {checking ? 'Checking services…' : 'Check again'}
      </button>
    </main>
  );
}

const actionStyle = 'inline-block w-fit rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4';

function Page({ title, children }) {
  return (
    <main className="mx-auto grid max-w-lg gap-5 px-5 py-12 sm:py-20">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

function HomeLink() {
  return <a className="w-fit underline focus-visible:outline-2 focus-visible:outline-offset-4" href="/">Pagina principală</a>;
}

function Welcome() {
  const [unavailable, setUnavailable] = useState(false);
  const [accessMode, setAccessMode] = useState(() =>
    new URLSearchParams(window.location.search).get('invitatie') === 'noua' ? 'replacement' : 'sign-in');
  const requestAccess = accessMode !== 'sign-in';
  const replacement = accessMode === 'replacement';
  const [firstLogin, setFirstLogin] = useState(false);
  const sessionCheck = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    sessionCheck.current = controller;
    const timeout = setTimeout(() => controller.abort(), 6000);
    let active = true;
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session', { signal: controller.signal, cache: 'no-store' });
        if (!active || controller.signal.aborted) return;
        if (response.ok) window.location.replace('/resurse');
        else if (response.status !== 401) setUnavailable(true);
      } catch {
        if (active) setUnavailable(true);
      } finally {
        clearTimeout(timeout);
      }
    }
    checkSession();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  if (firstLogin) return <main lang="ro" className="camin-design standalone-access access-background">
    <div className="camin-panel"><CaminBrand /><FirstLoginWelcome /></div>
  </main>;

  return (
    <main lang="ro" className="camin-design welcome-page access-background">
      <div className="welcome-shell">
        <section className="welcome-intro">
          <CaminBrand />
          <h1>
            Bun venit în Căminul Meu
          </h1>
          <p className="camin-muted">
            Rezervările la spălătorie și sesizările din cămin, într-un singur loc.
          </p>
        </section>
        <section aria-labelledby="welcome-form-title" className="welcome-form">
          <h2 id="welcome-form-title">
            {replacement ? 'Solicită o altă invitație' : requestAccess ? 'Solicită acces' : 'Intră în cont'}
          </h2>
          {requestAccess ? <AccessRequestForm key={accessMode} replacement={replacement}
            onRequestAccess={() => setAccessMode('request')} /> : <AccessForm embedded onFirstLogin={() => {
            sessionCheck.current?.abort();
            setFirstLogin(true);
          }} />}
          <div className="welcome-footer">
            <span className="camin-muted">{requestAccess ? 'Ai deja cont?' : 'Ești nou aici?'}</span>
            <button type="button" className="camin-link" onClick={() => setAccessMode(requestAccess ? 'sign-in' : 'request')}>
              {requestAccess ? 'Înapoi la autentificare' : 'Solicită acces'}
            </button>
          </div>
          {!replacement && <div className="mt-3 text-sm"><InvitationReplacementLink /></div>}
          {unavailable && <p role="status" className="mt-4 text-sm text-slate-600">Sesiunea nu poate fi verificată momentan.</p>}
        </section>
      </div>
    </main>
  );
}

const accessFeedback = {
  received: 'Cererea a fost primită. Dacă este aprobată, vei primi un link de activare prin e-mail.',
  replacement_received: 'Am primit cererea pentru o altă invitație. Dacă este aprobată, vei primi noul link prin e-mail.',
  account_exists: 'Ai deja un cont. Autentifică-te sau folosește „Am uitat parola”.',
  rejected: 'Cererea ta de acces a fost respinsă.',
  pending: 'Ai deja o cerere în așteptarea aprobării.',
  invite_sent: 'A fost emisă deja o invitație pentru această adresă. Verifică e-mailul și folderul Spam.',
  invite_expired: 'Invitația ta a expirat. Poți solicita o altă invitație.',
  invite_unavailable: 'Linkul de activare nu mai este valabil. Poți solicita o altă invitație.',
  delivery_pending: 'Admin are deja cererea ta și poate continua trimiterea invitației.',
  no_invitation: 'Pentru această adresă nu a fost emisă o invitație. Trimite întâi o cerere de acces.',
  unavailable: 'Nu poți solicita o invitație pentru această adresă.',
};

function AccessRequestForm({ replacement, onRequestAccess }) {
  const [state, setState] = useState('ready');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setError('');
    setState('pending');
    try {
      const response = await authRequest('request-access', { email, replacement });
      const result = response.headers.get('x-camin-access-status');
      if (!Object.hasOwn(accessFeedback, result)) throw new Error('Missing access request result');
      setState(result);
    } catch (failure) {
      setState('ready');
      setError(failure.status ? failure.message : 'Cererea nu a putut fi trimisă. Încearcă din nou.');
    }
  }

  if (Object.hasOwn(accessFeedback, state)) {
    const tone = state === 'received' || state === 'replacement_received' ? 'success' : 'info';
    return <div className="mt-5 grid gap-3">
      <p role="status" className="camin-notice" data-tone={tone}>{accessFeedback[state]}</p>
      {state === 'account_exists' && <a className="camin-link" href="/am-uitat-parola">Am uitat parola</a>}
      {state === 'no_invitation' && <button type="button" className="camin-link" onClick={onRequestAccess}>Solicită acces</button>}
    </div>;
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <p className="text-sm leading-6 text-slate-600">{replacement
        ? 'Introdu adresa de e-mail folosită pentru invitația inițială.'
        : 'Trimite adresa ta de e-mail pentru a cere o invitație.'}</p>
      <label className="grid gap-2 font-medium">
        E-mail
        <input name="email" type="email" autoComplete="email" maxLength={254} required
          className="camin-control min-w-0" />
      </label>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button className="camin-primary" disabled={state === 'pending'}>
        {state === 'pending' ? 'Se trimite…' : 'Trimite cererea'}
      </button>
    </form>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin/echipamente') return <EquipmentManagement />;
  if (path === '/') return <Welcome />;
  if (path === '/admin/cereri-acces') return <AdminAccessRequests />;
  if (path === '/admin/stare-servicii') return <ServiceStatus />;
  if (path === '/admin/rezervari' || path === '/admin/baza-de-date') return <AdminData path={path} />;
  return <Page title="Pagina nu a fost găsită"><HomeLink /></Page>;
}
