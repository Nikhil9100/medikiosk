# Security Baseline

## Secret handling
- Use .env.local for local secrets only.
- Never commit API keys.
- Keep Gemini, Sarvam, and Supabase secret values on the server side.
- Never expose secrets to the browser bundle.

## Session isolation
- Patient sessions must have unique identifiers.
- Server-side state is the trusted source of truth.
- No global singleton patient state.
- Session reset and invalidation must be supported.

## Database boundary
- Supabase PostgreSQL is the intended persistence layer.
- RLS is mandatory for all sensitive data.
- Access must be role-aware and ownership-aware.
- `patient_sessions` uses forced RLS with owner-based select, insert, and update policies.
- No policy uses unrestricted `USING (true)` access.

## Phase 2 session security
- Browser code can use only the publishable Supabase key.
- `SUPABASE_SECRET_KEY` is isolated in `lib/supabase/admin.ts` behind `server-only` and is not imported by patient components.
- Session IDs are stored in an HTTP-only cookie and are not sufficient without the authenticated Supabase identity.
- The database unique idempotency index prevents duplicate session creation for the same owner and retry key.
- Expiry is enforced by the server, not by a client timer.

## Current verification limitation
The configured Supabase Auth endpoint is reachable, but anonymous sign-ins are disabled in the project. The migration has static policy validation, but live migration and RLS integration tests cannot be claimed until a database migration channel and patient authentication mode are configured.

## Data minimization
- Log only what is needed for operational debugging.
- Never log full medical documents or unnecessary PHI.
- Strip or redact sensitive payloads before external logging.
