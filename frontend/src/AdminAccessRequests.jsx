import { useEffect, useState } from 'react';
import { AdminNav } from './AdminData.jsx';
import { portalSignInPath } from './sign-in-return.js';

const field = 'min-w-0 rounded-lg border border-slate-400 bg-white px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2';
const button = 'w-fit rounded-lg bg-teal-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60';
const rejectButton = 'w-fit rounded-lg border border-red-700 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60';
const dateTime = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short',
});

async function adminRequest(path, body, signal) {
  const response = await fetch('/api/admin/' + path, {
    signal, cache: 'no-store',
    ...(body !== undefined && {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  });
  if (response.status === 401) window.location.replace(portalSignInPath(window.location));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.message || 'Cererea nu a putut fi finalizată. Încearcă din nou.'), { status: response.status });
  }
  return response.status === 204 ? null : response.json();
}

function AccountRoleForm() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(null);

  async function save(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setStatus(null);
    try {
      await adminRequest('account-role', { email: data.get('email'), role: data.get('role') });
      setStatus({ message: 'Rolul a fost salvat.' });
    } catch (error) {
      setStatus({ message: error.message, error: true });
    } finally {
      setPending(false);
    }
  }

  return <section className="grid gap-3 border-t border-slate-200 pt-6">
    <h2 className="text-xl font-semibold">Schimbă rolul unui cont activ</h2>
    <form className="grid gap-3" onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          E-mailul contului
          <input className={field} name="email" type="email" autoComplete="off" maxLength={254} required />
        </label>
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor="account-role">Rol</label>
          <select id="account-role" name="role" className={field}>
            <option value="resident">Rezident</option>
            <option value="administrator">Administrator</option>
          </select>
        </div>
      </div>
      <button className={button} disabled={pending}>{pending ? 'Se salvează…' : 'Salvează rolul'}</button>
      {status && <p className={status.error ? 'text-sm text-red-800' : 'text-sm text-teal-900'}
        role={status.error ? 'alert' : 'status'}>{status.message}</p>}
    </form>
  </section>;
}

export default function AdminAccessRequests() {
  const [requests, setRequests] = useState(null);
  const [sent, setSent] = useState(null);
  const [problem, setProblem] = useState(null);
  const [pending, setPending] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => { document.title = 'Cereri de acces · Căminul Meu'; }, []);

  useEffect(() => {
    const controller = new AbortController();
    adminRequest('access-requests', undefined, controller.signal).then(setRequests).catch(error => {
      if (!controller.signal.aborted) setProblem({ message: error.message, denied: error.status === 403 });
    });
    return () => controller.abort();
  }, [reload]);

  async function send(request, action) {
    const rejection = action === 'reject' || action === 'retry-rejection';
    setPending(request.id);
    setProblem(null);
    setSent(null);
    try {
      await adminRequest('access-requests/' + request.id + '/' + action, {});
      setSent({ email: request.email, rejection });
      setRequests(current => current.filter(item => item.id !== request.id));
    } catch (error) {
      if (error.status === 502) {
        setRequests(current => current.map(item => item.id === request.id
          ? { ...item, delivery: 'failed', ...(rejection && { rejected: true }) } : item));
      } else if (!error.status || error.status === 409 || error.status === 500) {
        setReload(attempt => attempt + 1);
      }
      setProblem({ message: error.message, denied: error.status === 403 });
    } finally {
      setPending(null);
    }
  }

  return <main lang="ro" className="mx-auto grid max-w-3xl gap-6 px-5 py-9 sm:py-14">
    {requests && !problem?.denied && <AdminNav current="/admin/cereri-acces" role="admin" />}
    <h1 className="text-3xl font-bold tracking-tight">Cereri de acces</h1>
    {sent && <p role="status" className="break-all rounded-xl bg-teal-50 p-4 text-sm text-teal-950">
      {sent.rejection ? 'Cererea a fost respinsă. E-mailul a fost trimis la ' : 'Invitația a fost trimisă la '}
      <strong>{sent.email}</strong>.
    </p>}
    {problem && <p role="alert" className="text-red-800">
      {problem.denied ? 'Ai nevoie de rolul Admin pentru această pagină.' : problem.message}
    </p>}
    {problem?.denied && <a href="/cont" className="w-fit underline">Contul meu</a>}
    {!requests && !problem && <p role="status">Se încarcă cererile…</p>}
    {!requests && problem && !problem.denied && <button type="button" className={button} onClick={() => {
      setProblem(null);
      setReload(attempt => attempt + 1);
    }}>Încearcă din nou</button>}
    {requests && !problem?.denied && <>
      {requests.length ? <ul className="grid gap-3">
        {requests.map(request => <li key={request.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="min-w-0">
            <p className="break-all font-semibold">{request.email}</p>
            <time className="text-sm text-slate-600" dateTime={request.requestedAt}>{dateTime.format(new Date(request.requestedAt))}</time>
            {request.rejected && <p className="text-sm font-medium">Cerere respinsă</p>}
            {request.delivery === 'failed' && <p className="text-sm text-red-800">Trimiterea necesită o nouă încercare.</p>}
          </div>
          {request.delivery === 'sending' ? <button type="button" className={button} disabled={pending !== null}
            onClick={() => setReload(attempt => attempt + 1)}>Verifică starea trimiterii</button>
            : <div className="flex flex-wrap gap-2">
              <button type="button" className={button} disabled={pending !== null}
                onClick={() => send(request, request.rejected ? 'retry-rejection' : request.delivery === 'failed' ? 'retry' : 'approve')}>
                {pending === request.id ? 'Se procesează…' : request.rejected ? 'Reîncearcă e-mailul de respingere'
                  : request.delivery === 'failed' ? 'Reîncearcă trimiterea' : 'Aprobă și trimite invitația'}
              </button>
              {request.delivery === 'pending' && <button type="button" className={rejectButton} disabled={pending !== null} onClick={() => {
                if (window.confirm('Respingi cererea de acces? Aplicația va trimite un e-mail de informare.')) {
                  void send(request, 'reject');
                }
              }}>Respinge cererea</button>}
            </div>}
        </li>)}
      </ul> : <p className="text-sm text-slate-600">Nu sunt cereri în așteptare.</p>}
      <AccountRoleForm />
    </>}
  </main>;
}
