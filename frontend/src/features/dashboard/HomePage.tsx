import { useHealth } from "@/api/health";

const STEPS = ["Upload", "Generate", "Explore", "Understand", "Assess", "Improve"];

export function HomePage() {
  const health = useHealth();

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-navy-950">
          Turn textbooks into interactive 3D learning.
        </h1>
        <ol className="mt-4 flex flex-wrap gap-2" aria-label="Workflow">
          {STEPS.map((step) => (
            <li key={step} className="rounded-full bg-white px-3 py-1 text-sm shadow-sm">
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4" aria-live="polite">
        <h2 className="text-sm font-medium text-slate-500">Backend status</h2>
        {health.isPending && <p>Checking…</p>}
        {health.isError && (
          <p className="text-red-700">Unreachable — is the API running on :8000?</p>
        )}
        {health.isSuccess && (
          <p className="text-green-700">
            {health.data.status} ({health.data.environment})
          </p>
        )}
      </div>
    </section>
  );
}
