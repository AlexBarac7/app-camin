import { useEffect, useState } from 'react';
import ReportPhoto from './ReportPhoto.jsx';

const endpoint = '/api/laundry-reports';
const button = 'min-h-11 rounded-lg border border-slate-400 px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50';
const field = 'min-h-11 w-full rounded-lg border border-slate-400 bg-white p-2';
const labels = { new: 'Nouă', taken: 'Preluată', resolved: 'Rezolvată', verified: 'Verificată' };
const priorities = { low: 'Scăzută', normal: 'Normală', urgent: 'Urgentă' };
const categories = {
  'laundry-equipment': 'Echipament de spălătorie',
  plumbing: 'Apă și instalații sanitare',
  electrical: 'Electricitate și iluminat',
  furniture: 'Mobilier și amenajări',
  cleaning: 'Curățenie',
  other: 'Altă problemă',
};
const dateTime = new Intl.DateTimeFormat('ro-RO', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest',
});
const imageTypes = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

async function reportRequest(path, { signal, body } = {}) {
  const options = body instanceof FormData ? { method: 'POST', body }
    : body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const response = await fetch(endpoint + path, { signal, ...options });
  if (response.status === 401) window.location.replace('/autentificare');
  if (!response.ok) {
    const messages = {
      403: 'Nu ai permisiunea pentru această acțiune.',
      409: 'Starea s-a schimbat. Verifică sesizarea și încearcă din nou.',
      413: 'Poza depășește limita de 10 MB.',
      422: 'Poza nu a putut fi citită. Alege o imagine JPEG, PNG, WebP sau HEIC.',
      503: 'Fotografiile nu sunt disponibile momentan. Încearcă din nou sau trimite sesizarea fără poză.',
    };
    throw new Error(messages[response.status] || 'Cererea nu a putut fi finalizată. Încearcă din nou.');
  }
  return response.status === 204 ? null : response.json();
}

