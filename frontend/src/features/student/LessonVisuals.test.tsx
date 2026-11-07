import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConceptMap, readMinutes, TermFlashcards, VisualMarkdown } from "./LessonVisuals";

const md = (markdown: string, terms: string[] = []) =>
  renderToStaticMarkup(<VisualMarkdown markdown={markdown} terms={terms} />);

describe("VisualMarkdown", () => {
  it("turns numbered lists into a step timeline and bullet lists into cards", () => {
    expect(md("1. Heat the water\n2. Add salt")).toContain('class="lv-steps"');
    expect(md("- Nucleus\n- Ribosome\n- Membrane")).toContain('class="lv-cards ');
  });

  it("turns 'Picture…' and 'For example…' paragraphs into callouts", () => {
    const html = md("Picture a brick wall made of bricks.\n\nFor example, a red blood cell carries oxygen.");
    expect(html).toContain("lv-callout-picture");
    expect(html).toContain("Picture this");
    expect(html).toContain("lv-callout-example");
  });

  it("makes bold key terms clickable, but leaves other bold text alone", () => {
    const html = md("A **cell** is small. This is **very** important.", ["cell"]);
    expect(html).toContain('class="lv-term "');
    expect(html).toContain("<strong>very</strong>");
  });

  it("leaves ordinary paragraphs as text", () => {
    expect(md("Cells divide.")).toBe("<p>Cells divide.</p>");
  });
});

describe("ConceptMap", () => {
  it("draws the topic with its key terms, and nothing for fewer than two terms", () => {
    const html = renderToStaticMarkup(<ConceptMap title="Cells" terms={["cell", "organism", "tissue"]} onTerm={() => {}} />);
    expect(html).toContain("Cells");
    expect((html.match(/lv-map-node/g) ?? []).length).toBe(3);
    expect(renderToStaticMarkup(<ConceptMap title="Cells" terms={["cell"]} onTerm={() => {}} />)).toBe("");
  });
});

describe("TermFlashcards", () => {
  it("builds cards from key terms with the sentence that explains them", () => {
    const html = renderToStaticMarkup(
      <TermFlashcards
        sections={[
          { title: "Cells", body_markdown: "A **cell** is the smallest unit of life. An **organism** is a living thing made of cells.", key_terms: ["cell", "organism", "missing term"] },
        ]}
      />,
    );
    expect(html).toContain("1 / 2");
    expect(html).toContain("2 key terms from this lesson");
    expect(html).toContain("A cell is the smallest unit of life.");
    expect(html).toContain("Got it");
    expect(html).toContain("lv-deck-back"); // the next card peeks out behind
  });

  it("estimates reading time in whole minutes (at least one)", () => {
    expect(readMinutes("short")).toBe(1);
    expect(readMinutes(Array(600).fill("word").join(" "))).toBe(3);
  });
});
