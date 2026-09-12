import type { PoolClient } from "pg";
import { detectSafetySignals } from "./safety-signals";

export type Citation = {
  corpus: "MODERN_MEDICINE" | "AYURVEDA";
  title: string;
  source: string;
  section: string | null;
};

type ChatTurn = {
  role: "PATIENT" | "ASSISTANT";
  content: string;
};

// Conversational intent classification helpers
function isGreeting(text: string): boolean {
  const norm = text.toLowerCase().trim();
  return /^(hi|hello|hey|namaste|vanakkam|namaskara|pranam|good\s+(morning|afternoon|evening)|how\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do|help\s*me|help\b)/i.test(norm);
}

function isFitnessQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /fit|fitness|exercise|workout|gym|walking|cardio|strength|stamina|weight\s*loss|stay\s+fit|how\s+much\s+exercise|active\s+living/i.test(norm);
}

function isSleepQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /sleep|insomnia|tired|rest|bedtime|wake\s*up|sleeping\s+routine|can('?t|not)\s+sleep|healthy\s+sleep/i.test(norm);
}

function isNutritionQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /diet|food|nutrition|eating|eat|water|hydration|drink|healthy\s+meal|fruits|vegetables|digestion|gut|nutrition/i.test(norm);
}

function isFeverOrVitalsQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /fever|temperature|chills|blood\s+pressure|bp\b|sugar|diabetes|pulse|heart\s+rate|vitals/i.test(norm);
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

function isGeneralWellnessQuery(text: string): boolean {
  const norm = text.toLowerCase();
  return /wellness|healthy\s+living|health\s+tips|stay\s+healthy|lifestyle|prevent\s+disease|ayurveda|dashavidha|dosha|daily\s+routine/i.test(norm);
}

/**
 * Calls Gemini if GEMINI_API_KEY is configured.
 */
