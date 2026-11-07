export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-navy-950">{title}</h1>
      <p className="mt-2 text-slate-600">Not built yet — planned for {phase}.</p>
    </section>
  );
}
