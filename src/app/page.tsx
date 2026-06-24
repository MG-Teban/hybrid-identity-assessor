import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <span className="text-blue-600 font-bold text-lg tracking-tight">MigrateReady</span>
          <span className="text-slate-300 text-sm">|</span>
          <span className="text-slate-500 text-sm">AD → Entra ID Assessor</span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-2xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5 text-sm text-blue-700 font-medium">
            <span className="w-2 h-2 bg-blue-500 rounded-full" />
            30 automated readiness checks
          </div>

          <h1 className="text-5xl font-bold text-slate-900 leading-tight">
            Know exactly what's blocking your<br />
            <span className="text-blue-600">Entra ID migration</span>
          </h1>

          <p className="text-xl text-slate-600 leading-relaxed max-w-xl mx-auto">
            Upload your AD export. Get a scored readiness report with blockers, remediation steps, and a dependency-aware migration wave plan — in under 60 seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/assess?demo=1"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-8 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              Try with MinerTech demo
            </Link>
            <Link
              href="/assess"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-8 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
            >
              Upload your export
            </Link>
          </div>
        </div>

        {/* Feature grid */}
        <div className="mt-20 max-w-4xl w-full grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              icon: '🔍',
              title: '30 Readiness Checks',
              desc: 'Identity hygiene, sync readiness, auth modernisation, privileged access, group rationalisation, device & GPO posture.',
            },
            {
              icon: '📊',
              title: 'Scored + Prioritised',
              desc: 'Weighted severity score (0–100). Blockers cap the score at 49. Each finding links to Microsoft Learn remediation docs.',
            },
            {
              icon: '🌊',
              title: 'Wave Planner',
              desc: 'Dependency-aware migration waves. IT pilot first, privileged accounts last. Drag to reassign users between waves.',
            },
          ].map(f => (
            <div key={f.title} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="font-semibold text-slate-800">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
        MigrateReady · AD → Entra ID Assessment Toolkit
      </footer>
    </div>
  )
}
