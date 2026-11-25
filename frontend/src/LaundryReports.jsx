import { useEffect, useState } from 'react';

const endpoint = '/api/laundry-reports';
const button = 'min-h-11 rounded-lg border border-slate-400 px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50';
const labels = { new: 'Nouă', taken: 'Preluată', resolved: 'Rezolvată', verified: 'Verificată' };
const dateTime = new Intl.DateTimeFormat('ro-RO', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest',
});

async function reportRequest(path, { signal, body } = {}) {
  const response = await fetch(endpoint + path, {
    signal,
    ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (response.status === 401) window.location.replace('/autentificare');
  if (!response.ok) {
    throw new Error(response.status === 403 ? 'Nu ai permisiunea pentru această acțiune.'
      : response.status === 409 ? 'Starea s-a schimbat. Verifică sesizarea și încearcă din nou.'
        : 'Cererea nu a putut fi finalizată. Încearcă din nou.');
  }
  return response.status === 204 ? null : response.json();
}

export function ReportEquipment({ machine, onChange }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState(null);
  const field = 'descriere-defect-' + machine.id;

  async function submit(event) {
    event.preventDefault();
    if (busy || !description.trim()) return;
    setBusy(true);
    setError('');
    try {
      const report = await reportRequest('', { body: { machineId: machine.id, description } });
      setReportId(report.id);
      setDescription('');
      setOpen(false);
      onChange();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-2">
    {reportId && <p role="status">Sesizare trimisă.{' '}
      <a className="underline" href={'/sesizari#sesizare-' + reportId}>Vezi sesizarea</a>.
    </p>}
    {open ? <form onSubmit={submit} className="grid gap-2">
      <label htmlFor={field} className="font-medium">Descrie problema la {machine.name}</label>
      <textarea id={field} className="rounded-lg border border-slate-400 p-3" rows={4} maxLength={2000}
        required disabled={busy} value={description} onChange={event => setDescription(event.target.value)} />
      {error && <p role="alert" className="text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={button} disabled={busy || !description.trim()}>Trimite sesizarea</button>
        <button type="button" className={button} disabled={busy} onClick={() => setOpen(false)}>Renunță</button>
      </div>
    </form> : <button type="button" className={button} onClick={() => {
      setError('');
      setOpen(true);
    }}>Semnalează o defecțiune</button>}
  </div>;
}

export default function LaundryReports({ operator = false }) {
  const [items, setItems] = useState(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await reportRequest(operator ? '/operator' : '', { signal: controller.signal });
        if (!controller.signal.aborted) setItems(data.items);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message);
          setItems(null);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [operator, revision]);

  useEffect(() => {
    if (items && revision === 0 && /^#sesizare-\d+$/.test(window.location.hash)) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }
  }, [items, revision]);

  async function change(item, action) {
    if (busy) return;
    if (action === 'resolve' && !window.confirm('Confirmi că echipamentul funcționează și poți închide sesizarea?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await reportRequest('/' + item.id + '/' + action, {
        body: action === 'resolve' ? { machineRevision: item.machineRevision } : {},
      });
      setMessage(action === 'take' ? 'Sesizarea a fost preluată.'
        : action === 'resolve' ? 'Sesizarea a fost rezolvată și închisă.' : 'Remedierea a fost confirmată.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return <section className="mt-4 grid gap-4">
    {operator && <div className="flex flex-wrap items-center gap-4">
      <a className="underline" href="/notificari">Notificări și alerte pe dispozitiv</a>
      <button type="button" className={button} disabled={busy} onClick={() => {
        setError('');
        refresh();
      }}>Reîncarcă sesizările</button>
    </div>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {!items && !error && <p role="status">Se încarcă sesizările…</p>}
    {items?.length === 0 && <p>Nu sunt sesizări.</p>}
    {!!items?.length && <ul className="grid gap-3">
      {items.map(item => <li key={item.id} id={'sesizare-' + item.id}
        className="grid gap-2 rounded-xl border border-slate-300 p-4 target:border-slate-900">
        <h2 className="font-semibold">{item.machineName} · {item.location}</h2>
        <p className="font-semibold">{labels[item.status]}</p>
        <time className="text-sm text-slate-600" dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time>
        <p className="whitespace-pre-wrap break-words">{item.description}</p>
        {operator && (item.status === 'new' || item.status === 'taken') && <div className="flex flex-wrap items-center gap-3">
          <a className="underline" href={'/admin/echipamente?echipament=' + item.machineId}>Gestionează echipamentul</a>
          {item.status === 'new'
            ? <button type="button" className={button} disabled={busy} onClick={() => change(item, 'take')}>Preia sesizarea</button>
            : <button type="button" className={button} disabled={busy} onClick={() => change(item, 'resolve')}>
              {item.technicalStatus === 'working' ? 'Marchează rezolvată' : 'Rezolvă și repune în serviciu'}
            </button>}
        </div>}
        {!operator && item.status === 'resolved' && <button type="button" className={button}
          disabled={busy} onClick={() => change(item, 'verify')}>Confirm că problema s-a rezolvat</button>}
      </li>)}
    </ul>}
  </section>;
}
