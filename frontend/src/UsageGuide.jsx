import { useEffect, useState } from 'react';
import { guideReturnPath } from './GuideLink.jsx';
import PortalIcon from './PortalIcon.jsx';

const topics = [
  { id: 'rezervari', title: 'Resurse și rezervări', icon: 'calendar' },
  { id: 'coada-de-asteptare', title: 'Coada de așteptare (Live-queue)', icon: 'queue' },
  { id: 'sesizari', title: 'Sesizări de întreținere', icon: 'reports' },
  { id: 'notificari', title: 'Notificări', icon: 'bell' },
];
const requestedTopic = window.location.hash.slice(1);
const selectedTopic = topics.find(topic => topic.id === requestedTopic)?.id;

export default function UsageGuide({ reportsPath, canManage }) {
  const [open, setOpen] = useState([selectedTopic ?? topics[0].id]);
  const allOpen = open.length === topics.length;
  const returnPath = guideReturnPath(new URLSearchParams(window.location.search).get('inapoi'));

  useEffect(() => {
    if (selectedTopic) document.getElementById('ghid-' + selectedTopic)?.focus();
  }, []);

  const body = {
    rezervari: <>
      <p>În <a className="camin-link" href="/resurse">Resurse</a> vezi unde se află mașinile de spălat și uscătoarele
        și în ce stare sunt.</p>
      <p>Deschide calendarul echipamentului, alege ziua și confirmă un interval liber. Ridică cheia de la recepție.</p>
      <p>Poți anula rezervarea înainte de începere sau apăsa <strong>Încheie</strong> dacă termini mai devreme.</p>
    </>,
    'coada-de-asteptare': <p>Dacă aștepți să se elibereze o mașină astăzi, intră în Live-queue din calendar și alege durata ciclului.
      Când se eliberează un interval, prima persoană din coadă al cărei ciclu încape primește o ofertă.
      O poți accepta din calendar sau din Notificări în cel mult cinci minute.</p>,
    sesizari: <>
      <p>Rezidenții pot raporta o defecțiune direct din fișa echipamentului.
        Pentru o problemă în cameră sau într-un spațiu comun, trimit o sesizare din {canManage
          ? <strong>Sesizările mele</strong>
          : <a className="camin-link" href={reportsPath}>Sesizările mele</a>}. Poza este opțională.</p>
      <p>{canManage
        ? <>Din <a className="camin-link" href={reportsPath}>Sesizări</a>, administratorul preia sesizarea,
          îi stabilește prioritatea și o marchează ca rezolvată.</>
        : 'Administratorul preia sesizarea, îi stabilește prioritatea și o marchează ca rezolvată.'}
        {' '}Autorul poate confirma apoi că problema s-a rezolvat.</p>
    </>,
    notificari: <p>Administratorul este anunțat când apare o sesizare nouă. În <a className="camin-link" href="/notificari">Notificări</a> afli
      când sesizarea ta e preluată sau rezolvată, când o defecțiune îți afectează rezervarea ori când primești o ofertă în Live-queue.
      Poți activa și alerte în browser pe dispozitivele compatibile. Apasă <strong>OK</strong> pe un mesaj ca să-l marchezi drept citit.</p>,
  };

  return (
    <div className="resident-guide">
      <a className="camin-link guide-back" href={returnPath}>← Înapoi</a>
      <h1>Ghid de utilizare</h1>
      <p className="camin-muted">Cu aplicația Căminul Meu vezi ce mașini sunt libere înainte să cobori la spălătorie.
        Îți poți rezerva un interval și poți urmări problemele semnalate administratorului.</p>
      <div className="guide-toolbar">
        <strong>Cum funcționează?</strong>
        <button type="button" className="camin-link" onClick={() => setOpen(allOpen ? [] : topics.map(topic => topic.id))}>
          {allOpen ? 'Restrânge tot' : 'Extinde tot'}
        </button>
      </div>
      <div className="guide-topics">
        {topics.map(({ id, title, icon }) => {
          const expanded = open.includes(id);
          return <section key={id} className="guide-topic">
            <h2><button id={'ghid-' + id} type="button" aria-expanded={expanded} aria-controls={'continut-' + id}
              onClick={() => setOpen(current => expanded ? current.filter(topic => topic !== id) : [...current, id])}>
              <span className="guide-icon"><PortalIcon name={icon} /></span>
              <span>{title}</span>
              <span className="guide-chevron" aria-hidden="true" />
            </button></h2>
            <div className="guide-body" id={'continut-' + id} hidden={!expanded}>{body[id]}</div>
          </section>;
        })}
      </div>
    </div>
  );
}
