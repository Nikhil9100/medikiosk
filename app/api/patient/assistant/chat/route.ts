import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withKioskTx } from "@/lib/db/pool";
import { getCase } from "@/lib/db/cases";
import { SESSION_COOKIE } from "@/lib/db/session-scope";
import { listChatMessages, addChatMessage } from "@/lib/db/chat";
import { retrieveChunks } from "@/lib/db/knowledge";
import { detectSafetySignals } from "@/lib/safety-signals";
import { composeReply, extractTerms } from "@/lib/assistant-reply";

export const runtime = "nodejs";

const PostSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
  })
  .strict();

/**
 * Patient assistant chat — one consistent identity ("Medi"), text + voice.
 *
 * Pipeline (deterministic, honest):
 *  1. Safety screen: the message is run through the same safety-signal
 *     engine as the intake flow; red flags are surfaced FIRST and routed to
 *     physician review. The assistant never diagnoses or prescribes.
 *  2. Retrieval: full-text search over the two knowledge corpora, run as
 *     SEPARATE queries (MODERN_MEDICINE and AYURVEDA are never blended).
 *  3. Answer: a transparent, template-composed reply that quotes which
 *     reference set each point came from, with citations persisted to the
 *     chat record.
 *
 * The provider label is `deterministic-kb`: the answer is real computation
 * over real knowledge content, not a canned reply — and it is labeled as
 * rule-based retrieval, not as an LLM, when no LLM is configured.
 */

export async function GET() {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Assistant storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const messages = await withKioskTx(sessionId, (client) => listChatMessages(client, sessionId)).catch(() => null);
  if (!messages) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      intent: m.intent,
      citations: m.citations,
      provider: m.provider,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Assistant storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const message = parsed.data.message;

  try {
    return await withKioskTx(sessionId, async (client) => {
      const session = await getCase(client, sessionId);
      if (!session || session.status !== "ACTIVE") {
        return NextResponse.json({ error: "Session not active" }, { status: 410 });
      }

      // 1. Safety screen — the same engine as intake.
      const safetyDrafts = detectSafetySignals({
        complaints: [{ text: message, region: session.bodyRegion, severity: null, position: 0 }],
        facts: [],
        evidence: [],
      });

      // 2. Retrieval — separate corpora, never blended.
      const terms = extractTerms(message);
      const [modern, ayurveda] = await Promise.all([
        terms.length > 0 ? retrieveChunks(client, { corpus: "MODERN_MEDICINE", terms, limit: 3 }) : [],
        terms.length > 0 ? retrieveChunks(client, { corpus: "AYURVEDA", terms, limit: 2 }) : [],
      ]);

      // 3. Compose (deterministic, cited, honest).
      // composeReply dedupes by document, applies the Ayurveda relevance
      // gate, and returns the citations that were actually shown.
      const { reply, intent, citations } = composeReply({
        safety: safetyDrafts,
        modern,
        ayurveda,
      });

      // 4. Persist both sides of the exchange.
      await addChatMessage(client, { sessionId, role: "PATIENT", content: message });
      await addChatMessage(client, {
        sessionId,
        role: "ASSISTANT",
        content: reply,
        intent,
        citations: citations.length > 0 ? citations : null,
        provider: "deterministic-kb",
      });

      return NextResponse.json({
        reply,
        intent,
        citations,
        provider: "deterministic-kb",
        safety: safetyDrafts.map((s) => ({ type: s.type, summary: s.summary })),
      });
    });
  } catch (error) {
    console.error("Assistant chat failed:", error);
    return NextResponse.json({ error: "Unable to process message" }, { status: 500 });
  }
}
