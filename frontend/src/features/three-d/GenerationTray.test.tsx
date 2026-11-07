import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BuildingBadge, GenerationTray } from "./GenerationTray";

const job = (over: Record<string, unknown>) => ({
  job_id: crypto.randomUUID(),
  asset_id: crypto.randomUUID(),
  asset_name: "Human heart",
  provider: "blender",
  status: "retrying",
  error_message: null,
  created_at: new Date(Date.now() - 90_000).toISOString(),
  finished_at: null,
  prompt_preview: "A human heart",
  has_model: false,
  ...over,
});

function render(jobs: unknown[], node = <GenerationTray onOpen={() => {}} />) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["generation-jobs"], jobs);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("GenerationTray", () => {
  it("shows running builds with a progress bar and elapsed time", () => {
    const html = render([job({})]);
    expect(html).toContain("Building in the background (1)");
    expect(html).toContain("Claude is building in Blender");
    expect(html).toContain('role="progressbar"');
    expect(html).toMatch(/aria-valuenow="([1-9]|[1-8]\d|9[0-5])"/); // started, never "finished"
    expect(html).toContain("1:30");
  });

  it("offers Retry for failures and Review for finished models", () => {
    const html = render([
      job({ asset_name: "Atom", status: "failed", error_message: "NameError: bmesh" }),
      job({ asset_name: "Cell", status: "completed", has_model: true }),
    ]);
    expect(html).toContain("Recent 3D generations");
    expect(html).toContain("NameError: bmesh");
    expect(html).toContain("Retry");
    expect(html).toContain("Review");
  });

  it("renders nothing without generations, and a badge only while building", () => {
    expect(render([])).toBe("");
    expect(render([job({})], <BuildingBadge />)).toContain("1 building");
    expect(render([job({ status: "completed" })], <BuildingBadge />)).toBe("");
  });
});
