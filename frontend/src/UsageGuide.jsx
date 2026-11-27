import { useEffect, useState } from 'react';
import { guideReturnPath } from './GuideLink.jsx';
import PortalIcon from './PortalIcon.jsx';

const topics = [
  { id: 'rezervari', title: 'Resurse și rezervări', icon: 'calendar' },
  { id: 'prezenta-la-rezervari', title: 'Prezența la rezervări', icon: 'clock' },
  { id: 'coada-de-asteptare', title: 'Coada de așteptare (Live-queue)', icon: 'queue' },
  { id: 'sesizari', title: 'Sesizări de întreținere', icon: 'reports' },
  { id: 'notificari', title: 'Notificări', icon: 'bell' },
  { id: 'gestionarea-strike-urilor', title: 'Gestionarea strike-urilor', icon: 'settings', operatorOnly: true },
];
const requestedTopic = window.location.hash.slice(1);

export default function UsageGuide({ reportsPath, canManage }) {
  const visibleTopics = topics.filter(topic => !topic.operatorOnly || canManage);
  const selectedTopic = visibleTopics.find(topic => topic.id === requestedTopic)?.id;
  const [open, setOpen] = useState([selectedTopic ?? visibleTopics[0].id]);
  const allOpen = visibleTopics.every(topic => open.includes(topic.id));
  const returnPath = guideReturnPath(new URLSearchParams(window.location.search).get('inapoi'));

  useEffect(() => {
    if (selectedTopic) document.getElementById('ghid-' + selectedTopic)?.focus();
  }, [selectedTopic]);

  const body = {
    rezervari: <>
      <p>În <a className="camin-link" href="/resurse">Resurse</a> vezi unde se află mașinile de spălat și uscătoarele
        și în ce stare sunt.</p>
      <p>Deschide calendarul echipamentului, alege ziua și confirmă un interval liber. Ridică cheia de la recepție.</p>
      <p>Poți anula rezervarea înainte de începere sau apăsa <strong>Încheie</strong> dacă termini mai devreme.</p>
    </>,
    'prezenta-la-rezervari': <>
      <p>Pentru ca aplicația să fie cât mai utilă tuturor, există un sistem de sancționare a neprezentării la rezervare.
        Dacă știi că nu mai ajungi, anulează rezervarea din calendar înainte de ora programată, ca altcineva să poată folosi intervalul.</p>
      <p>Primești un reminder cu 10 minute înainte și o alertă la ora programată. Când începi, deschide calendarul și apasă
        <strong> Confirmă începerea</strong> în primele 10 minute. Pentru o ofertă imediată din Live-queue, butonul <strong>Începe</strong>
        {' '}confirmă și prezența.</p>
      <p>Dacă nu confirmi la timp, intervalul rămas se eliberează și primești un strike. Ești scutit dacă utilizarea durează sub
        10 minute sau dacă echipamentul e în verificare și nu poți confirma până la termen.</p>
      <p>În mod implicit, trei strike-uri în ultimele șapte zile suspendă rezervările noi pentru 48 de ore. Calendarul îți arată
        motivul și data la care poți rezerva din nou. Poți folosi rezervările pe care le-ai făcut deja.</p>
      <p>Conform regulii implicite, fiecare strike iese din calcul la șapte zile de la acordare. Cele trei strike-uri care au declanșat o
        suspendare rămân în istoric, iar o nouă suspendare cere alte trei strike-uri. Dacă un strike a fost acordat pe nedrept,
        cere administratorului să îl corecteze.</p>
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
    'gestionarea-strike-urilor': <>
      <p>La fiecare strike nou, Administratorul și Adminul primesc mesajul <strong>S-a acordat un strike</strong> în
        {' '}<a className="camin-link" href="/notificari">Notificări</a>, doar în aplicație. Mesajul arată echipamentul,
        data și ora rezervării.</p>
      <p>Apasă <strong>Mergi la rezervare</strong> din mesaj pentru a deschide direct detaliile. Poți găsi aceeași rezervare din
        {' '}<strong>Contul meu</strong>, la <a className="camin-link" href="/admin/rezervari">Istoricul rezervărilor</a>,
        folosind filtrul <strong>Anulate</strong>.</p>
      <p>Dacă verifici că strike-ul a fost acordat pe nedrept, apasă <strong>Corectează strike-ul</strong>, scrie motivul și apasă
        {' '}<strong>Confirmă corecția</strong>. Strike-ul apare ca <strong>Corectat</strong>, cu motivul în istoric, și iese din calcul.
        Dacă a contribuit la o suspendare încă activă, suspendarea se ridică imediat.</p>
      <p>În istoricul rezervărilor, la <strong>Regulă de neprezentare</strong>, poți schimba perioada de acumulare a strike-urilor
        și durata suspendării. Apasă <strong>Salvează regula</strong> pentru a aplica valorile la sancțiunile noi.</p>
    </>,
  };

  return (
    <div className="resident-guide">
      <a className="camin-link guide-back" href={returnPath}>← Înapoi</a>
      <h1>Ghid de utilizare</h1>
      <p className="camin-muted">Cu aplicația Căminul Meu vezi ce mașini sunt libere înainte să cobori la spălătorie.
        Îți poți rezerva un interval și poți urmări problemele semnalate administratorului.</p>
      <div className="guide-toolbar">
        <strong>Cum funcționează?</strong>
        <button type="button" className="camin-link" onClick={() => setOpen(allOpen ? [] : visibleTopics.map(topic => topic.id))}>
          {allOpen ? 'Restrânge tot' : 'Extinde tot'}
        </button>
      </div>
      <div className="guide-topics">
        {visibleTopics.map(({ id, title, icon }) => {
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