async function callGemini(
  message: string,
  history: ChatTurn[],
  citations: Citation[],
  language: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const citationText = citations.length
    ? `\n\nVerified Reference Knowledge:\n${citations
        .map((c) => `[${c.corpus === "AYURVEDA" ? "Ayurveda" : "Modern Medicine"}: ${c.title}] - ${c.source}`)
        .join("\n")}`
    : "";

  const systemPrompt = `You are Anaya, the warm, knowledgeable, and empathetic health assistant on the MediKiosk clinical intake platform.
Your objective is to help patients prepare for their doctor consultation and provide reliable, supportive general health and wellness information.

Guidelines:
1. Always answer the patient's specific question directly and informatively (fitness, sleep, nutrition, vitals, symptoms, doctor prep, medical records, or kiosk navigation).
2. Maintain a warm, clear, conversational tone without medical jargon.
3. CLINICAL BOUNDARY: Never diagnose specific conditions, claim certainty about what illness a patient has, or prescribe drugs/dosages. If the patient asks about symptoms or treatments, provide general physiological explanations and encourage discussing with their doctor.
4. Keep clinical disclaimers brief, natural, and contextual (e.g., "Your doctor can help personalize this to your medical history."). Do not make the entire response a disclaimer.
5. Offer 1 helpful follow-up question or suggest relevant next steps when appropriate.
6. Language: Respond in ${language === "hi" ? "Hindi" : language === "bn" ? "Bengali" : language === "te" ? "Telugu" : language === "ta" ? "Tamil" : language === "mr" ? "Marathi" : "English"}.${citationText}`;

  const contents = [
    ...history.slice(-6).map((h) => ({
      role: h.role === "PATIENT" ? ("user" as const) : ("model" as const),
      parts: [{ text: h.content }],
    })),
    {
      role: "user" as const,
      parts: [{ text: message }],
    },
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 600,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof replyText === "string" && replyText.trim() ? replyText.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic conversational knowledge engine for offline / sandbox / fallback mode.
 */
function getDeterministicResponse(
  message: string,
  history: ChatTurn[],
  modernRows: any[],
  ayurvedaRows: any[]
): string {
  const norm = message.toLowerCase();

  // Check recent context if the message is a follow-up
  const lastPatient = history.filter((h) => h.role === "PATIENT").pop()?.content.toLowerCase() || "";
  const isFollowUp = norm.length < 25 && (norm.includes("how much") || norm.includes("tell me more") || norm.includes("what about") || norm.includes("why"));

  if (isGreeting(message)) {
    return "Namaste! I am Anaya, your MediKiosk health assistant. I can help you organize your symptoms, prepare questions for your doctor, understand wellness habits (like fitness, sleep, and nutrition), or guide you through uploading medical records. What would you like help with today?";
  }

  if (isFitnessQuery(message) || (isFollowUp && isFitnessQuery(lastPatient))) {
    return `For overall fitness and cardiovascular health, health guidelines recommend:

• Aerobic Activity: Aim for at least 150 minutes of moderate activity (such as brisk walking, swimming, or cycling) per week, or 75 minutes of vigorous exercise.
• Strength Training: Include exercises for major muscle groups (legs, hips, back, chest, core, shoulders, arms) at least 2 days a week.
• Daily Movement: Break up long periods of sitting by taking short walking breaks and using stairs when possible.
• Progression: Start gradually and build consistency before increasing intensity.

Would you like more details on building a daily walking routine, strength exercises, or preparing questions for your doctor?`;
  }

  if (isSleepQuery(message) || (isFollowUp && isSleepQuery(lastPatient))) {
    return `Good sleep is essential for physical recovery and mental focus. Here are key habits for healthy sleep:

• Consistent Schedule: Go to bed and wake up at the same time every day, even on weekends.
• Wind-Down Routine: Turn off glowing screens (phones, TVs) 30–60 minutes before bedtime.
• Restful Environment: Keep your bedroom dark, quiet, and comfortably cool.
• Evening Habits: Avoid heavy meals, caffeine, and stimulating activities late in the evening.

Most adults benefit from 7 to 9 hours of quality sleep. Would you like relaxation techniques or advice on managing daytime fatigue?`;
  }

  if (isNutritionQuery(message) || (isFollowUp && isNutritionQuery(lastPatient))) {
    return `A wholesome, balanced diet supports sustained energy, digestion, and long-term health:

• Balanced Plate: Fill half your plate with colorful vegetables and fruits, one quarter with whole grains (millets, brown rice, whole wheat), and one quarter with lean protein or pulses/legumes.
• Hydration: Drink 2 to 3 liters of clean water daily unless your doctor has advised fluid restrictions.
• Limit Processed Foods: Reduce excess refined sugar, deep-fried snacks, and high-sodium packaged foods.
• Mindful Eating: Eat at regular meal times and chew food thoroughly to support healthy digestion.

Would you like advice on balanced meal planning, hydration habits, or digestive wellness?`;
  }

  if (isFeverOrVitalsQuery(message)) {
    return `Here is helpful information regarding body vitals and fever:

• Fever: A body temperature of 100.4°F (38°C) or higher is usually the body's natural immune response to fight infection. Rest, stay well hydrated with water or oral rehydration fluids, and wear light clothing.
• Blood Pressure: A normal resting blood pressure for adults is generally around 120/80 mmHg.
• Heart Rate: A normal resting heart rate typically ranges between 60 and 100 beats per minute.

⚠️ When to seek prompt medical attention: If a fever exceeds 103°F (39.4°C), lasts more than 3 days, or is accompanied by severe headache, stiff neck, or difficulty breathing, please consult a doctor immediately.`;
  }

  if (isDoctorPrep(message)) {
    return `To make the most of your time with the doctor, here is a helpful 3-step checklist:

1. Main Symptom Timeline: Note when your primary discomfort started, what makes it better or worse, and how often it happens.
2. Current Medications & Allergies: List all prescription pills, over-the-counter remedies, vitamins, and known drug allergies.
3. Three Key Questions to Ask:
   • "What could be causing my symptoms?"
   • "Are any lab tests, scans, or lifestyle adjustments recommended?"
   • "What warning signs should prompt me to seek immediate medical follow-up?"

Would you like help describing your symptoms or organizing your medical documents?`;
  }

  if (isDocumentQuery(message)) {
    return `You can scan or upload previous prescriptions, lab test reports, and imaging records in the Documents step of this kiosk:

• Tips for Clear Uploads: Place documents flat in good lighting, make sure all four corners are visible, and ensure text is sharp and legible.
• Clinical Review: Your doctor will review the original files and any extracted medical history.
• Privacy: Your documents are securely attached to this clinical visit.

Would you like to open the Documents step now or ask about a specific type of report?`;
  }

  if (isAnatomyQuery(message)) {
    return `On the Severity & Affected Area screen, you can accurately indicate where you are feeling pain or discomfort:

• Tap between Front and Back views of the human body diagram to select specific regions (head, chest, abdomen, back, arms, legs).
• Choose your pain severity on a scale from Mild to Very severe.
• You can also use voice to speak the affected area naturally.

Would you like to navigate directly to the Body Diagram screen?`;
  }

  if (isVoiceHelpQuery(message)) {
    return `MediKiosk supports voice input in all 6 available languages (English, Hindi, Bengali, Telugu, Tamil, Marathi):

• Tap the microphone button (🎙️) on this screen.
• Speak your question or symptom clearly into the kiosk microphone.
• Tap stop (■) when finished, and Anaya will transcribe your words and assist you.`;
  }

  if (isSymptomQuery(message)) {
    return `Thank you for sharing your symptoms. To help the clinical team prepare your intake, please consider noting:

• Duration & Onset: When did you first notice this, and did it start suddenly or gradually?
• Severity: How would you rate the intensity from mild to severe?
• Radiation: Does the discomfort spread to nearby areas (such as your back, shoulder, or abdomen)?
• Modifying Factors: Does eating, resting, or movement make it better or worse?

You can also pinpoint the exact location on our interactive Body Diagram screen so the physician sees it immediately.`;
  }

  if (isGeneralWellnessQuery(message)) {
    let reply = `Healthy living is built on consistent daily habits:

• Regular Movement: Daily walking and regular physical activity.
• Nourishing Nutrition: Fresh, balanced meals and proper hydration.
• Restorative Sleep: 7–9 hours of sleep with a predictable sleep schedule.
• Stress Management: Mindful breathing, relaxation, and routine breaks.`;

    if (ayurvedaRows[0]) {
      reply += `\n\nAyurveda wellness perspective: ${String(ayurvedaRows[0].content).slice(0, 300)}`;
    }
    return reply + `\n\nWould you like guidance on exercise, food, sleep, or preparing for your doctor?`;
  }

  // If RAG evidence exists, synthesize it clearly
  if (modernRows[0] || ayurvedaRows[0]) {
    let reply = "Here is reference information from our clinical knowledge base:";
    if (modernRows[0]) {
      reply += `\n\n• Modern Clinical Reference: ${String(modernRows[0].content).slice(0, 420)}`;
    }
    if (ayurvedaRows[0]) {
      reply += `\n\n• Ayurveda Reference: ${String(ayurvedaRows[0].content).slice(0, 300)}`;
    }
    reply += "\n\nFeel free to ask follow-up questions or discuss these points with your doctor.";
    return reply;
  }

  // Friendly conversational fallback for any other general questions
  return `I am here to assist with your healthcare visit. You can ask me about:

• General Health & Wellness: Fitness guidelines, healthy sleep, balanced nutrition, and hydration.
• Consultation Preparation: What questions to ask your doctor and organizing your health history.
• Symptoms & Body Map: Describing how you feel and pointing out affected areas on the diagram.
• Medical Records: Photographing and uploading past prescriptions or lab tests.

What topic would you like to explore?`;
}

export async function answerPatient(
  c: PoolClient,
  sessionId: string,
  message: string,
  clientMutationId: string,
  language: string = "en"
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

  // Retrieve recent conversation history for conversational context awareness
  const historyRes = await c.query(
    `SELECT role, content 
     FROM chat_messages 
     WHERE session_id = $1 
     ORDER BY created_at ASC, id ASC 
     LIMIT 8`,
    [sessionId]
  );
  const history: ChatTurn[] = historyRes.rows.map((r: any) => ({
    role: r.role,
    content: r.content,
  }));

  let reply = "";

  if (safety.length) {
    reply = `⚠️ Urgent Clinical Notice: ${safety[0].summary} I cannot diagnose this. Please alert hospital staff or emergency care immediately.`;
  } else {
    // Try Gemini AI if configured
    const aiReply = await callGemini(message, history, citations, language);
    if (aiReply) {
      reply = aiReply;
    } else {
      // Deterministic, rich conversational knowledge engine fallback
      reply = getDeterministicResponse(message, history, modern.rows, ayurveda.rows);
    }
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
     VALUES($1, 'ASSISTANT', $2, $3, $4, $5, $6)
     ON CONFLICT (session_id, role, client_mutation_id) WHERE client_mutation_id IS NOT NULL DO NOTHING`,
    [
      sessionId,
      reply,
      safety.length ? "SAFETY" : "INFORMATION",
      JSON.stringify(citations),
      process.env.GEMINI_API_KEY ? "gemini-2.0-flash" : "deterministic-kb",
      clientMutationId,
    ]
  );

  return { reply, citations, safety, idempotent: false };
}


