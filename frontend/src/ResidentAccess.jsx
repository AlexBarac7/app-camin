import { useEffect, useState } from 'react';

const invalidLink = 'Invitația nu mai este valabilă. Cere o invitație nouă.';
const unavailable = 'Momentan nu putem finaliza cererea. Încearcă din nou.';
const buttonStyle = 'rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 disabled:opacity-60';

const route = window.location.pathname;
const invitation = route === '/activeaza' ? window.location.hash.slice(1) : '';
if (route === '/activeaza' && window.location.hash) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

async function authRequest(action, data) {
  const response = await fetch('/api/auth/' + action, data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.code === 'invalid_invitation' ? invalidLink : body.message;
    throw Object.assign(new Error(response.status >= 500 ? unavailable : message || unavailable), {
      status: response.status,
      invalidInvitation: body.code === 'invalid_invitation',
    });
  }
  return response;
}

function Field({ name, label, type, autoComplete, error }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={name} className="font-medium">{label}</label>
      <input id={name} name={name} type={type} autoComplete={autoComplete} required
        aria-invalid={error ? true : undefined} aria-describedby={error ? name + '-error' : undefined}
        className="w-full rounded-lg border border-slate-400 bg-white px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" />
      {error && <p id={name + '-error'} role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}

function AccessForm({ activation }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [invalid, setInvalid] = useState(activation && !/^[\w-]{43}$/.test(invitation));

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = data.get('password');
    setError('');
    setFieldErrors({});

    if (activation) {
      const length = Array.from(password).length;
      const errors = {};
      if (length < 15 || length > 128) errors.password = 'Alege o parolă între 15 și 128 de caractere.';
      if (password !== data.get('confirmation')) errors.confirmation = 'Parolele trebuie să coincidă.';
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        form.elements.namedItem(Object.keys(errors)[0]).focus();
        return;
      }
    }

    setPending(true);
    try {
      await authRequest(activation ? 'activate' : 'login', activation
        ? { token: invitation, password }
        : { email: data.get('email'), password });
      window.location.replace(activation ? '/autentificare' : '/cont');
    } catch (failure) {
      if (failure.invalidInvitation) setInvalid(true);
      else setError(failure.status ? failure.message : unavailable);
      setPending(false);
    }
  }

  if (invalid) return <p role="alert" className="mt-5 text-red-800">{invalidLink}</p>;

  return (
    <form onSubmit={submit} className="mt-6 grid gap-5">
      {!activation && <Field name="email" label="E-mail" type="email" autoComplete="username" />}
      <Field name="password" label="Parolă" type="password" error={fieldErrors.password}
        autoComplete={activation ? 'new-password' : 'current-password'} />
      {activation && <Field name="confirmation" label="Confirmă parola" type="password"
        error={fieldErrors.confirmation} autoComplete="new-password" />}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button className={buttonStyle} disabled={pending}>
        {pending ? 'Se trimite…' : activation ? 'Activează contul' : 'Autentifică-te'}
      </button>
    </form>
  );
}

function Account() {
  const [email, setEmail] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadAccount() {
      try {
        const response = await authRequest('session');
        const account = await response.json();
        if (active) setEmail(account.email);
      } catch (failure) {
        if (!active) return;
        if (failure.status === 401) window.location.replace('/autentificare');
        else setError(unavailable);
      }
    }
    loadAccount();
    return () => { active = false; };
  }, []);

  async function logout() {
    setPending(true);
    setError('');
    try {
      await authRequest('logout', {});
      window.location.replace('/autentificare');
    } catch {
      setError(unavailable);
      setPending(false);
    }
  }

  return (
    <div className="mt-5 grid gap-5">
      {email && <>
        <p className="break-all">{email}</p>
        <button type="button" className={buttonStyle} disabled={pending} onClick={logout}>
          {pending ? 'Se deconectează…' : 'Deconectare'}
        </button>
      </>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {!email && !error && <p role="status">Se verifică sesiunea…</p>}
    </div>
  );
}

const headings = {
  '/activeaza': 'Activează contul',
  '/autentificare': 'Autentificare',
  '/cont': 'Contul meu',
};

export const isResidentRoute = Object.hasOwn(headings, route);
if (isResidentRoute) {
  document.documentElement.lang = 'ro';
  document.title = headings[route] + ' · app-camin';
}

export default function ResidentAccess() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-20">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{headings[route]}</h1>
        {route === '/cont' ? <Account /> : <AccessForm activation={route === '/activeaza'} />}
      </div>
    </main>
  );
}
