import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { RegisterPage } from "./RegisterPage";

describe("RegisterPage", () => {
  it("renders the switch, every field with a placeholder, and the code field", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}><MemoryRouter><RegisterPage /></MemoryRouter></QueryClientProvider>,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Teacher");
    expect(html).toContain("Student");
    expect(html).toContain('placeholder="e.g. Ingrid Hansen"');
    expect(html).toContain('placeholder="you@school.no"');
    expect(html).toContain('placeholder="e.g. purple-heart-beats-fast"');
    expect(html).toContain('placeholder="e.g. BIOL-OGY1-01DE-MO26"');
    expect(html).toContain("Create teacher account");
    expect(html).not.toContain("Please enter your name."); // nothing touched yet: no warnings
  });
});
