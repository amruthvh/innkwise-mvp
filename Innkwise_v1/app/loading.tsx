export default function Loading() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center rounded-[2rem] border border-white/10 bg-[#0b1020]/90 px-5 py-8 shadow-[0_20px_70px_rgba(15,23,42,0.35)] sm:px-8 sm:py-10">
        <div className="flex flex-col items-center gap-4 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
            IN
          </div>
          <div className="space-y-2 text-center">
            <p className="text-lg font-semibold tracking-[0.2em] text-white">Innkwise</p>
            <p className="text-sm text-slate-400">Loading...</p>
          </div>
        </div>
      </div>
    </main>
  );
}
