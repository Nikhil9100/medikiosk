const foundationCards = [
  ["Clinical data", "Typed states, provenance, and explicit patient safety boundaries."],
  ["Voice layer", "Provider abstraction ready for Sarvam STT and TTS orchestration."],
  ["Documents", "OCR, extraction, and provenance tracking are isolated from the UI."],
  ["Evidence base", "Ayurveda and modern medicine retrieval remain separate and reviewable."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:gap-6 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-indigo-700">
                MediKiosk
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                AI-assisted clinical intake and document digitization
              </h1>
            </div>
            <div className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              Phase 0 foundation
            </div>
          </div>
        </header>

        <nav aria-label="product domains" className="flex flex-wrap gap-2">
          {['Architecture', 'Clinical safety', 'Voice', 'RAG', 'Security'].map((item) => (
            <span
              key={item}
              className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              {item}
            </span>
          ))}
        </nav>

        <section aria-labelledby="patient-kiosk-heading" className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-indigo-700">
              Patient Kiosk
            </div>
            <h2 id="patient-kiosk-heading" className="text-xl font-semibold text-slate-900">
              Accessible intake workflow
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <li>• One-question-per-screen design keeps patient engagement focused.</li>
              <li>• Multilingual, touch, and voice-ready UX is planned for future screens.</li>
              <li>• Explicit fact states and provenance remain central to the clinical model.</li>
              <li>• Safety-first escalation rules are separated from the AI decision layer.</li>
            </ul>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-700">
              Doctor Console
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Structured review workspace</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <li>• Doctor-facing workflows are isolated from patient touch interactions.</li>
              <li>• Source provenance, OCR visibility, and AI labeling remain reviewable.</li>
              <li>• Safety overrides and evidence are kept distinct from autonomous diagnosis.</li>
              <li>• The next product increments stay intentionally outside this phase boundary.</li>
            </ul>
          </article>
        </section>

        <section aria-labelledby="foundation-panel-heading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {foundationCards.map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
