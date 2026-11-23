import { useEffect, useRef, useState } from 'react';

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
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let active = true;
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session', { signal: controller.signal, cache: 'no-store' });
        if (!active) return;
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

  return (
    <Page title="Bun venit la app-camin">
      <p>Consultă resursele comune ale căminului și vezi unde se află echipamentele de spălare și uscare.</p>
      <a className={actionStyle} href="/autentificare">Autentifică-te</a>
      {unavailable && <p role="status" className="text-sm text-slate-600">Sesiunea nu poate fi verificată momentan.</p>}
    </Page>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return <Welcome />;
  if (path === '/admin/stare-servicii') return <ServiceStatus />;
  return <Page title="Pagina nu a fost găsită"><HomeLink /></Page>;
}
