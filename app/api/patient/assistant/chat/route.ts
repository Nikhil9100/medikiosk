import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { databaseConfigured, withKioskTx, withOwnerTx } from "@/lib/db/pool";
import { createCase } from "@/lib/db/cases";
import { getActiveKioskSession, patientWritable, SESSION_COOKIE } from "@/lib/db/session-scope";
import { answerPatient } from "@/lib/assistant";

export const runtime = "nodejs";

const Body = z
  .object({
    message: z.string().trim().min(1).max(2000),
    clientMutationId: z
      .string()
      .min(8)
      .max(100)
      .regex(/^[A-Za-z0-9._:-]+$/),
  })
  .strict();

export async function GET() {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Assistant storage not configured" }, { status: 503 });
  }
  const s = await getActiveKioskSession();
  if (!s) {
    return NextResponse.json({ messages: [] }, { headers: { "Cache-Control": "no-store, private" } });
  }

  const messages = await withKioskTx(s.id, async (c) =>
    (
      await c.query(
        `SELECT id, role, content, intent, citations, provider, created_at 
         FROM chat_messages 
         WHERE session_id = $1 
         ORDER BY created_at, id`,
        [s.id]
      )
    ).rows
  );

  return NextResponse.json(
    { messages: messages.map((m: any) => ({ ...m, createdAt: m.created_at })) },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}

export async function POST(req: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Assistant storage not configured" }, { status: 503 });
  }

  let s = await getActiveKioskSession();
  let createdSessionId: string | null = null;

  if (!s) {
    const ownerId = randomUUID();
    const key = randomUUID();
    try {
      s = await withOwnerTx(ownerId, (c) =>
        createCase(c, { ownerId, idempotencyKey: key, language: "en", resumeTokenHash: null })
      );
      createdSessionId = s.id;
    } catch {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }
  }

  if (!patientWritable(s)) {
    return NextResponse.json({ error: "Case has already been submitted" }, { status: 409 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  try {
    const out = await withKioskTx(s.id, async (c) => {
      const prior = await c.query(
        `SELECT content, citations, intent 
         FROM chat_messages 
         WHERE session_id = $1 AND role = 'ASSISTANT' AND client_mutation_id = $2 
         LIMIT 1`,
        [s.id, parsed.data.clientMutationId]
      );
      if (prior.rows[0]) {
        return {
          reply: prior.rows[0].content,
          citations: prior.rows[0].citations ?? [],
          safety: [],
          idempotent:true,
        };
      }
      return answerPatient(c, s.id, parsed.data.message, parsed.data.clientMutationId);
    });

    const res = NextResponse.json(out, { headers: { "Cache-Control": "no-store, private" } });
    if (createdSessionId) {
      res.cookies.set(SESSION_COOKIE, createdSessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 60,
      });
    }
    return res;
  } catch (e) {
    if (e instanceof Error && /duplicate key/i.test(e.message)) {
      return NextResponse.json(
        { error: "This message is already being processed", code: "MESSAGE_REPLAY" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Unable to process message" }, { status: 500 });
  }
}
