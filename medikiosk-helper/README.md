# MediKiosk

Hospital pre-consultation kiosk: patients complete their intake on a kiosk before
seeing a doctor, and clinical staff review the case in a separate console.

## What is in this repository

```
medikiosk/          The MediKiosk application (Next.js)
  app/              Screens and API routes
    patient/        Patient kiosk journey (language, consent, identity,
                    complaint, body map, symptoms, interview, documents, done)
    doctor/         Doctor review station (queue, case view, notes)
    hospital/       Operations dashboard
    api/            Server endpoints used by the screens
  components/       Shared UI pieces (icons, body-map selector)
  lib/              Clinical logic, translations, database access, services
  db/, supabase/    Database schema and migrations
  scripts/          Quality, seeding and end-to-end check scripts
  tests/            Automated checks
  docs/             Product, architecture, clinical and UI documentation

src/                Lovable workspace shell (preview harness only)
public/             Static files for the workspace shell
```

The product lives entirely in `medikiosk/`. The top-level `src/` folder is only
the Lovable preview harness and is not part of the MediKiosk app.

## Running the app locally

```sh
cd medikiosk
npm install
cp .env.example .env    # fill in the database and service keys
npm run dev
```

Without the environment keys the screens still render, but anything that saves
data will report that the service is unavailable.

## Useful commands (inside `medikiosk/`)

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` | Production build |
| `npm run lint` | Lint |
| `npm run typecheck` | Type checking |
| `npm test` | Automated checks |
| `npm run quality` | Quality gate plus tests |

## Documentation

See `medikiosk/docs/` for the product requirements, architecture, clinical
model, security notes and UI reference.
