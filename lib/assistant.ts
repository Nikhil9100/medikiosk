import type { PoolClient } from "pg";
import { detectSafetySignals } from "./safety-signals";

export type Citation = {
  corpus: "MODERN_MEDICINE" | "AYURVEDA";
  title: string;
  source: string;
  section: string | null;
};

function isGreeting(text: string): boolean {
  const norm = text.toLowerCase().trim();
  return /^(hi|hello|hey|namaste|vanakkam|namaskara|pranam|good\s+(morning|afternoon|evening)|how\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do|help\s*me|help\b)/i.test(norm);
}

function isDoctorPrep(text: string): boolean {
  const norm = text.toLowerCase();
  return /prepare|doctor|consult|appointment|questions?\s+to\s+ask|what\s+should\s+i\s+ask|ask\s+(the\s+)?doctor|visit\s+prep/i.test(norm);
}

function isDocumentQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /document|report|scan|prescription|upload|file|test\s+report|blood\s+test|x-?ray|mri|how\s+to\s+upload/i.test(norm);
}

function isAnatomyQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /where\s+does\s+it\s+hurt|body\s+(map|diagram|part)|affected\s+area|severity\s*&\s*area|point\s+to\s+pain|how\s+to\s+select\s+body/i.test(norm);
}

function isVoiceHelpQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /voice|microphone|mic\b|speak|how\s+to\s+(use\s+voice|talk|speak)/i.test(norm);
}

function isSymptomQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /pain|hurt|ache|fever|cough|cold|headache|stomach|vomit|nausea|dizziness|swelling|rash|sore|burning|cramp|fatigue|tired|weakness|breathless|burning|itching/i.test(norm);
}

export async function answerPatient(
  c: PoolClient,
  sessionId: string,
  message: string,
  clientMutationId: string
) {
  const safety = detectSafetySignals([message]);

  // Unicode-safe word segmentation preserving Indian script characters and alphanumeric terms
  const terms = message
    .toLowerCase()
    .split(/[\s,.;:!?।|॥\-\(\)\[\]{}'"]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .slice(0, 8);

  const search = async (corpus: "MODERN_MEDICINE" | "AYURVEDA") => {
    if (!terms.length) return { rows: [] as any[] };
    const queryText = terms.join(" ");
    return c.query(
      `SELECT d.title, d.source, d.section, k.content 
       FROM knowledge_chunks k 
       JOIN knowledge_documents d ON d.id = k.document_id 
       WHERE d.corpus = $1 
         AND k.search_vector @@ plainto_tsquery('simple', $2) 
       ORDER BY ts_rank(k.search_vector, plainto_tsquery('simple', $2)) DESC 
       LIMIT 2`,
      [corpus, queryText]
    );
  };

  // Run searches sequentially over the single transaction connection
  const modern = await search("MODERN_MEDICINE");
  const ayurveda = await search("AYURVEDA");

  const citations: Citation[] = [
    ...modern.rows.map((r: any) => ({
      corpus: "MODERN_MEDICINE" as const,
      title: r.title,
      source: r.source,
      section: r.section,
    })),
    ...ayurveda.rows.map((r: any) => ({
      corpus: "AYURVEDA" as const,
      title: r.title,
      source: r.source,
      section: r.section,
    })),
  ];

  let reply = "";

  if (safety.length) {
    reply = `⚠️ Urgent Clinical Notice: ${safety[0].summary} I cannot diagnose this. Please alert hospital staff or emergency care immediately.`;
  } else if (isGreeting(message)) {
    reply = "Namaste! I am Anaya, your MediKiosk health assistant. I can help you organize your symptoms, prepare questions for your doctor, explain medical terms, or assist with uploading records. What would you like help with today?";
  } else if (isDoctorPrep(message)) {
    reply = "To get the most out of your consultation, here are three things to prepare:\n1. Main Concern: When did your symptoms begin and what makes them better or worse?\n2. Current Medications & Allergies: Have a list of any pills or remedies you take.\n3. Key Questions: Ask your doctor what might be causing your symptoms, what tests or treatments are recommended, and what warning signs to watch for.";
  } else if (isDocumentQuery(message)) {
    reply = "You can upload previous prescriptions, lab reports, or scans in the Documents step of this kiosk. For best results, place documents on a flat surface with good lighting and ensure all text is clearly readable. Your doctor will review the original files.";
  } else if (isAnatomyQuery(message)) {
    reply = "On the Severity & Affected Area screen, you can switch between Front and Back views of the body to tap the exact region where you feel discomfort. You can also specify pain severity from mild to very severe.";
  } else if (isVoiceHelpQuery(message)) {
    reply = "You can speak to me in any of our 6 supported languages. Tap the microphone icon, speak clearly into the kiosk microphone, and tap stop when you finish. Your speech will be transcribed securely.";
  } else if (isSymptomQuery(message)) {
    reply = "Thank you for sharing your symptoms. To help the clinical team, please consider noting:\n• When did this start and how often does it occur?\n• How severe is it on a scale from mild to severe?\n• Does the discomfort spread to other parts of your body?\nYou can also mark the exact spot on our Body Diagram screen.";
  } else {
    reply = "I can provide general healthcare information and help you prepare your history for the doctor. I do not provide medical diagnoses or prescriptions.";
  }

  // If knowledge chunks exist, append relevant reference content cleanly
  if (!safety.length && modern.rows[0]) {
    reply += `\n\nReference information: ${String(modern.rows[0].content).slice(0, 420)}`;
  }
  if (!safety.length && ayurveda.rows[0]) {
    reply += `\n\nAyurveda reference: ${String(ayurveda.rows[0].content).slice(0, 260)}`;
  }

  // Idempotent insertion protected against repeated mutations
  await c.query(
    `INSERT INTO chat_messages(session_id, role, content, client_mutation_id) 
     VALUES($1, 'PATIENT', $2, $3)
     ON CONFLICT (session_id, role, client_mutation_id) WHERE client_mutation_id IS NOT NULL DO NOTHING`,
    [sessionId, message, clientMutationId]
  );

  await c.query(
    `INSERT INTO chat_messages(session_id, role, content, intent, citations, provider, client_mutation_id) 
     VALUES($1, 'ASSISTANT', $2, $3, $4, 'deterministic-kb', $5)
     ON CONFLICT (session_id, role, client_mutation_id) WHERE client_mutation_id IS NOT NULL DO NOTHING`,
    [sessionId, reply, safety.length ? "SAFETY" : "INFORMATION", JSON.stringify(citations), clientMutationId]
  );

  return { reply, citations, safety, idempotent: false };
}

