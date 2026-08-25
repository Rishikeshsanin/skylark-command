const modules = [
  {
    title: "Deal Funnel Intelligence",
    copy: "Live pipeline health, conversion, sector mix, stage velocity, and risk signals from monday.com.",
  },
  {
    title: "Work Order Operations",
    copy: "Track throughput, delays, status distribution, ownership, and operational bottlenecks.",
  },
  {
    title: "Executive Copilot",
    copy: "Ask business questions in natural language and receive grounded, metric-backed answers.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-12">
      <header className="flex items-center justify-between border-b border-white/10 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300/70">
            Business Intelligence Copilot
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Skylark Command
          </h1>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
          Foundation v0.1
        </span>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-emerald-300">Monday.com → Analytics → Decisions</p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl">
            Turn live sales and operations data into answers leaders can act on.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
            Skylark Command is being built as a dynamic BI layer over monday.com. The application will normalize live board data, compute deterministic metrics, and use AI only where it adds value.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {modules.map((module) => (
            <article
              key={module.title}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur"
            >
              <div className="mb-5 h-8 w-8 rounded-xl border border-emerald-300/20 bg-emerald-300/10" />
              <h3 className="text-lg font-semibold">{module.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/55">{module.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 pt-5 text-xs text-white/35">
        Architecture first. No hardcoded business data. No secrets in the client.
      </footer>
    </main>
  );
}
