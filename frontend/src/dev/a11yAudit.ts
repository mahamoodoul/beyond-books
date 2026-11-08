/**
 * Development-only accessibility check for the page you are looking at (docs/ACCESSIBILITY.md).
 * In the browser console of `npm run dev`:
 *
 *   __a11yAudit()
 *
 * It reports text below WCAG AA contrast (in the current theme), controls without an accessible
 * name, form fields without a label, images without alt text, duplicate ids, positive tabindex,
 * and pages without exactly one <main> and one <h1>. It is a quick guard before a pull request,
 * not a replacement for a keyboard and screen-reader pass.
 */

export interface A11yIssue {
  rule: string;
  message: string;
  element?: Element;
}

type RGBA = [number, number, number, number];

/** WCAG relative luminance of an sRGB colour (0-255 channels). */
export function luminance([r, g, b]: [number, number, number] | RGBA): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours, 1 to 21. */
export function contrastRatio(a: [number, number, number] | RGBA, b: [number, number, number] | RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA minimum for text: 3:1 for large text (24px, or 18.66px bold), otherwise 4.5:1. */
export function requiredContrast(fontSizePx: number, fontWeight: number): number {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}

/** Any CSS colour (oklch, color-mix, ...) as RGBA via a 1x1 canvas. */
function colourResolver(): (css: string) => RGBA {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return (css) => {
    if (!ctx) return [0, 0, 0, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

function accessibleName(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  const fromIds = labelledBy
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const fromImages = [...el.querySelectorAll("img[alt], svg[aria-label]")]
    .map((i) => i.getAttribute("alt") ?? i.getAttribute("aria-label") ?? "")
    .join(" ");
  return [el.getAttribute("aria-label"), fromIds, el.textContent, el.getAttribute("title"), fromImages]
    .map((s) => (s ?? "").trim())
    .find(Boolean) ?? "";
}

function describe(el: Element): string {
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}>${text ? ` "${text}"` : ""}`;
}

function contrastIssues(doc: Document): A11yIssue[] {
  const toRGBA = colourResolver();
  const background = (el: Element | null): RGBA | null => {
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== "none") return null; // gradient/image: can't judge
      const c = toRGBA(s.backgroundColor);
      if (c[3] > 0.5) return c;
    }
    return toRGBA(getComputedStyle(doc.body).backgroundColor);
  };
  const issues: A11yIssue[] = [];
  const seen = new Set<Element>();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || (n.textContent ?? "").trim().length < 2) continue;
    seen.add(el);
    if (!visible(el) || el.closest('[aria-hidden="true"], .visually-hidden')) continue;
    const s = getComputedStyle(el);
    if (Number(s.opacity) < 0.5) continue;
    const bg = background(el);
    if (!bg) continue;
    const fg = toRGBA(s.color);
    const mixed: RGBA = [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])) as unknown as RGBA;
    const ratio = contrastRatio(mixed, bg);
    const need = requiredContrast(parseFloat(s.fontSize), parseInt(s.fontWeight, 10));
    if (ratio < need) {
      issues.push({ rule: "contrast", message: `${ratio.toFixed(2)}:1 (needs ${need}:1) ${describe(el)}`, element: el });
    }
  }
  return issues;
}

/** All checks for the current document. */
export function runA11yAudit(doc: Document = document): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const add = (rule: string, message: string, element?: Element) => issues.push({ rule, message, element });

  for (const el of doc.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="menuitem"]')) {
    if (visible(el) && !accessibleName(el)) add("name", `control without an accessible name ${describe(el)}`, el);
  }
  for (const el of doc.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    if (!visible(el)) continue;
    const labelled =
      el.getAttribute("aria-label") ||
      el.getAttribute("aria-labelledby") ||
      el.closest("label") ||
      (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (!labelled) add("label", `form field without a label ${describe(el)}`, el);
  }
  for (const img of doc.querySelectorAll("img:not([alt])")) add("alt", "image without alt text", img);

  const ids = new Map<string, number>();
  for (const el of doc.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) add("duplicate-id", `id "${id}" is used ${n} times`);

  for (const el of doc.querySelectorAll("[tabindex]")) {
    if (Number(el.getAttribute("tabindex")) > 0) add("tabindex", `positive tabindex breaks the focus order ${describe(el)}`, el);
  }
  const mains = doc.querySelectorAll("main").length;
  if (mains !== 1) add("landmark", `${mains} <main> elements (expected 1)`);
  const h1s = doc.querySelectorAll("h1").length;
  if (h1s !== 1) add("heading", `${h1s} <h1> elements (expected 1)`);

  return [...issues, ...contrastIssues(doc)];
}

declare global {
  interface Window {
    __a11yAudit?: () => A11yIssue[];
  }
}

/** Adds `__a11yAudit()` to the console (development builds only, see main.tsx). */
export function installA11yAudit(): void {
  window.__a11yAudit = () => {
    const issues = runA11yAudit();
    if (issues.length) console.table(issues.map(({ rule, message }) => ({ rule, message })));
    else console.info("__a11yAudit: no issues found on this page");
    return issues;
  };
}
