import { useEffect, useRef, useState } from 'react';
import ReportPhoto from './ReportPhoto.jsx';

const endpoint = '/api/notifications/announcements';
const unavailable = 'Cererea nu a putut fi finalizată. Încearcă din nou.';
const photoLimit = 4;
const publishErrors = {
  413: 'O poză depășește limita de 10 MB.',
  422: 'O poză nu a putut fi citită. Alege imagini JPEG, PNG, WebP sau HEIC.',
  503: 'Fotografiile nu sunt disponibile momentan. Încearcă din nou sau trimite anunțul fără poze.',
};
const dateTime = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short',
});

async function announcementRequest(path, options) {
  const response = await fetch(endpoint + path, { cache: 'no-store', ...options });
  if (response.status === 401) window.location.replace('/autentificare');
  if (!response.ok) throw new Error(publishErrors[response.status] || unavailable);
  return response.json();
}

export function AnnouncementPhotos({ id, photoIds }) {
  if (!photoIds.length) return null;
  return <div className="flex flex-wrap gap-2">
    {photoIds.map((photoId, index) => {
      const label = 'Fotografia ' + (index + 1) + ' a anunțului';
      return <ReportPhoto key={photoId} src={endpoint + '/' + id + '/photos/' + photoId} label={label} alt={label} />;
    })}
  </div>;
}

function AnnouncementForm({ onCancel, onPublished }) {
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(null);

  function choosePhotos(event) {
    const selected = Array.from(event.target.files);
    event.target.value = '';
    if (!selected.length) return;
    if (photos.length + selected.length > photoLimit) {
      setError('Poți atașa până la 4 poze.');
    } else if (selected.some(photo => photo.size > 10 * 1024 * 1024)) {
      setError(publishErrors[413]);
    } else {
      requestId.current = null;
      setPhotos(current => [...current, ...selected]);
      setError('');
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      requestId.current ??= crypto.randomUUID();
      const body = new FormData();
      body.set('message', message);
      body.set('requestId', requestId.current);
      for (const photo of photos) body.append('photos', photo);
      await announcementRequest('', { method: 'POST', body });
      onPublished();
    } catch (failure) {
      setError(failure instanceof TypeError ? unavailable : failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <form id="formular-anunt" className="camin-panel grid gap-3" onSubmit={submit}>
    <p>Anunțul va fi trimis tuturor rezidenților cu cont în aplicație.</p>
    <fieldset className="grid gap-3" disabled={busy}>
      <label className="grid gap-1 font-medium">
        Mesaj
        <textarea className="w-full rounded-lg border border-slate-400 bg-white p-2" rows={4}
          value={message} maxLength={2000} required onChange={event => {
            requestId.current = null;
            setMessage(event.target.value);
          }} />
      </label>
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <label className="camin-control w-fit cursor-pointer focus-within:outline-2">
            Fă o poză
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={choosePhotos} />
          </label>
          <label className="camin-control w-fit cursor-pointer focus-within:outline-2">
            Încarcă poze
            <input type="file" multiple className="sr-only"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={choosePhotos} />
          </label>
        </div>
        <p className="camin-muted">Până la 4 poze, fiecare de cel mult 10 MB.</p>
        {photos.map((photo, index) => <div key={index} className="flex flex-wrap items-center gap-2">
          <span className="break-all">{photo.name}</span>
          <button className="camin-control" type="button" aria-label={'Elimină poza ' + photo.name} onClick={() => {
            requestId.current = null;
            setPhotos(current => current.filter((_photo, position) => position !== index));
            setError('');
          }}>Elimină</button>
        </div>)}
      </div>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="notice-actions">
      <button type="submit" className="camin-primary" disabled={busy || !message.trim()}>
        {busy ? 'Se trimite…' : 'Trimite'}
      </button>
      <button type="button" className="camin-control" disabled={busy} onClick={onCancel}>Anulează</button>
    </div>
  </form>;
}

function AnnouncementDetails({ announcement }) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState(null);
  const [feedback, setFeedback] = useState('');

  async function showDetails(event) {
    const expanded = event.currentTarget.open;
    setOpen(expanded);
    if (!expanded) return;
    setRecipients(null);
    setFeedback('');
    try {
      const details = await announcementRequest('/' + announcement.id);
      setRecipients(details.recipients);
    } catch {
      setFeedback(unavailable);
    }
  }

  return <details className="camin-panel grid gap-2" onToggle={showDetails}>
    <summary className="cursor-pointer font-medium">
      <span>{announcement.message.length > 80 ? announcement.message.slice(0, 80) + '…' : announcement.message}</span>
      {' · '}<time dateTime={announcement.createdAt}>{dateTime.format(new Date(announcement.createdAt))}</time>
    </summary>
    {open && <div className="mt-3 grid gap-2">
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{announcement.message}</p>
      <AnnouncementPhotos id={announcement.id} photoIds={announcement.photoIds} />
      {feedback ? <p role="alert">{feedback}</p> : recipients ? <>
        <p><strong>{recipients.filter(row => row.confirmedAt).length} din {recipients.length}</strong> au confirmat citirea.</p>
        <ul className="grid gap-1">
          {recipients.map(({ email, confirmedAt }) => <li key={email} className="[overflow-wrap:anywhere]">
            {email} · {confirmedAt ? 'Confirmat la ' + dateTime.format(new Date(confirmedAt)) : 'Fără confirmare'}
          </li>)}
        </ul>
      </> : <p role="status">Se încarcă confirmările…</p>}
    </div>}
  </details>;
}

export default function AdminAnnouncements() {
  const [compose, setCompose] = useState(false);
  const [sent, setSent] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [published, setPublished] = useState(0);
  const toggle = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    announcementRequest('', { signal: controller.signal }).then(setSent).catch(() => {
      if (!controller.signal.aborted) setFeedback(unavailable);
    });
    return () => controller.abort();
  }, [published]);

  function closeComposer() {
    setCompose(false);
    toggle.current?.focus();
  }

  return <section className="grid gap-3">
    <button ref={toggle} type="button" className="camin-primary w-fit"
      aria-expanded={compose} aria-controls={compose ? 'formular-anunt' : undefined}
      onClick={() => { setFeedback(''); setCompose(true); }}>
      Anunță rezidenții
    </button>
    {compose && <AnnouncementForm onCancel={closeComposer} onPublished={() => {
      closeComposer();
      setFeedback('Anunțul a fost publicat.');
      setPublished(current => current + 1);
    }} />}
    {feedback && <p role="status">{feedback}</p>}
    {sent?.length > 0 && <div className="grid gap-2">
      <h2 className="font-semibold">Anunțuri trimise</h2>
      {sent.map(announcement => <AnnouncementDetails key={announcement.id} announcement={announcement} />)}
    </div>}
  </section>;
}
