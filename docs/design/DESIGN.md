# Technical status page

Approved scope: a minimal English status page, not a product dashboard.
Use readable system fonts, a responsive single column, visible keyboard focus,
and explicit Checking / Connected / Unavailable text. Color must not be the only
status indicator. Announce refreshed results to assistive technology.
Do not show invented residents, resources, usage statistics or interview evidence.
## Welcome and access

Place the welcome text beside the sign-in card on desktop and above it on
phone widths. Keep email, password and the sign-in action visible in the
initial state. **Solicită acces** switches the card to an email-only form and
reports the outcome for that address. **Nu ai activat contul? Solicită o altă
invitație** opens a separate form of the same card for replacing a lost or
expired invitation. The replacement link also appears when activation fails.
Keep form labels visible and announce errors and completion to assistive technology.

## Identitatea vizuală Căminul Meu

**Status:** tokenuri și direcție vizuală aprobate. Machetele individuale au propriul status în registru.

### Identitate și ton

- Numele aplicației este **Căminul Meu**. Sus în stânga afișăm căminul curent, **Cămin 3**, și simbolul clădirii cu arbore din referința furnizată. Tratăm desenul ca propunere de logo. Verificăm lizibilitatea lui la dimensiune mică pe fundalul deschis înainte să fixăm varianta finală.
- Păstrăm desenele recognoscibile din referințe, cu pictograme de mașină de spălat și uscător pentru echipamente. În cardurile încăperilor, pictogramele disting spălătoriile de uscătorie. Numele și starea rămân vizibile în text.
- Pe calculator, navigarea stă în stânga, cu **Contul meu** la baza barei. Sub 1024 px, navigarea stă jos, cu o pictogramă deasupra fiecărei etichete și cu numărul de notificări necitite lângă pictogramă. În **Bun venit**, textul rămâne lângă formular pe laptop și deasupra pe telefon.
- Butonul **?** din dreapta sus deschide pagina separată **Ghid de utilizare**. Secțiunile se extind individual sau toate odată. Ajutorul contextual deschide secțiunea relevantă, iar **Înapoi** revine la ecranul de plecare.
- La prima autentificare după activarea prin invitație, afișăm **Consultă ghidul** și **Mergi la resurse**. La autentificările următoare, deschidem **Resurse** sau notificarea din linkul direct.
- Notificările sunt grupate după zi. Fiecare card folosește o pictogramă, un titlu, ora și detaliile disponibile. Setările de alertă rămân accesibile din antet, iar **OK** confirmă citirea unei notificări.
- Între **Resurse** și **Notificări**, Rezident vede **Sesizările mele**, iar Admin și Administrator văd **Sesizări**, cu acces la **Sesizări de întreținere**. Scurtătura spre profil se numește **Contul meu**.
- Ton prietenos, direct, în română cu diacritice. Verbe scurte pentru acțiuni, ca **Alege un interval**, **Vezi echipamentele** și **Confirmă rezervarea**. Stările explică ce s-a întâmplat și ce poate face utilizatorul.

### Tokenuri de culoare

Portalul rezidentului și paginile de acces folosesc tema deschisă, cu o bară de navigare verde salvie pal și text închis.

| Token | Valoare | Utilizare |
| --- | --- | --- |
| `background` | `#F7F3E9` | Fundalul portalului |
| `surface` | `#FFFDF7` | Carduri, panouri și câmpuri |
| `text` | `#17332B` | Text principal |
| `text-muted` | `#506359` | Text secundar și detalii |
| `border` | `#D9DED4` | Separatoare decorative |
| `control-border` | `#72887A` | Conturul câmpurilor pe `surface` |
| `primary` | `#426C59` | Acțiune principală și selecție |
| `on-primary` | `#FFFFFF` | Text și pictograme pe `primary` |
| `focus` | `#0D6755` | Contur de focus pe `surface` și `background` |
| `nav-bg` | `#E8EEE4` | Bara laterală |
| `nav-text` | `#29453C` | Textul și pictogramele din bară |
| `nav-active` | `#D4E3D4` | Destinația curentă |
| `on-nav-active` | `#164C40` | Textul destinației curente |
| `nav-focus` | `#0D6755` | Contur de focus în bară |
| `resource-wash-first` | `#DDEBE0` | Accentul cardului Spălătoria 1 |
| `resource-wash-second` | `#E6EDF3` | Accentul cardului Spălătoria 2 |
| `resource-dry` | `#F0E5CE` | Accentul cardului Uscătoria |
| `on-resource` | `#17332B` | Pictogramele de pe accentele încăperilor |
| `success-bg` / `success-text` | `#E1F1E6` / `#155538` | Disponibil și confirmare |
| `warning-bg` / `warning-text` | `#F9EBD4` / `#734308` | Predare, atenționare și acțiuni care cer atenție |
| `error-bg` / `error-text` | `#F8E7E5` / `#8B3034` | Erori și defecțiuni |
| `info-bg` / `info-text` | `#E6EDF3` / `#254A5F` | Informații, încărcare și interval ocupat sau indisponibil |

