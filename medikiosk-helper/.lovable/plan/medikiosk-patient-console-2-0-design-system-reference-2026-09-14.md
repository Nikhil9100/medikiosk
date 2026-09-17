# MediKiosk Patient Console 2.0 — Design System Reference

This project becomes the **visual source of truth** for the Patient Console 2.0, to be ported later into your real Next.js + Supabase MediKiosk app. No backend here, no database, no ported production code, and nothing that claims real OTP or ABHA verification — every interactive screen is clearly a design reference.

Guiding rule on every screen: **one question, one decision, one action.** Where am I, what do I need to do, what happens next.

## What this project will contain

**1. Design system pages**
- Colour roles: MediKiosk green, deep green-navy text, soft mint, warm white, neutral grey, warm amber, emergency red — shown as semantic roles, not raw swatches.
- Type scale: display, page title, question, body, label, helper, caption, with the patient's question always strongest.
- Spacing (4/8/12/16/24/32/48), radius (8/12/16/20/24), three elevation levels, focus and state styles.

**2. MkIcon set** — one hand-drawn, consistent, rounded healthcare icon language for phone, ABHA, patient, doctor, privacy, symptoms, pain, body, documents, voice, saved, offline, emergency, Anaya, navigation. No emoji carrying meaning.

**3. Anaya identity** — a calm, professional, Indian-context-appropriate visit-assistant mark used consistently in chat, voice, contextual help and safety alerts. Not a cartoon, not an AI mascot.

**4. Access screens (design reference)**
- "How would you like to continue?" with Phone and ABHA as visually equal cards.
- Phone: +91 field, Send OTP, then six large OTP boxes, Verify & Continue, quiet resend timer, plain-language errors.
- ABHA: ABHA number or ABHA address, switch back to phone, wording that says information is self-declared.
- A visible note on these screens that they are a design reference and verify nothing.

**5. Patient Console screens** — welcome, language, consent, optional ABHA, chief complaint (text + voice), affected area body map with severity, symptoms, guided interview, documents, completion. Presentation simplified; no clinical step removed. Progress shows a journey indicator on laptops and "Step X of Y" plus a bar on phones.

**6. Anaya screens** — full-screen on phones, centred readable conversation on laptops. First screen offers only Describe my symptoms / Prepare for my doctor / Something else. Structured replies (what you told me, general information, what to do next, when to get help, source), three distinct safety levels with an unmistakable urgent state, simple menu, new-message scroll affordance, keyboard-safe composer.

**7. State references** — voice (speak, listening, processing, heard with confirm/edit, speaking with stop, failure falling back to typing), emergency Get Help, saved / saving / offline reassurance, modals, toasts.

**8. Component library page** — every component shown in its states (default, hover, pressed, selected, disabled, loading, error, success) and at mobile, tablet, laptop and large-desktop behaviour, so the port has an exact reference.

**9. Six-language previews** — English, Hindi, Bengali, Telugu, Tamil, Marathi across the major components, checking wrapping, buttons, cards, modals, progress, chat, emergency and access screens for clipping or mixed-language leakage.

## Verification before I call it done

Real browser passes at 320x568, 360x800, 390x844, 414x896, 768x1024, 1024x768, 1280x800, 1366x768, 1440x900 and 1920x1080, in each language: no overlap, no clipped text, no sideways scrolling, no oversized cards or headings, no hidden inputs, modals that fit at 320. Keyboard order, visible focus, screen-reader labels, live announcements, 44px touch targets, contrast and reduced motion all checked. Clean typecheck and lint, no console errors.

## Technical notes

- Tokens defined once in `src/styles.css` under `@theme inline`; shadcn primitives restyled via variants; no hardcoded colour utilities.
- TanStack Start routes: `/` (design system home and index of everything), `/system/*` for foundations, icons, Anaya identity, components and language previews, `/access/*` for the three access screens, `/console/*` for the ten workflow screens, `/anaya/*` for the assistant references. Each route gets its own head metadata.
- Components built as the named set: MkIcon, AnayaAvatar, PatientHeader, ProgressIndicator, AuthMethodCard, PhoneLogin, OtpInput, AbhaLogin, QuestionCard, ChoiceButton, VoiceButton, BodyMap (inline SVG), DocumentCard, SafetyAlert, EmergencyButton, OfflineNotice, AnayaLauncher, AnayaChat, ChatMessage, ChatComposer, ChatMenu, ActionBar, Modal, Toast, StatusIndicator — file names and props chosen to drop straight into the production repo.
- Screen state is local React state and a small in-memory context only, so flows are clickable; no persistence, no network, no fake records.
- Translation strings live in one typed dictionary per language so the port can lift them directly.

## Explicitly out of scope

Real authentication, ABHA/ABDM verification, database, document processing, AI answers, doctor station, offline sync logic. Those stay in your production repo; this project defines how they should look and behave.

## Order of work

1. Foundations: tokens, type, spacing, elevation, MkIcon set, Anaya identity, shell/header/emergency/status.
2. Access screens.
3. Console workflow screens.
4. Anaya, voice and safety references.
5. Component library and state matrix.
6. Six-language previews, then the responsive and accessibility QA pass.
