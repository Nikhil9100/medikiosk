export default function ProvidersPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Provider boundaries</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">AI, voice, and data provider status</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Gemini", "LLM provider abstraction and safety boundary"],
            ["Sarvam", "Voice service abstraction, STT/TTS separation"],
            ["Supabase", "Database, auth, storage, and RLS boundary"],
          ].map(([name, detail]) => (
            <article key={name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
              <p className="mt-2 text-sm text-slate-600">{detail}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