Stările folosesc etichete vizibile. Nicio stare esențială nu se comunică doar prin culoare. Țintele pentru perechile de mai sus sunt minimum 4,5:1 pentru text și 3:1 pentru contururile necesare. Pentru focus pe o acțiune plină se folosește contur cu decalaj, pe suprafața din jurul ei.

### Tipografie și spațiere

| Token | Valoare | Utilizare |
| --- | --- | --- |
| `font-sans` | Arial, Helvetica, sans-serif | Titluri, navigare, formulare, carduri și mesaje în toată aplicația |
| `weight-regular` / `weight-medium` / `weight-strong` | 400 / 500 / 650 | Text, etichete, titluri și acțiuni |
| `type-meta` / `type-body` / `type-card` | 14 px / 16 px / 18 px | Detalii, text curent, titlu de card |
| `type-section` / `type-page` / `type-welcome` | 22 px / 28–36 px / 36–48 px | Secțiuni, pagini și Bun venit, adaptate lățimii |
| `leading-body` / `leading-heading` | 1.5 / 1.2 | Înălțimea rândurilor |
| `space-1` … `space-8` | 4, 8, 12, 16, 24, 32, 48, 64 px | Ritm comun de spațiere |
| `radius-control` / `radius-card` / `radius-panel` | 8 / 14 / 20 px | Controale, carduri și panouri |
| `touch-target` / `focus-width` / `focus-offset` | 44 / 2 / 2 px | Ținta tactilă minimă și focusul vizibil |
| `nav-width` / `desktop-start` / `content-max` | 232 / 1024 / 1280 px | Bara laterală, pragul desktop și lățimea maximă a zonei de conținut |
| `page-gutter` / `grid-gap` | 16 px pe telefon, 32 px pe desktop / 16–24 px | Margini și distanță între carduri |
| `text-measure` | 68 ch | Lățimea de lectură pentru paragrafe lungi |

Pe laptop, folosim grile de două sau trei coloane după lățimea zonei de conținut și lăsăm calendarului un panou lat. Păstrăm limita de lectură doar pentru text lung. Verificăm 320 și 390 px pe telefon și 1280 și 1440 px pe laptop, inclusiv diacritice, text lung și navigare cu tastatura.

### Panoul de întâmpinare

Panoul de întâmpinare folosește varianta **Salvie și crem**. Formularul alăturat folosește `surface`.

| Variantă | Fundal / text |
| --- | --- |
| **Salvie și crem** | `#DDEBE0` → `#F7F3E9` / `#17332B` |

### Fundalul paginilor Bun venit și Autentificare

Rutele `/` și `/autentificare` folosesc același fundal verde închis (`#102E26`) și aceeași ilustrație decorativă a unui cămin la lăsarea serii. În ambele pagini, Arial, Helvetica, sans-serif este folosit inclusiv pentru titlu. Pe telefon, fundalul se decupează spre clădire.

### Macheta de rezervare

[DS-008 · Calendarul echipamentului](mocks/ds-008-rezervare.html) are status `draft`. Macheta folosește echipamentul selectat în inventar ca punct de plecare. Rezidentul alege ziua, începutul și sfârșitul, apoi vede separat durata utilizării și predarea, când se aplică. Sunt disponibile stările gol, încărcare, eroare, succes și text lung în tema deschisă. Datele și acțiunile sunt demonstrative.
