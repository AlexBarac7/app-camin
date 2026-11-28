import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const photoAlt = 'Fotografia atașată sesizării';
const control = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/45 px-3 font-medium text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-45';

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function PhotoViewer({ src, onClose, label, alt }) {
  const dialog = useRef(null);
  const stage = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const scrollTarget = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const viewer = dialog.current;
    const area = stage.current;
    if (!viewer.open) viewer.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const measure = () => setViewport({ width: area.clientWidth, height: area.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => {
      observer.disconnect();
      document.body.style.overflow = overflow;
    };
  }, []);

  useLayoutEffect(() => {
    if (scrollTarget.current) {
      stage.current.scrollTo(scrollTarget.current);
      scrollTarget.current = null;
    }
  }, [zoom]);

  const fit = image ? Math.min(viewport.width / image.width, viewport.height / image.height) : 0;
  const width = image ? image.width * fit * zoom : 0;
  const height = image ? image.height * fit * zoom : 0;

  function zoomTo(value, point) {
    const next = Math.max(1, Math.min(4, value));
    if (next === zoom || !width || !height) return;
    const area = stage.current;
    const bounds = area.getBoundingClientRect();
    const x = point ? point.x - bounds.left : area.clientWidth / 2;
    const y = point ? point.y - bounds.top : area.clientHeight / 2;
    const offset = (space, span) => Math.max(0, (space - span) / 2);
    const ratio = next / zoom;
    scrollTarget.current = {
      left: (area.scrollLeft + x - offset(area.clientWidth, width)) * ratio
        + offset(area.clientWidth, width * ratio) - x,
      top: (area.scrollTop + y - offset(area.clientHeight, height)) * ratio
        + offset(area.clientHeight, height * ratio) - y,
    };
    setZoom(next);
  }

  function startDrag(event) {
    if (event.button !== 0 || pointers.current.size >= 2) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { distance: distance(...pointers.current.values()), zoom };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePhoto(event) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pinch.current?.distance) {
      const other = [...pointers.current.values()].find(value => value !== point);
      zoomTo(pinch.current.zoom * distance(point, other) / pinch.current.distance,
        { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 });
    } else {
      stage.current.scrollLeft -= point.x - previous.x;
      stage.current.scrollTop -= point.y - previous.y;
    }
  }

  function releasePointer(event) {
    if (pointers.current.delete(event.pointerId)) pinch.current = null;
  }

  return <dialog ref={dialog} aria-label={label} onClose={onClose}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-slate-950 text-white backdrop:bg-slate-950">
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <h2 className="font-semibold">{label}</h2>
        <button type="button" className={control + ' text-2xl'} aria-label="Închide fotografia"
          onClick={() => dialog.current.close()}>×</button>
      </header>
      <div ref={stage} role="region" aria-label="Zonă de vizualizare" tabIndex={0}
        onPointerDown={startDrag} onPointerMove={movePhoto}
        onPointerUp={releasePointer} onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}
        className={'min-h-0 flex-1 touch-none overflow-auto overscroll-contain [scrollbar-width:none] ' +
          (zoom > 1 ? 'cursor-grab active:cursor-grabbing' : '')}>
        <div className="grid min-h-full min-w-full place-items-center" style={{ width, height }}>
          {failed ? <p role="status" className="p-4 text-center">Fotografia nu este disponibilă momentan.</p>
            : <img src={src} alt={alt} draggable={false} className="pointer-events-none max-w-none select-none"
              style={{ width, height }} onError={() => setFailed(true)} onLoad={event => {
                setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
              }} />}
        </div>
      </div>
      <div role="group" aria-label="Zoom fotografie"
        className="flex flex-wrap items-center justify-center gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" className={control} aria-label="Micșorează"
          disabled={!width || zoom <= 1} onClick={() => zoomTo(zoom / 1.5)}>−</button>
        <button type="button" className={control} aria-label="Potrivește fotografia"
          disabled={!width || zoom === 1} onClick={() => zoomTo(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" className={control} aria-label="Mărește"
          disabled={!width || zoom >= 4} onClick={() => zoomTo(zoom * 1.5)}>+</button>
      </div>
    </div>
  </dialog>;
}

export default function ReportPhoto({ src, label = 'Fotografia sesizării', alt = photoAlt }) {
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) return <p className="text-sm text-slate-600">Fotografia nu este disponibilă momentan.</p>;
  return <>
    <button ref={trigger} type="button" aria-label={'Mărește ' + label.toLocaleLowerCase('ro-RO')} aria-haspopup="dialog"
      className="relative w-fit max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-slate-300 bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2"
      onClick={() => setOpen(true)}>
      <img src={src} alt={alt} loading="lazy" className="block max-h-36 max-w-full object-contain sm:max-h-44"
        onError={() => setFailed(true)} />
      <span aria-hidden="true" className="absolute right-1 bottom-1 rounded bg-slate-950/85 px-2 text-lg text-white">+</span>
    </button>
    {open && <PhotoViewer src={src} label={label} alt={alt} onClose={() => {
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    }} />}
  </>;
}
