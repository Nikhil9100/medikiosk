# MediKiosk UI Foundation

## Phase 4 patient information architecture
- `/patient`: welcome screen and entry point
- `/patient/language`: English, Hindi, Bengali, Telugu, Tamil, and Marathi selection
- `/patient/consent`: explicit consent review
- `/patient/start`: readiness confirmation after accepted consent
- `/patient/complaint`: chief complaint capture with patient-led free text
- `/patient/anatomy`: optional region/subregion selection with an accessible body map
- `/patient/interview`: deterministic clinical history collection with branching questions

The patient experience uses one shared shell, header, progress indicator, and help control. The shell intentionally contains no clinical history fields in Phase 1.

## Language architecture
User-facing strings live in `lib/i18n.ts` under shared translation keys for English, Hindi, Bengali, Telugu, Tamil, and Marathi. Each initial language has a complete onboarding dictionary, including header, progress, help, consent, error, loading, and accessibility copy. English remains the fallback for future additions. The selected language is stored in patient workflow client state and persisted in local storage so navigation does not reset it.

## Consent flow
Consent begins as `NOT_REVIEWED`. Visiting the consent screen never accepts it. Only the explicit `I Agree & Continue` action sets `ACCEPTED` and permits the start screen. The secondary back action returns to language selection without changing consent state; there is no implicit decline or acceptance.

## Responsive strategy
The shell uses a fluid, centered container with readable max-width content, mobile-first spacing, large touch targets, and a single primary action. It is tested at 320px, 390px, 768px, 1024px, and 1440px without horizontal overflow.

## Accessibility
Screens use semantic headings, landmarks, keyboard-reachable buttons and links, visible focus styles, descriptive labels, live status text for language selection, and a help dialog with an accessible name. The complaint input is labeled by the same question text, and the anatomy selector uses button semantics with `aria-pressed` for area activation. Essential meaning is not conveyed by color alone. Motion respects `prefers-reduced-motion`.

The interview page uses:
- Semantic headings for questions
- Role="group" for choice controls
- aria-live="polite" for answer recording status
- Screen-reader-only labels for free-text and numeric inputs
- Disabled states during submission

## Design decisions
The visual language is restrained and public-service inspired: navy text, warm white surfaces, neutral borders, and limited indigo, saffron, and green accents. MediKiosk is an original product identity and does not use government marks or implied certifications. The responsive QA script checks all six languages at 320px, 390px, 768px, 1024px, and 1440px for overflow, clipping, language synchronization, and touch target size.
