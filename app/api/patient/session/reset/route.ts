import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { documentRepository } from "@/lib/ocr/document-repository";

const sessionCookie = "medikiosk_session";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: user, error: authError } = await supabase.auth.getUser();
  if (authError || !user.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookie)?.value;

  let deletedDocuments = 0;
  if (sessionId) {
    // Purge all transient document/OCR/extraction state for this session.
    deletedDocuments = await documentRepository.deleteBySessionId(sessionId);

    const { error } = await supabase
      .from("patient_sessions")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("owner_id", user.user.id)
      .eq("status", "ACTIVE");
    if (error) return NextResponse.json({ error: "Unable to reset session" }, { status: 503 });
  }

  const response = NextResponse.json({ reset: true, session: null, deletedDocuments });
  response.cookies.set(sessionCookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
