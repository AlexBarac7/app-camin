import { useEffect, useRef, useState } from 'react';

const initial = { state: 'checking', message: 'Checking service…' };

async function checkService(path, signal) {
  try {
    const response = await fetch(path, { signal, cache: 'no-store' });
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

export default function App() {
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
    try {
      await Promise.all([
        checkService('/api/health', controller.signal).then(result => {
          if (active.current === controller) setApi(result);
        }),
        checkService('/api/ready', controller.signal).then(result => {
          if (active.current === controller) setDatabase(result);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) setChecking(false);
    }
  }

  useEffect(() => {
    refresh();
    return () => { active.current?.abort(); active.current = null; };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-20">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">app-camin · Local development</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Service status</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-600">A technical starting point for shared resource management. This page checks the backend and PostgreSQL connection.</p>
      <div className="mt-8 grid gap-4" aria-live="polite" aria-atomic="true" aria-busy={checking}>
        <StatusCard title="REST API" result={api} />
        <StatusCard title="PostgreSQL" result={database} />
      </div>
      <button type="button" onClick={refresh} disabled={checking} className="mt-6 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 disabled:opacity-60">
        {checking ? 'Checking services…' : 'Check again'}
      </button>
      <a href="/autentificare" lang="ro" className="ml-4 underline focus-visible:outline-2 focus-visible:outline-offset-4">Autentificare</a>
      <p className="mt-8 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-500">No interview findings or business data are represented here. Reservations, queues, usage quotas, no-show policies, maintenance tickets and push notifications are not implemented.</p>
    </main>
  );
}
