const green = 'bg-green-100 text-green-900';
const purple = 'bg-purple-100 text-purple-900';
const dark = 'bg-slate-800 text-white';
const colors = {
  available: green,
  working: green,
  occupied: purple,
  reserved: purple,
  inspection: 'bg-yellow-200 text-yellow-950',
  handover: 'bg-blue-100 text-blue-900',
  unavailable: dark,
  cancelled: dark,
  broken: 'bg-red-100 text-red-900',
  unspecified: 'bg-slate-200 text-slate-800',
};

export default function LaundryStatus({ status, children }) {
  return <span data-laundry-status={status} className={'inline-block rounded-md px-2 py-1 text-sm font-semibold ' + colors[status]}>
    {children}
  </span>;
}
