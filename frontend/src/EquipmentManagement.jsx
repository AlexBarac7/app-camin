import LaundryStatus from './LaundryStatus.jsx';
import { useEffect, useState } from 'react';

const labels = {
  available: 'Disponibil', occupied: 'În utilizare', handover: 'Predare',
  broken: 'Defect', inspection: 'În verificare', unspecified: 'Stare neprecizată',
};
const actions = {
  inspect: 'Verifică după ciclu', stop: 'Scoate din funcțiune', restore: 'Repune în serviciu',
};
const control = 'min-h-11 rounded-lg border border-slate-400 bg-white px-4 py-2 font-medium disabled:opacity-50';

async function checked(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) window.location.replace('/autentificare');
  if (!response.ok) throw new Error(response.status === 403 ? 'Nu ai permisiunea de a gestiona echipamente.'
    : response.status === 409 ? 'Starea s-a schimbat. Verifică echipamentul și încearcă din nou.'
    : 'Cererea nu a putut fi finalizată. Încearcă din nou.');
  return response;
}

export default function EquipmentManagement() {
  const [machines, setMachines] = useState([]);
  const [selected, select] = useState('');
  const [revision, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const machine = machines.find(item => String(item.id) === selected);
  useEffect(() => {
    document.documentElement.lang = 'ro';
    document.title = 'Gestionare echipamente · Cămin';
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function load() {
      try {
        await checked('/api/equipment-access', options);
        const response = await checked('/api/laundry-machines?availability=1', options);
        const list = await response.json();
        if (!controller.signal.aborted) setMachines(list.filter(item => item.room));
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message);
          setMachines([]);
        }
      }
    }
    load();
    const timer = setTimeout(() => refresh(value => value + 1), 30000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);

  async function change(action) {
    if (action === 'stop' && !window.confirm('Scoți din funcțiune ' + machine.name + ' din ' + machine.location +
        '? Rezervarea în curs se încheie și rezervările viitoare se anulează.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await checked('/api/laundry-machines/' + machine.id + '/condition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      setMessage('Starea echipamentului a fost actualizată.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      refresh(value => value + 1);
    }
  }

  return <main className="mx-auto grid max-w-2xl gap-5 px-4 py-6 sm:px-8 sm:py-10">
    <a className="w-fit py-2 underline" href="/resurse">Înapoi la Resurse</a>
    <h1 className="text-3xl font-bold">Gestionare echipamente</h1>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {message && <p role="status">{message}</p>}
    {machines.length > 0 && <div className="grid gap-2 font-medium"><label htmlFor="managed-equipment">Echipament</label>
      <select id="managed-equipment" className={control + ' w-full'} disabled={busy} value={selected} onChange={event => {
        select(event.target.value); setMessage(''); setError('');
      }}>
        <option value="">Alege echipamentul</option>
        {machines.map(item => <option key={item.id} value={item.id}>{item.location} · {item.name}</option>)}
      </select>
    </div>}
    {machine && <section className="grid gap-4 rounded-xl border border-slate-300 p-4">
      <h2 className="text-xl font-semibold">{machine.name}</h2>
      <p className="flex flex-wrap gap-2">
        <LaundryStatus status={machine.status}>{labels[machine.status]}</LaundryStatus>
        {machine.technicalStatus === 'inspection' && machine.status === 'occupied' &&
          <LaundryStatus status="inspection">Verificare după ciclu</LaundryStatus>}
      </p>
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {Object.entries(actions).filter(([action]) => action === 'inspect'
          ? machine.status === 'occupied' && machine.technicalStatus === 'working'
          : action === 'restore' ? ['broken','inspection'].includes(machine.technicalStatus)
          : machine.technicalStatus !== 'broken').map(([action, label]) =>
          <button key={action} className={control} disabled={busy} onClick={() => change(action)}>{label}</button>)}
      </div>
    </section>}
  </main>;
}
