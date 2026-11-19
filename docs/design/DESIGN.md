# Technical status page

Approved scope: a minimal English status page, not a product dashboard.
Use readable system fonts, a responsive single column, visible keyboard focus,
and explicit Checking / Connected / Unavailable text. Color must not be the only
status indicator. Announce refreshed results to assistive technology.
Do not show invented residents, resources, usage statistics or interview evidence.
Future application screens require their own approved design criteria.

# Welcome page

At `/`, the centered welcome message uses a warm white background and a petrol
teal accent. The “Vezi resursele” (View resources) link opens the dashboard at
`/resurse` and has a visible keyboard focus indicator.

# Resident dashboard

At `/resurse`, the Romanian interface uses a warm white background, petrol teal
accents, and system fonts. Resource cards use one column on mobile and two
columns on wider screens. Laundry resources appear first. Each card has a
decorative icon next to its name and a text status label that can wrap onto the
next line. Announcements appear in a pale green card below the resources on
mobile and to their right at widths of 1024 px and above. The shared header
links the app name to the welcome page.

Resource data and announcements are labeled as examples. Statuses have text
labels, and filters show the selected option and visible keyboard focus. The
English technical status page is available at `/status`.
