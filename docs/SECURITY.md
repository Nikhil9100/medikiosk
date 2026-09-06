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

## Data minimization
- Log only what is needed for operational debugging.
- Never log full medical documents or unnecessary PHI.
- Strip or redact sensitive payloads before external logging.
