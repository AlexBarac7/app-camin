import { useEffect, useRef } from 'react';

export const guidePath = '/ghid-de-utilizare';
const portalRoutes = new Set([
  '/resurse', '/cont', '/notificari', '/sesizari', '/admin/sesizari',
  '/spalatorie/1', '/spalatorie/2', '/spalatorie/uscatorie',
]);

export function guideReturnPath(value) {
  if (!value?.startsWith('/')) return '/resurse';
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin && portalRoutes.has(url.pathname.replace(/\/+$/, ''))) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // A malformed address falls back to the resources page.
  }
  return '/resurse';
}

export default function GuideLink({ section, label = 'Deschide ghidul de utilizare', returnPath, id }) {
  const link = useRef(null);
  const { pathname, search, hash } = window.location;
  const destination = returnPath ?? (pathname + search + hash);
  const query = new URLSearchParams({ inapoi: destination });

  useEffect(() => {
    if (id && window.location.hash === '#' + id) link.current.focus();
  }, [id]);

  return <a ref={link} id={id} className="portal-icon-button portal-help"
    href={guidePath + '?' + query + (section ? '#' + section : '')} aria-label={label} title={label}>
    <span aria-hidden="true">?</span>
  </a>;
}