function ReportForm({ machine, onCancel, onSaved }) {
  const [locationType, setLocationType] = useState('room');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const suffix = machine?.id ?? 'general';

  function choosePhoto(event) {
    const image = event.target.files[0];
    event.target.value = '';
    if (!image) return;
    if (image.size > 10 * 1024 * 1024) {
      setError('Poza depășește limita de 10 MB.');
      return;
    }
    setPhoto(image);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !description.trim()) return;
    const form = new FormData(event.currentTarget);
    if (photo) form.set('photo', photo);
    setBusy(true);
    setError('');
    try {
      const report = await reportRequest('', { body: form });
      onSaved(report.id);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-3">
    <fieldset className="grid gap-3" disabled={busy}>
      {machine ? <input type="hidden" name="machineId" value={machine.id} /> : <>
        <label className="grid gap-1 font-medium">Categorie
          <select name="category" className={field} required defaultValue="">
            <option value="" disabled>Alege categoria</option>
            {Object.entries(categories).filter(([value]) => value !== 'laundry-equipment').map(([value, label]) =>
              <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-medium">Tipul locației
          <select name="locationType" className={field} value={locationType}
            onChange={event => setLocationType(event.target.value)}>
            <option value="room">Cameră</option>
            <option value="shared">Spațiu comun</option>
          </select>
        </label>
        <label className="grid gap-1 font-medium">{locationType === 'room' ? 'Numărul camerei' : 'Denumirea spațiului'}
          <input key={locationType} name="location" className={field} maxLength={120} required />
        </label>
        <label className="grid gap-1 font-medium">Etaj (opțional)
          <input name="floor" className={field} maxLength={40} />
        </label>
      </>}
      <label className="grid gap-1 font-medium" htmlFor={'descriere-defect-' + suffix}>
        {machine ? 'Descrie problema la ' + machine.name : 'Descrie problema'}
        <textarea id={'descriere-defect-' + suffix} name="description" className={field}
          rows={4} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} required />
      </label>
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium">Fotografie (opțional)</legend>
        <label className={button + ' w-fit cursor-pointer focus-within:outline-2'}>
          Încarcă o poză
          <input type="file" accept={imageTypes} className="sr-only" onChange={choosePhoto} />
        </label>
        {photo && <div className="flex flex-wrap items-center gap-2">
          <span className="break-all">{photo.name}</span>
          <button type="button" className={button} onClick={() => {
            setPhoto(null);
            setError('');
          }}>Elimină poza</button>
        </div>}
      </fieldset>
    </fieldset>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="submit" className={button} disabled={busy || !description.trim()}>Trimite sesizarea</button>
      <button type="button" className={button} disabled={busy} onClick={onCancel}>Renunță</button>
    </div>
  </form>;
}

export function ReportEquipment({ machine, onChange }) {
  const [open, setOpen] = useState(false);
  const [reportId, setReportId] = useState(null);
  return <div className="grid gap-2">
    {reportId && <p role="status">Sesizare trimisă.{' '}
      <a className="underline" href={'/sesizari#sesizare-' + reportId}>Vezi sesizarea</a>.
    </p>}
    {open ? <ReportForm machine={machine} onCancel={() => setOpen(false)} onSaved={id => {
      setReportId(id);
      setOpen(false);
      onChange();
    }} /> : <button type="button" className={button} onClick={() => setOpen(true)}>Semnalează o defecțiune</button>}
  </div>;
}

export default function LaundryReports({ operator = false }) {
  const [items, setItems] = useState(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
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

  async function change(item, action, priority) {
    if (busy) return;
    if (action === 'resolve' && !window.confirm(item.machineId
      ? 'Confirmi că echipamentul funcționează și poți închide sesizarea?'
      : 'Confirmi că problema s-a rezolvat și poți închide sesizarea?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await reportRequest('/' + item.id + '/' + action, {
        body: action === 'take' ? { priority } : action === 'resolve' && item.machineId
          ? { machineRevision: item.machineRevision } : {},
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
    {operator ? <div className="flex flex-wrap items-center gap-4">
      <a className="underline" href="/notificari">Notificări și alerte pe dispozitiv</a>
      <button type="button" className={button} disabled={busy} onClick={() => {
        setError('');
        refresh();
      }}>Reîncarcă sesizările</button>
    </div> : open ? <ReportForm onCancel={() => setOpen(false)} onSaved={() => {
      setOpen(false);
      setError('');
      setMessage('Sesizare trimisă.');
      refresh();
    }} /> : <button type="button" className={button + ' justify-self-start'} onClick={() => {
      setMessage('');
      setOpen(true);
    }}>Sesizare nouă</button>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {!items && !error && <p role="status">Se încarcă sesizările…</p>}
    {items?.length === 0 && <p>Nu sunt sesizări.</p>}
    {!!items?.length && <ul className="grid gap-3">
      {items.map(item => <li key={item.id} id={'sesizare-' + item.id}
        className="grid gap-2 rounded-xl border border-slate-300 p-4 target:border-slate-900">
        <h2 className="font-semibold">{item.machineName ?? categories[item.category]}</h2>
        <p className="break-words">{item.locationType === 'room' && 'Camera '}{item.location}
          {item.floor && ' · Etaj: ' + item.floor}</p>
        <p className="font-semibold">{labels[item.status]} · Prioritate: {priorities[item.priority] ?? 'Nestabilită'}</p>
        <time className="text-sm text-slate-600" dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time>
        <p className="whitespace-pre-wrap break-words">{item.description}</p>
        {item.hasPhoto && <ReportPhoto src={endpoint + '/' + item.id + '/photo'} />}
        {operator && (item.status === 'new' || item.status === 'taken') && <div className="grid gap-3">
          {item.machineId && <a className="w-fit underline"
            href={'/admin/echipamente?echipament=' + item.machineId}>Gestionează echipamentul</a>}
          {item.status === 'new'
            ? <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
              event.preventDefault();
              change(item, 'take', new FormData(event.currentTarget).get('priority'));
            }}>
              <label className="grid gap-1 font-medium">Prioritate
                <select name="priority" className={field} defaultValue="" required disabled={busy}>
                  <option value="" disabled>Alege prioritatea</option>
                  {Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button type="submit" className={button} disabled={busy}>Preia sesizarea</button>
            </form>
            : <button type="button" className={button + ' justify-self-start'} disabled={busy}
              onClick={() => change(item, 'resolve')}>
              {item.machineId && item.technicalStatus !== 'working' ? 'Rezolvă și repune în serviciu' : 'Marchează rezolvată'}
            </button>}
        </div>}
        {!operator && item.status === 'resolved' && <button type="button" className={button}
          disabled={busy} onClick={() => change(item, 'verify')}>Confirm că problema s-a rezolvat</button>}
      </li>)}
    </ul>}
  </section>;
}
