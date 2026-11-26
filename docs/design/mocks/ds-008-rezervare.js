// Demonstration fixtures for the mock. No API or persistent storage is used.
const times = [
  { from: 480, to: 600, label: 'Liber', tone: 'success' },
  { from: 600, to: 680, label: 'Ocupat', tone: 'info' },
  { from: 680, to: 690, label: 'Predare', tone: 'warning' },
  { from: 690, to: 840, label: 'Liber', tone: 'success' },
  { from: 840, to: 960, label: 'Ocupat', tone: 'info' },
  { from: 960, to: 1200, label: 'Liber', tone: 'success' },
];

const dateLabels = ['Joi, 26 noiembrie', 'Vineri, 27 noiembrie', 'Sâmbătă, 28 noiembrie',
  'Duminică, 29 noiembrie', 'Luni, 30 noiembrie', 'Marți, 1 decembrie', 'Miercuri, 2 decembrie'];
const previews = {
  empty: 'Nu mai sunt intervale disponibile pentru această zi. Alege altă zi din calendar.',
  loading: 'Se încarcă intervalele pentru ziua aleasă…',
  error: 'Nu am putut încărca intervalele. Încearcă din nou.',
  closed: 'Spălătoria este închisă în ziua aleasă. Programul este luni–vineri, 08:00–20:00.',
};
const byId = id => document.getElementById(id);
const dayButtons = [...document.querySelectorAll('[data-day]')];
const scenario = byId('scenario');
const start = byId('start');
const end = byId('end');
let day = 0;
let dryer = false;

function time(minutes) {
  return [Math.floor(minutes / 60), minutes % 60].map(part => String(part).padStart(2, '0')).join(':');
}

const interval = (from, to) => time(from) + '–' + time(to);

function range(from, to) {
  return Array.from({ length: Math.max(0, (to - from) / 5 + 1) }, (_, index) => from + 5 * index);
}

function fill(select, values, value, label) {
  const placeholder = new Option(label, '', false, !values.includes(value));
  placeholder.disabled = true;
  select.replaceChildren(placeholder, ...values.map(minutes => new Option(time(minutes), minutes)));
  if (values.includes(value)) select.value = String(value);
}

function updateEnd(value) {
  const chosen = Number(start.value);
  const block = times.find(({ from, to, tone }) => tone === 'success' && chosen >= from && chosen < to);
  const endings = block ? range(chosen + 15, Math.min(block.to, 1195, chosen + (dryer ? 250 : 190))) : [];
  if (block?.to === 1200 && chosen >= (dryer ? 945 : 1005)) endings.push(1200);
  fill(end, endings, value, 'Alege ora');
  end.disabled = !endings.length;
  updateRecap();
}

function updateRecap() {
  const from = Number(start.value);
  const to = Number(end.value);
  const complete = Boolean(from && to);
  const useUntil = to === 1200 ? to : to - 10;
  byId('recap-empty').hidden = complete;
  byId('recap-values').hidden = !complete;
  byId('use-time').textContent = complete ? interval(from, useUntil) : '';
  byId('handover-row').hidden = useUntil === to;
  byId('handover-time').textContent = complete && useUntil !== to ? interval(useUntil, to) : '';
  byId('confirm').disabled = !complete;
}

function markReservation(block) {
  const from = Number(start.value);
  const to = Number(end.value);
  if (block.tone !== 'success' || block.from > from || to > block.to) return [block];
  const segments = [];
  if (block.from < from) segments.push({ ...block, to: from });
  segments.push({ from, to, label: 'Rezervarea ta', tone: 'success' });
  if (to < block.to) segments.push({ ...block, from: to });
  return segments;
}

function renderBlocks(state) {
  const blocks = byId('blocks');
  blocks.replaceChildren();
  if (state === 'loading') {
    for (let index = 0; index < 3; index++) {
      const placeholder = document.createElement('li');
      placeholder.className = 'skeleton';
      placeholder.setAttribute('aria-hidden', 'true');
      blocks.append(placeholder);
    }
    return;
  }
  if (previews[state]) return;
  const entries = state === 'success' ? times.flatMap(markReservation) : times;
  const longStatus = 'Indisponibil temporar. Un interval poate redeveni disponibil dacă rezervarea existentă este anulată.';
  for (const [index, { from, to, label, tone }] of entries.entries()) {
    const row = document.createElement('li');
    row.className = 'interval-row';
    const hours = document.createElement('strong');
    hours.textContent = interval(from, to);
    const status = document.createElement('span');
    status.className = 'interval-status ' + tone;
    status.textContent = state === 'long' && index === 1 ? longStatus : label;
    row.append(hours, status);
    blocks.append(row);
  }
}

function render({ preserve = false, preset = false } = {}) {
  const current = scenario.value;
  const state = [2, 3].includes(day) && ['ready', 'long'].includes(current) ? 'closed' : current;
  const message = previews[state];
  dryer = current === 'long' || (preserve && dryer);
  byId('equipment-tile').classList.toggle('dryer', dryer);
  byId('room').textContent = dryer ? 'Uscătoria · Grupul de echipamente de lângă accesul din corpul principal' : 'Spălătoria 1';
  byId('equipment').textContent = dryer
    ? 'Uscătorul 1 · Echipamentul din zona de lângă intrarea principală, la capătul coridorului de la subsol'
    : 'Mașina de spălat 1 · Subsol';
  byId('chosen-day').textContent = dateLabels[day];
  for (const [index, button] of dayButtons.entries()) button.setAttribute('aria-pressed', String(index === day));

  byId('blocks').setAttribute('aria-busy', String(state === 'loading'));
  byId('availability-message').hidden = !message;
  const status = byId('availability-status');
  status.className = 'notice info';
  status.hidden = !message || state === 'error';
  status.textContent = status.hidden ? '' : message;
  const error = byId('availability-error');
  error.className = 'notice error';
  error.hidden = state !== 'error';
  error.textContent = error.hidden ? '' : message;
  byId('retry').hidden = state !== 'error';

  const previous = preserve ? [Number(start.value), Number(end.value)] : preset ? [690, 750] : [0, 0];
  const starts = message ? [] : times.flatMap(({ from, to, tone }) =>
    tone === 'success' ? range(from, to - (to === 1200 ? 5 : 15)) : []);
  fill(start, starts, previous[0], 'Alege ora');
  updateEnd(previous[1]);
  renderBlocks(state);

  const booked = state === 'success';
  const success = byId('booking-success');
  success.hidden = !booked;
  success.textContent = booked ? 'Rezervarea a fost confirmată.' : '';
  byId('booking-unavailable').hidden = !message;
  byId('booking-form').hidden = Boolean(message);
  document.querySelector('.time-fields').hidden = booked;
  byId('confirm').hidden = booked;
}

scenario.addEventListener('change', () => {
  if (scenario.value === 'success' && [2, 3].includes(day)) day = 0;
  render({ preset: ['ready', 'long', 'success'].includes(scenario.value) });
});
dayButtons.forEach((button, index) => button.addEventListener('click', () => {
  day = index;
  if (scenario.value === 'success') scenario.value = 'ready';
  render();
}));
start.addEventListener('change', () => updateEnd());
end.addEventListener('change', updateRecap);
byId('retry').addEventListener('click', () => {
  scenario.value = 'ready';
  render();
  dayButtons[day].focus();
});
byId('booking-form').addEventListener('submit', event => {
  event.preventDefault();
  if (byId('confirm').disabled) return;
  scenario.value = 'success';
  render({ preserve: true });
  byId('booking-success').setAttribute('tabindex', '-1');
  byId('booking-success').focus();
});

render({ preset: true });
