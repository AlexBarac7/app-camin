const reservationPath = /^\/spalatorie\/(?:1|2|uscatorie)\?echipament=[1-9]\d{0,9}&zi=\d{4}-\d{2}-\d{2}#rezervare-[1-9]\d{0,18}$/;
const accessRequestsPath = '/admin/cereri-acces';

export function portalSignInPath(location) {
  if (location.pathname === accessRequestsPath) return '/autentificare?cereri-acces=1';
  const target = location.pathname + location.search + location.hash;
  if (reservationPath.test(target)) {
    return '/autentificare?' + new URLSearchParams({ rezervare: target });
  }
  const notice = location.pathname === '/notificari' && /^#notificare-(\d+)$/.exec(location.hash)?.[1];
  return '/autentificare' + (notice ? '?notificare=' + notice : '');
}

export function portalAfterSignIn(search) {
  const params = new URLSearchParams(search);
  if (params.get('cereri-acces') === '1') return accessRequestsPath;
  const reservation = params.get('rezervare');
  if (reservationPath.test(reservation)) return reservation;
  const notice = params.get('notificare');
  return notice && /^\d+$/.test(notice) ? '/notificari#notificare-' + notice : '/resurse';
}
