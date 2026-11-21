# CONTEXT — app-camin vocabulary

<!-- graffino-agentic:begin v1 -->
> The approved terms for this project. Use each term exactly as defined, in the part
> of speech given. Never swap in a synonym; never use a word on an _Avoid_ line.
<!-- graffino-agentic:end -->

**Reservation** (noun) — The act of booking a shared resource for a specific time slot.

**Live-queue** (noun) — A real-time record of who is waiting to use a shared resource.
_Avoid_: waiting list

P20 · Cămin / co-working: resurse comune și tichete
Categoria D · Comunități & real-time · Dificultate ★★★ · Efort estimat ~32h · Runda 1 · 1 student
Pe scurt: aplicație pentru un cămin studențesc, un hub de co-working sau un bloc real: rezervarea resurselor comune (mașini de spălat, sala de studiu, bucătărie, sala de sport), coadă live, cote de utilizare corectă, no-show, tichete de întreținere cu poze și notificări push.
🧑 Input uman obligatoriu
Căminul / hub-ul / blocul tău real. Inventarul real al resurselor comune (câte mașini de spălat, câte săli, ce reguli scrise există pe perete). Interviu cu administratorul: ce probleme are, cum raportează oamenii defecțiunile, ce reguli ar vrea aplicate. Sondaj cu minim 10 rezidenți: ce i-ar face să folosească aplicația, ce li se pare nedrept acum. INTERVIEW.md + SURVEY.md.

Context real
Mașina de spălat e "ocupată" cu rufele uitate de cineva de 3 ore. Sala de studiu e rezervată de aceleași 4 persoane. Becul din baie e ars de 2 săptămâni și nimeni nu știe dacă administratorul a aflat.
Cerințe funcționale (must)
Resurse cu reguli: durată maximă, interval de utilizare (ore de liniște), capacitate, cotă săptămânală.
Rezervări pe calendar; pentru mașini de spălat, coadă live: utilizatorul marchează start / stop, următorul din coadă e notificat când se eliberează.
No-show: dacă nu confirmi începerea în 10 minute de la ora rezervată, locul se eliberează și primești un "strike"; 3 strike-uri = suspendare temporară de la rezervări.
Tichete de întreținere: categorie, descriere, poză, locație (camera / etaj), prioritate; administratorul triază (nou → preluat → rezolvat → verificat), rezidentul confirmă rezolvarea.
Anunțuri de la administrator (apă oprită joi), cu confirmare de citire opțională.
Notificări push în browser (Web Push) pentru: e rândul tău, rezervarea începe în 10 minute, tichetul tău a fost rezolvat.
Statistici: utilizarea resurselor pe ore, top utilizatori (pentru cote), timp mediu de rezolvare a tichetelor.
Roluri: rezident, administrator, admin.
Cerințe tehnice specifice
PWA cu service worker și Web Push (VAPID), cu fallback pe email când nu există abonare.
Jobs programate pentru no-show, expirarea rezervărilor și reminder-e; toate idempotente.
Starea cozii e actualizată live (SSE / WebSocket) și corectă la două acțiuni simultane (test).
Pozele tichetelor sunt redimensionate și stocate în object storage.
🌀 Twist: cote glisante și ore de liniște cu excepții
Cota corectă e o fereastră glisantă ("maxim 6 ore de sală de studiu în orice interval de 7 zile"), nu un contor resetat luni; verificarea se face la rezervare și se recalculează la anulări. Orele de liniște blochează anumite resurse (nu mașina de spălat după 22), dar au excepții aprobate de administrator (sesiune: sala de studiu non-stop). Regula de no-show și suspendare trebuie să fie corectă și corectabilă (administratorul anulează un strike nedrept, cu motiv), iar un utilizator suspendat vede exact de ce și până când. Toate regulile sunt date, nu cod: administratorul le modifică din UI.

Variabilele tale
Căminul / hub-ul real și inventarul lui.
Regulile reale de cotă, ore de liniște și strike-uri (negociate cu administratorul și validate de sondaj).
Fereastra de confirmare a no-show-ului.
✅ Definition of Done
Resursele reale sunt pe live; minim 10 rezidenți au cont și minim 20 de rezervări reale au fost făcute.
Notificarea push "e rândul tău" ajunge pe telefon (demonstrabil).
Cota glisantă are minim 5 teste, inclusiv anulări.
Două acțiuni simultane pe coadă nu produc o stare invalidă (test).
Administratorul a schimbat o regulă din UI fără deploy.
