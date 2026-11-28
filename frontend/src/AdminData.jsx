import LaundryStatus from './LaundryStatus.jsx';
import { useEffect, useState } from 'react';

const dateTime = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short',
});
const formatDate = value => value ? dateTime.format(new Date(value)) : '—';
const control = 'min-w-0 rounded-lg border border-slate-400 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
const tables = [
  ['equipment', 'Echipamente', 'laundry_machines'],
  ['reservations', 'Rezervări', 'laundry_reservations'],
  ['migrations', 'Migrări', 'schema_migrations'],
];

export function AdminNav({ current, role }) {
  const links = [
    ['/admin/stare-servicii', 'Starea serviciilor'],
    ['/admin/rezervari', 'Rezervări'],
    ['/admin/baza-de-date', 'Baza de date'],
    ['/admin/cereri-acces', 'Cereri de acces'],
  ];
  return (
    <nav lang="ro" aria-label="Administrare" className="flex flex-wrap gap-x-5 gap-y-2">
      <a href="/cont" className="rounded py-1 underline focus-visible:outline-2 focus-visible:outline-offset-2">Contul meu</a>
      {links.filter(([href]) => role === 'admin' || href === '/admin/rezervari').map(([href, label]) => (
        <a key={href} href={href} aria-current={href === current ? 'page' : undefined}
          className="rounded py-1 underline focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:font-bold">
          {label}
        </a>
      ))}
    </nav>
  );
}

function useData(path) {
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.location.replace('/autentificare');
          return;
        }
        if (response.status === 403) {
          setResult({ path, retry, denied: true });
          return;
        }
        if (!response.ok) throw new Error();
        const data = response.status === 204 ? true : await response.json();
        if (!controller.signal.aborted) setResult({ path, retry, data });
      } catch {
        if (!controller.signal.aborted) setResult({ path, retry, error: true });
      }
    }
    load();
    return () => controller.abort();
  }, [path, retry]);

  const current = result?.path === path && result.retry === retry ? result : {};
  return { ...current, reload: () => setRetry(value => value + 1) };
}

function DataPage({ title, path, result, authorized, controls, children }) {
  useEffect(() => {
    document.title = title + ' · Căminul Meu';
  }, [title]);

  if (result.denied || authorized.denied) {
    return (
      <main lang="ro" className="mx-auto grid max-w-lg gap-5 px-5 py-12">
        <h1 className="text-3xl font-bold">Acces interzis</h1>
        <a className="w-fit underline" href="/">Pagina principală</a>
      </main>
    );
  }

  return (
    <main lang="ro" className="mx-auto grid max-w-5xl gap-5 px-5 py-12">
      {authorized.allowed && <AdminNav current={path} role={authorized.data.role} />}
      <h1 className="text-3xl font-bold">{title}</h1>
      {authorized.allowed && controls}
      {result.data ? children : result.error || authorized.error ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert">Datele sunt indisponibile momentan.</p>
          <button type="button" className={control}
            onClick={authorized.error ? authorized.reload : result.reload}>Încearcă din nou</button>
        </div>
      ) : <p role="status">Se încarcă…</p>}
    </main>
  );
}

function Pager({ page, hasNext, onPage }) {
  return (
    <nav aria-label="Paginare" className="flex flex-wrap items-center gap-3">
      <button type="button" className={control} disabled={page === 1} onClick={() => onPage(page - 1)}>Pagina anterioară</button>
      <span>Pagina {page}</span>
      <button type="button" className={control} disabled={!hasNext} onClick={() => onPage(page + 1)}>Pagina următoare</button>
    </nav>
  );
}

function cellValue({ name, type, render }, row) {
  return render ? render(row) : type === 'timestamptz' ? formatDate(row[name]) : row[name] ?? '—';
}

