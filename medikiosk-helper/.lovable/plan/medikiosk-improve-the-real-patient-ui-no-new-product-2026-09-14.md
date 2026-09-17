# MediKiosk — improve the real Patient UI (no new product)

You were right: I built a parallel set of screens instead of improving yours. This plan throws that away and works on your actual MediKiosk code.

## What changes

1. **Remove my invented screens.** The made-up access/console/system pages and the reference-only component library go. Nothing of my invention survives except pure styling craft applied to your screens.
2. **Bring your real MediKiosk code into this workspace** (from your GitHub project) so I edit the actual files: the patient frame, the nine visit steps, the assistant, and the single stylesheet they all share.
3. **Improve the look and feel of those exact screens, in place.** Same steps, same order, same wording, same buttons, same behaviour — only the visual craft improves.

## The design work, screen by screen

Your app already styles everything through one stylesheet with named classes, so most of the improvement happens there without touching logic:

- **Colour and depth:** refine the existing green/navy/saffron palette into a consistent hospital-grade scale — calmer surfaces, one shadow language, one border colour, proper contrast on every text/background pair.
- **Typography:** a real type scale so questions read large and calm, helper text recedes, and headings stop competing. Indian-language text gets fonts that render properly in all six languages.
- **The frame:** cleaner top bar, a progress row that reads as progress (not a cramped strip), balanced page width, and a footer that stops shouting.
- **Cards, fields, choices:** taller comfortable targets, clearer selected states, softer focus rings that are still obvious for keyboard use, and severity choices that escalate visually from mild to very severe.
- **Body/severity screen:** better proportions for the figure, clearer selected region, region labels that stay legible on a phone.
- **Assistant screen:** calmer conversation surface, clearer distinction between the patient's words and the assistant's, composer that never gets covered by the keyboard.
- **Alerts and states:** one consistent visual language for urgent, caution, offline, saving, and emergency — urgent unmistakable, everything else quiet.
- **Small screens:** every screen checked from 320px up to 1920px — no clipping, no sideways scrolling, modals fully visible on the smallest phone.

Where a screen needs more than styling to look right, I adjust only its markup and class names — never its data, its API calls, its validation, its wording, or its flow.

## What I will not touch

Session handling, offline recovery, saving, the APIs, the assistant's answers, translations, consent logic, document handling, the doctor and hospital areas. No mock data, no fake login, no invented claims.

## How you will see it

I run your real app inside this sandbox and capture each improved screen at phone, tablet and laptop widths so you can compare before and after. The changed files are then yours to pull into your GitHub project.

## Technical notes

- Source: the `medikiosk` repo (Next.js 16 + Supabase), brought in as the working codebase; the TanStack starter scaffolding I generated is removed.
- Main edit surface: `app/globals.css` (single stylesheet, ~1200 lines) plus targeted class/markup polish in `app/patient/PatientShell.tsx` and the nine `app/patient/*/page.tsx` files.
- Verification: `next dev` in the sandbox plus your existing `qa:responsive` and `qa:accessibility` scripts; `typecheck` and `lint` must stay clean.
- Note: because your app is Next.js, the Lovable preview pane will not render it — review happens through the screenshots I capture.
