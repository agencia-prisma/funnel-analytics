export default function AppLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse px-6 py-12">
      <div className="h-3 w-32 rounded bg-white/10" />
      <div className="mt-4 h-10 w-72 rounded bg-white/10" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div className="h-32 rounded-2xl bg-white/5" key={item} />
        ))}
      </div>
    </main>
  );
}
