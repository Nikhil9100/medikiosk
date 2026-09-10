import "server-only";

import type { PoolClient } from "pg";

export type ChatMessageRecord = {
  id: string;
  sessionId: string;
  role: "PATIENT" | "ASSISTANT";
  content: string;
  intent: string | null;
  citations: Array<Record<string, unknown>> | null;
  provider: string | null;
  createdAt: Date;
};

function toMessage(row: Record<string, unknown>): ChatMessageRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as ChatMessageRecord["role"],
    content: row.content as string,
    intent: (row.intent as string | null) ?? null,
    citations: (row.citations as Array<Record<string, unknown>> | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export async function listChatMessages(client: PoolClient, sessionId: string): Promise<ChatMessageRecord[]> {
  const result = await client.query(
    `SELECT id, session_id, role, content, intent, citations, provider, created_at
       FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC, id`,
    [sessionId],
  );
  return result.rows.map(toMessage);
}

export async function addChatMessage(
  client: PoolClient,
  message: {
    sessionId: string;
    role: "PATIENT" | "ASSISTANT";
    content: string;
    intent?: string | null;
    citations?: Array<Record<string, unknown>> | null;
    provider?: string | null;
  },
): Promise<ChatMessageRecord> {
  const result = await client.query(
    `INSERT INTO chat_messages (session_id, role, content, intent, citations, provider)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, session_id, role, content, intent, citations, provider, created_at`,
    [
      message.sessionId,
      message.role,
      message.content,
      message.intent ?? null,
      message.citations ? JSON.stringify(message.citations) : null,
      message.provider ?? null,
    ],
  );
  return toMessage(result.rows[0]);
}
