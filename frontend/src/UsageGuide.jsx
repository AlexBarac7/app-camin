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
      <p>Limita inițială este de două rezervări în aceeași zi, pentru spălare și uscare cumulat. Poți rezerva în același
        timp o mașină de spălat și un uscător. Limita se aplică și când accepți o ofertă din Live-queue.</p>
      <p>O anulare înainte de începere îți eliberează un loc pentru ziua respectivă. O neprezentare consumă un loc din limita zilei.
        Dacă termini mai devreme, apasă <strong>Încheie</strong>.</p>
      {canManage && <p>Poți schimba valoarea din <a className="camin-link" href="/admin/rezervari">Istoricul rezervărilor</a>,
        la <strong>Limită zilnică</strong>. Rezervările deja confirmate rămân valabile.</p>}
    </>,
    'prezenta-la-rezervari': <>
      <p>Pentru ca aplicația să fie cât mai utilă tuturor, există un sistem de sancționare a neprezentării la rezervare.
        Dacă știi că nu mai ajungi, anulează rezervarea din calendar înainte de ora programată, ca altcineva să poată folosi intervalul.</p>
      <p>Primești un reminder cu 10 minute înainte și o alertă la ora programată. Când începi, deschide calendarul și apasă
        <strong> Confirmă începerea</strong> în primele 10 minute. Pentru o ofertă imediată din Live-queue, butonul <strong>Începe</strong>
        {' '}confirmă și prezența.</p>
      <p>Dacă nu confirmi la timp, intervalul rămas se eliberează și primești un strike. Ești scutit dacă utilizarea durează sub
        10 minute sau dacă echipamentul e în verificare și nu poți confirma până la termen.</p>
      <p>În <a className="camin-link" href="/notificari">Notificări</a> găsești mesajul <strong>Ai primit un strike</strong> și un link
        către rezervarea anulată. Deasupra listei vezi câte strike-uri active ai și câte mai sunt până la suspendare.
        Primești un mesaj și când un administrator îți corectează un strike.</p>
      <p>În mod implicit, trei strike-uri în ultimele șapte zile suspendă accesul pentru 48 de ore. Se anulează rezervările
        viitoare programate să înceapă înainte de expirarea suspendării. Rezervările de la ora expirării sau de mai târziu rămân
        valabile. Poți termina utilizarea deja începută. Calendarul îți arată motivul și data la care poți rezerva din nou.</p>
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
    notificari: <>
      <p>Administratorul este anunțat când apare o sesizare nouă. În <a className="camin-link" href="/notificari">Notificări</a> afli
        când sesizarea ta e preluată sau rezolvată, când o defecțiune îți afectează rezervarea ori când primești o ofertă în Live-queue.
        Apasă <strong>OK</strong> pe un mesaj ca să-l marchezi drept citit.</p>
      <p>Când o cerere de înregistrare intră în lista de aprobare, Adminul primește o alertă în aplicație, un e-mail și o alertă
        pe dispozitivele cu notificări activate. Linkul din e-mail deschide <strong>Cereri de acces</strong>.</p>
      <h3>Anunțuri de la Administrator</h3>
      <p>Administratorul poate trimite un mesaj tuturor rezidenților cu cont în aplicație. În <strong>Notificări</strong>,
        apasă <strong>Anunță rezidenții</strong>, scrie mesajul și apasă <strong>Trimite</strong>. Poți atașa până la patru
        poze de cel mult 10 MB fiecare, folosind <strong>Fă o poză</strong> sau <strong>Încarcă poze</strong>.</p>
      <p>Ca rezident, găsești mesajul și pozele în <strong>Notificări</strong>, sub titlul <strong>Notificare de la Administrator</strong>.
        Dacă ai activat alertele în browser, primești și o alertă pe dispozitiv care deschide anunțul.</p>
      <p>Dacă vrei să îi comunici Administratorului că ai citit anunțul, apasă <strong>Confirm că am citit</strong>.
        Confirmarea este opțională. Butonul <strong>OK</strong> marchează mesajul ca citit în lista ta.
        În <strong>Anunțuri trimise</strong>, Administratorul poate deschide fiecare anunț ca să vadă câți rezidenți au confirmat și cine sunt.</p>
      <h3>Mesaj înainte de finalul utilizării</h3>
      <p>Cu 15 minute înainte să se termine timpul tău de utilizare, primești un mesaj ca să te pregătești să eliberezi echipamentul.
        De exemplu, dacă ai rezervat de la 18:00 la 18:40, folosești echipamentul până la 18:30, iar ultimele 10 minute sunt pentru predare.
        Mesajul vine la <strong>18:15</strong>. Dacă poți folosi echipamentul până la închiderea de la 20:00, mesajul vine la <strong>19:45</strong>.</p>
      <p>Găsești mesajul în <strong>Notificări</strong>. Dacă ai activat alertele în browser pe un dispozitiv, îl primești și pe acel dispozitiv,
        chiar și cu aplicația închisă. Dacă nu ai alerte activate pe niciun dispozitiv, primești mesajul la adresa de e-mail a contului.
        Folosește <strong>Setări pentru alertele pe dispozitiv</strong> din <strong>Notificări</strong> ca să le activezi pe un dispozitiv compatibil.</p>
      <p>Mesajul este omis dacă ai anulat sau ai încheiat rezervarea înainte de ora mesajului, dacă utilizarea durează sub 15 minute
        sau dacă ai rezervat când mai erau sub 15 minute până la finalul utilizării.</p>
    </>,
    'gestionarea-strike-urilor': <>
      <p>La fiecare strike nou, Administratorul și Adminul primesc mesajul <strong>S-a acordat un strike</strong> în
        {' '}<a className="camin-link" href="/notificari">Notificări</a>, doar în aplicație. Mesajul arată e-mailul rezidentului,
        echipamentul, data și ora rezervării.</p>
      <p>Apasă <strong>Mergi la rezervare</strong> din mesaj pentru a deschide direct detaliile. Poți găsi aceeași rezervare din
        {' '}<strong>Contul meu</strong>, la <a className="camin-link" href="/admin/rezervari">Istoricul rezervărilor</a>,
        folosind filtrul <strong>Anulate</strong>.</p>
      <p>Dacă verifici că strike-ul a fost acordat pe nedrept, apasă <strong>Corectează strike-ul</strong>, scrie motivul și apasă
        {' '}<strong>Confirmă corecția</strong>. Strike-ul apare ca <strong>Corectat</strong>, cu motivul în istoric, și iese din calcul.
        Dacă a contribuit la o suspendare încă activă, suspendarea se ridică imediat. Rezervările anulate rămân în istoric.</p>
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
