# MediKiosk UI Foundation

## Phase 1 patient information architecture
- `/patient`: welcome screen and entry point
- `/patient/language`: English/Hindi selection
- `/patient/consent`: explicit consent review
- `/patient/start`: readiness confirmation after accepted consent

The patient experience uses one shared shell, header, progress indicator, and help control. The shell intentionally contains no clinical history fields in Phase 1.

## Language architecture
User-facing strings live in `lib/i18n.ts` under English and Hindi translation keys. The selected language is stored in the patient workflow client state and persisted in local storage so navigation does not reset it. English remains the fallback language.

## Consent flow
Consent begins as `NOT_REVIEWED`. Visiting the consent screen never accepts it. Only the explicit `I Agree & Continue` action sets `ACCEPTED` and permits the start screen. Declining leaves the user on consent and keeps the status explicit.

## Responsive strategy
The shell uses a fluid, centered container with readable max-width content, mobile-first spacing, large touch targets, and a single primary action. It is tested at 320px, 390px, 768px, 1024px, and 1440px without horizontal overflow.

## Accessibility
Screens use semantic headings, landmarks, keyboard-reachable buttons and links, visible focus styles, descriptive labels, live status text for language selection, and a help dialog with an accessible name. Essential meaning is not conveyed by color alone. Motion respects `prefers-reduced-motion`.

## Design decisions
The visual language is restrained and public-service inspired: navy text, warm white surfaces, neutral borders, and limited indigo, saffron, and green accents. MediKiosk is an original product identity and does not use government marks or implied certifications.