function DataTable({ label, columns, rows }) {
  return (
    <div tabIndex={0} role="region" aria-label={label}
      className="overflow-x-auto rounded-lg border border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100">
          <tr>{columns.map(({ name, label, type }) => (
            <th key={name} scope="col" className="px-4 py-3">
              {label ?? name}
              {type && <span className="block font-normal text-slate-600">{type}</span>}
            </th>
          ))}</tr>
        </thead>
        <tbody>{rows.map(row => (
          <tr key={row.id ?? row.version} className="border-t border-slate-200">
            {columns.map(column => (
              <td key={column.name} className="min-w-24 px-4 py-3 align-top">{cellValue(column, row)}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
      {!rows.length && <p className="border-t border-slate-200 px-4 py-3">Nu sunt rezultate.</p>}
    </div>
  );
}

const reservationColumns = [
  { name: 'id', label: 'ID' },
  { name: 'equipment', label: 'Echipament', render: row => <>{row.equipment}<br />{row.location}</> },
  { name: 'usage', label: 'Utilizare', render: row => <>{formatDate(row.starts_at)}<br />{formatDate(row.use_ends_at)}</> },
  { name: 'handover', label: 'Predare', render: row => row.use_ends_at === row.ends_at ? '—'
    : <>{formatDate(row.use_ends_at)}<br />{formatDate(row.ends_at)}</> },
  { name: 'status', label: 'Stare', render: row => row.cancelled_at
    ? <LaundryStatus status="cancelled">Anulată</LaundryStatus> : <LaundryStatus status="reserved">Activă</LaundryStatus> },
  { name: 'cancellation_reason', label: 'Motiv' },
  { name: 'cancelled_at', label: 'Anulată la', type: 'timestamptz' },
];

function AttendancePolicy({ policy, onSave }) {
  return <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onSave('/api/admin/reservation-attendance-policy', 'PUT', {
      strikeWindowDays: Number(fields.get('window')),
      suspensionHours: Number(fields.get('hours')),
    }, 'Regula a fost salvată.');
  }}>
    <label className="grid gap-1">
      Fereastra strike-urilor (zile)
      <input name="window" type="number" required min="1" className={control} defaultValue={policy.strikeWindowDays} />
    </label>
    <label className="grid gap-1">
      Suspendare (ore)
      <input name="hours" type="number" required min="1" className={control} defaultValue={policy.suspensionHours} />
    </label>
    <button className={control}>Salvează regula</button>
  </form>;
}

function AdminReservations({ path, authorized }) {
  const [filters, setFilters] = useState({ machineId: '', day: '', status: '' });
  const [page, setPage] = useState(1);
  const reservationId = new URLSearchParams(window.location.search).get('rezervare');
  const params = new URLSearchParams({ page });
  if (reservationId) params.set('reservationId', reservationId);
  else for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const result = useData(authorized.allowed ? '/api/admin/reservations?' + params : null);
  const equipment = useData(authorized.allowed && !reservationId ? '/api/laundry-machines' : null);
  const policy = useData(authorized.allowed && !reservationId ? '/api/admin/reservation-attendance-policy' : null);
  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  async function saveAttendance(url, method, body, message) {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (response.status === 401) {
        window.location.replace('/autentificare');
        return;
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message ?? 'Modificarea nu a putut fi salvată.');
      }
      setEditing(null);
      setFeedback({ message });
      if (method === 'PUT') policy.reload();
      else result.reload();
    } catch (error) {
      setFeedback({ message: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  const columns = [...reservationColumns, {
    name: 'strike_resident_email', label: 'Rezident', render: row =>
      <span className="[overflow-wrap:anywhere]">{row.strike_resident_email ?? '—'}</span>,
  }, {
    name: 'strike', label: 'Strike', render: row => {
      if (!row.strike_at) return '—';
      if (row.corrected_at) return <>Corectat · {row.correction_reason}</>;
      if (editing !== row.id) {
        return <button className={control} onClick={() => setEditing(row.id)}>Corectează strike-ul</button>;
      }
      return <form className="grid gap-2" onSubmit={event => {
        event.preventDefault();
        const reason = new FormData(event.currentTarget).get('reason');
        saveAttendance('/api/admin/reservations/' + row.id + '/strike-correction', 'POST', { reason }, 'Strike-ul a fost corectat.');
      }}>
        <label className="grid gap-1">
          Motivul corecției
          <input name="reason" required maxLength={500} className={control} />
        </label>
        <button className={control} disabled={saving}>Confirmă corecția</button>
        <button type="button" className={control} disabled={saving} onClick={() => setEditing(null)}>Renunță</button>
      </form>;
    },
  }];


  function filter(event) {
    const { name, value } = event.target;
    setFilters(previous => ({ ...previous, [name]: value }));
    setPage(1);
  }

  return (
    <DataPage title={reservationId ? 'Rezervare' : 'Rezervări'} path={path} result={result} authorized={authorized} controls={
      <>
        {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
        {reservationId ? <a className="w-fit underline" href="/admin/rezervari">Toate rezervările</a> : <>
          {policy.data && <fieldset disabled={saving} className="grid gap-2">
            <legend className="font-semibold">Regulă de neprezentare</legend>
            <AttendancePolicy policy={policy.data} onSave={saveAttendance} />
          </fieldset>}
          {policy.error && <button type="button" className={control + ' w-fit'} onClick={policy.reload}>
            Reîncarcă regula de neprezentare
          </button>}
          <div className="grid items-end gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <label htmlFor="admin-equipment">Echipament</label>
              <select id="admin-equipment" className={control} name="machineId" value={filters.machineId} onChange={filter}>
                <option value="">Toate echipamentele</option>
                {equipment.data?.map(machine => (
                  <option key={machine.id} value={machine.id}>{machine.name} · {machine.location}</option>
                ))}
              </select>
            </div>
            <label className="grid gap-1">
              Zi
              <input className={control} name="day" type="date" value={filters.day} onChange={filter} />
            </label>
            <div className="grid gap-1">
              <label htmlFor="admin-reservation-status">Stare</label>
              <select id="admin-reservation-status" className={control} name="status" value={filters.status} onChange={filter}>
                <option value="">Toate stările</option>
                <option value="active">Active</option>
                <option value="cancelled">Anulate</option>
              </select>
            </div>
          </div>
          {equipment.error && <button type="button" className={control + ' w-fit'} onClick={equipment.reload}>
            Reîncarcă echipamentele
          </button>}
        </>}
      </>
    }>
      {result.data && (reservationId
        ? result.data.items[0] ? <dl className="grid gap-4 rounded-lg border border-slate-300 p-4 sm:grid-cols-2">
          {columns.map(column => <div key={column.name}>
            <dt className="font-semibold">{column.label}</dt>
            <dd>{cellValue(column, result.data.items[0])}</dd>
          </div>)}
        </dl> : <p>Rezervarea nu a fost găsită.</p>
        : <>
          <DataTable label="Rezervări" columns={columns} rows={result.data.items} />
          <Pager page={page} hasNext={result.data.hasNext} onPage={setPage} />
        </>)}
    </DataPage>
  );
}

function AdminDatabase({ path, authorized }) {
  const [table, setTable] = useState(tables[0][0]);
  const [page, setPage] = useState(1);
  const result = useData(authorized.allowed ? '/api/admin/database/' + table + '?page=' + page : null);
  const [, label, sqlName] = tables.find(([key]) => key === table);

  return (
    <DataPage title="Baza de date" path={path} result={result} authorized={authorized} controls={
      <div className="grid w-fit gap-1">
        <label htmlFor="admin-database-table">Tabel</label>
        <select id="admin-database-table" className={control} value={table} onChange={event => {
          setTable(event.target.value);
          setPage(1);
        }}>
          {tables.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
    }>
      {result.data && <>
        <h2 className="text-lg font-semibold">{label} <code className="text-sm font-normal">{sqlName}</code></h2>
        <DataTable label={label} columns={result.data.columns} rows={result.data.rows} />
        <Pager page={page} hasNext={result.data.hasNext} onPage={setPage} />
      </>}
    </DataPage>
  );
}

export default function AdminData({ path }) {
  const access = useData('/api/auth/session');
  const reservations = path === '/admin/rezervari';
  const role = access.data?.role;
  const allowed = role === 'admin' || (reservations && role === 'administrator');
  const authorized = { ...access, allowed, denied: access.denied || (Boolean(role) && !allowed) };
  return reservations ? <AdminReservations path={path} authorized={authorized} />
    : <AdminDatabase path={path} authorized={authorized} />;
}
