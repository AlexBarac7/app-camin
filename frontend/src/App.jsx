import { useState } from 'react';
import { ServiceStatus } from './ServiceStatus.jsx';

const categories = ['Toate', 'Spălătorie', 'Bucătărie', 'Sală de studiu'];
const resources = [
  { name: 'Mașină de spălat 1', category: 'Spălătorie', available: true },
  { name: 'Mașină de spălat 2', category: 'Spălătorie', available: false },
  { name: 'Bucătărie comună', category: 'Bucătărie', available: true },
  { name: 'Sală de studiu', category: 'Sală de studiu', available: false },
];

const categoryIcons = {
  Spălătorie: '🧺',
  Bucătărie: '🍳',
  'Sală de studiu': '📚',
};

function ResidentHeader() {
  return (
    <header className="border-b border-teal-950/10">
      <div className="mx-auto max-w-6xl px-5 py-5">
        <a href="/" className="rounded text-lg font-bold hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-800">
          app-camin
        </a>
      </div>
    </header>
  );
}

function ResidentDashboard() {
  const [category, setCategory] = useState(categories[0]);
  const visibleResources = category === categories[0]
    ? resources
    : resources.filter(resource => resource.category === category);

  return (
    <div className="min-h-screen bg-[#faf8f3] text-teal-950">
      <ResidentHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Resursele căminului</h1>
        <p className="mt-4 text-slate-700">Date demonstrative. Disponibilitatea afișată este un exemplu.</p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div>
            <div role="group" aria-label="Filtrează resursele" className="mb-5 flex flex-wrap gap-2">
              {categories.map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={category === option}
                  onClick={() => setCategory(option)}
                  className="rounded-full border border-teal-800 px-4 py-2 text-sm font-semibold hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 aria-pressed:bg-teal-800 aria-pressed:text-white"
                >
                  {option}
                </button>
              ))}
            </div>

            <ul className="grid gap-4 sm:grid-cols-2" aria-label="Resurse comune" aria-live="polite">
              {visibleResources.map(resource => (
                <li key={resource.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-teal-950/10 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50">
                      {categoryIcons[resource.category]}
                    </span>
                    <h2 className="text-base font-semibold">{resource.name}</h2>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${resource.available ? 'bg-teal-100 text-teal-950' : 'bg-amber-100 text-amber-950'}`}>
                    {resource.available ? 'Disponibilă' : 'Ocupată'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <section aria-labelledby="announcements" className="rounded-2xl border border-teal-900/10 bg-teal-50 p-5">
            <h2 id="announcements" className="text-xl font-bold">Anunțuri</h2>
            <p className="mt-3 text-slate-700"><strong>Exemplu demonstrativ:</strong> Întrerupere temporară a apei în cămin.</p>
          </section>
        </div>
      </main>
    </div>
  );
}

function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#faf8f3] text-teal-950">
      <ResidentHeader />
      <main className="mx-auto grid w-full max-w-3xl flex-1 place-items-center px-5 py-12 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Bun venit în cămin!</h1>
          <p className="mx-auto mt-5 max-w-md text-lg text-slate-700">
            Locul unde poți rezerva resursele căminului cu un singur click
          </p>
          <a href="/resurse" className="mt-8 inline-flex rounded-full bg-teal-800 px-6 py-3 font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-800">
            Vezi resursele
          </a>
        </div>
      </main>
    </div>
  );
}

export default function App({ page }) {
  if (page === 'status') return <ServiceStatus />;
  if (page === 'resources') return <ResidentDashboard />;
  return <WelcomePage />;
}
