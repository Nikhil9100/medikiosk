export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
                MediKiosk
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                AI-assisted clinical intake and digitization
              </h1>
            </div>
            <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Clinical workflow foundation
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">
              Patient Kiosk
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Accessible intake workflow</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li>• One-question-per-screen patient experience.</li>
              <li>• Voice, touch, and multilingual support ready.</li>
              <li>• Explicit clinical states and provenance tracking.</li>
              <li>• Safety-first red flag and escalation boundaries.</li>
            </ul>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Doctor Console
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Clinical review workspace</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li>• Structured review of patient facts and history.</li>
              <li>• Document provenance and OCR extraction visibility.</li>
              <li>• AI summary labeled as review-required.</li>
              <li>• RAG and evidence workflows kept distinct from diagnosis.</li>
            </ul>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-4">
          {[
            ["Clinical data", "Typed states, provenance, safety boundaries"],
            ["Voice layer", "Sarvam-ready provider abstraction"],
            ["Documents", "OCR, extraction, and provenance"],
            ["RAG", "Ayurveda and modern evidence separation"],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
