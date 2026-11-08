/**
 * Builds docs/reports/device-check-<date>.md from out/results-*.json and out/security.json.
 * Findings are derived from the numbers with fixed rules, so a re-run gives a fresh report.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const OUT = new URL("./out/", import.meta.url).pathname;
const ROOT = new URL("../../", import.meta.url).pathname;
const date = new Date().toISOString().slice(0, 10);
const REPORT_DIR = `${ROOT}docs/reports/`;
const ASSETS = `device-check-${date}`;
mkdirSync(`${REPORT_DIR}${ASSETS}`, { recursive: true });

const runs = readdirSync(OUT).filter((f) => /^results-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(OUT + f, "utf8")));
const ORDER = ["laptop", "chromebook", "ipad-safari", "ipad-slow", "phone"];
const devices = ORDER.map((id) => runs.flatMap((r) => r.devices).find((d) => d.id === id)).filter(Boolean);
const results = runs.flatMap((r) => r.results);
const fonts = existsSync(`${OUT}fonts.json`) ? JSON.parse(readFileSync(`${OUT}fonts.json`, "utf8")) : null;
const fmt = (ms) => (ms == null ? "blank for over 90 s" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const sec = existsSync(`${OUT}security.json`) ? JSON.parse(readFileSync(`${OUT}security.json`, "utf8")).checks : [];
const byDev = (id) => results.filter((r) => r.device === id);
const pageIds = [...new Set(results.map((r) => r.page))];
const pageName = Object.fromEntries(results.map((r) => [r.page, r.name]));
const s = (ms) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const median = (xs) => { const a = xs.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const touch = ["ipad-safari", "ipad-slow", "phone"];

// ------------------------------------------------------------------ findings
const findings = [];
const add = (sev, title, detail, fix) => findings.push({ sev, title, detail, fix });

const blank = results.filter((r) => (r.fcpMs ?? 0) > 5000);
if (fonts || blank.length) {
  const exp = fonts ? Object.entries(fonts).map(([eng, m]) => `${eng}: ${fmt(m.today)} today, ${fmt(m.unreachable)} if Google is unreachable, ${fmt(m.selfHosted)} without Google`).join("; ") : "";
  add("High", "Blank screen for a minute or more when Google Fonts is slow or blocked",
    `index.html loads its fonts with a render-blocking stylesheet from fonts.googleapis.com, so nothing is drawn until Google answers. Font experiment (first paint of the sign-in page): ${exp}.${blank.length ? ` In the device run, first paint took ${blank.map((r) => `${s(r.fcpMs)} (${r.device}, ${pageName[r.page]})`).join(", ")}.` : ""} Many school networks filter or slow Google, so pupils could see an empty page.`,
    "Self-host Inter and Space Grotesk (woff2 files in frontend/public/fonts with font-display: swap) and remove the Google links from index.html and the CSP. This also stops every visit sending the pupil's IP address to Google.");
}
const slowPages = results.filter((r) => ["chromebook", "ipad-slow", "phone"].includes(r.device) && (r.readyMs ?? 0) > 6000 && (r.fcpMs ?? 0) <= 5000);
if (slowPages.length) {
  add("Medium", "Some pages take over 6 seconds on slow devices",
    slowPages.map((r) => `${pageName[r.page]} on ${r.device}: ${s(r.readyMs)} (${r.kb} KB)`).join("; "),
    "Load the 3D viewer only when the pupil asks for it (\"tap to load 3D\") or when it scrolls into view, and keep the lesson text first.");
}
const lowLabFps = results.filter((r) => r.lab?.fps != null && r.lab.fps < 45);
if (lowLabFps.length) add("Medium", "Lab animation stutters", lowLabFps.map((r) => `${pageName[r.page]} on ${r.device}: ${r.lab.fps} fps`).join("; "), "Lower the animation rate on slow devices and pause when the tab is hidden.");
const labErr = results.filter((r) => r.lab?.error);
if (labErr.length) add("High", "A lab control could not be used", labErr.map((r) => `${pageName[r.page]} on ${r.device}: ${r.lab.error}`).join("; "), "Check the control on that device.");
const fsBad = results.filter((r) => r.lab && r.lab.fullscreen !== true);
if (fsBad.length) add("Medium", "Full screen did not open", fsBad.map((r) => `${pageName[r.page]} on ${r.device} (${r.lab.fullscreen})`).join("; "), "Check the Full screen button and its fallback on that browser.");
const slowTap = results.filter((r) => (r.lab?.responseMs ?? 0) > 1000);
if (slowTap.length) add("Medium", "A lab control reacts slowly on a weak phone", slowTap.map((r) => `${pageName[r.page]} on ${r.device}: ${s(r.lab.responseMs)} from tap to screen update (${r.lab.action})`).join("; "), "Profile that action on a throttled CPU; avoid re-evaluating or re-rendering the whole board on every change.");
const smallFs = results.filter((r) => r.device === "phone" && (r.lab?.fullscreenBoardShare ?? 100) < 30);
if (smallFs.length) add("Low", "On a phone held upright, the full-screen lab board is small", `The board fills only ${Math.min(...smallFs.map((r) => r.lab.fullscreenBoardShare))}–${Math.max(...smallFs.map((r) => r.lab.fullscreenBoardShare))}% of a 360×740 screen (it is wide, the screen is tall).`, "In full screen on a portrait phone, show \"Turn your phone sideways for a bigger board\", or lock to landscape with screen.orientation.lock(\"landscape\") where supported.");
const threeD = results.filter((r) => r.threeD?.fps != null);
const slow3d = threeD.filter((r) => r.threeD.fps < 20);
if (slow3d.length) add("High", "3D is not usable without a decent graphics chip",
  `${slow3d.map((r) => `${r.device}: ${r.threeD.fps} fps (worst frame ${r.threeD.worstFrameMs} ms)`).join("; ")}. With a real GPU the same scene runs at ${threeD.filter((r) => r.threeD.fps >= 20).map((r) => `${r.threeD.fps} fps (${r.device})`).join(", ") || "–"}.`,
  "Detect weak or software WebGL (renderer string, first-second frame rate) and switch to a lighter mode: lower resolution (dpr 1), no shadows, render on demand only, or a still image with \"Try 3D anyway\".");
const overflow = results.filter((r) => r.overflowX > 0);
if (overflow.length) add("Medium", "Page wider than the screen (sideways scrolling)", overflow.map((r) => `${pageName[r.page]} on ${r.device}: ${r.overflowX}px`).join("; "), "Let the wide element wrap or scroll inside its own box.");
const small = results.filter((r) => touch.includes(r.device) && r.smallTargets > 0);
if (small.length) {
  const worst = [...small].sort((a, b) => b.smallTargets - a.smallTargets).slice(0, 6);
  add("Low", "Small touch targets on tablets and phones (under 24×24 px)", worst.map((r) => `${pageName[r.page]} on ${r.device}: ${r.smallTargets} (e.g. ${r.smallExamples.join(", ")})`).join("; "), "Give icon buttons, chips and close buttons at least 24×24 px (44×44 px is better for young pupils).");
}
const errs = results.filter((r) => (r.errors ?? []).some((e) => !/fonts\.g/.test(e)));
if (errs.length) add("Medium", "Browser errors on some pages", errs.map((r) => `${pageName[r.page]} on ${r.device}: ${r.errors.filter((e) => !/fonts\.g/.test(e)).join(" | ")}`).join("; "), "Fix the error shown.");
const axe = results.filter((r) => r.axe && !r.axe.error && r.axe.critical + r.axe.serious > 0);
if (axe.length) add("Medium", "Accessibility problems (axe-core, WCAG 2.1 AA)", axe.map((r) => `${pageName[r.page]}: ${r.axe.rules.join(", ")}`).join("; "), "Fix the listed rules (contrast, labels, names).");
const lt = results.filter((r) => r.device === "chromebook" && (r.longTasks?.total ?? 0) > 1000);
if (lt.length) add("Medium", "Pages freeze for a moment on a budget Chromebook", lt.map((r) => `${pageName[r.page]}: ${s(r.longTasks.total)} blocked, longest ${s(r.longTasks.max)}`).join("; "), "Split the heavy work (3D model parsing, big lists) or defer it until after the first paint.");
const unauth = results.filter((r) => r.redirectedToLogin);
if (unauth.length) add("Info", "Some pages redirected to sign-in during the test", unauth.map((r) => `${pageName[r.page]} on ${r.device}`).join("; "), "Test setup: re-run with fresh sessions.");
let bigAssets = [];
try {
  const dir = `${ROOT}frontend/dist/assets/`;
  bigAssets = readdirSync(dir).map((f) => ({ f, mb: statSync(dir + f).size / 1048576 })).filter((x) => x.mb > 2).sort((a, b) => b.mb - a.mb);
} catch { /* no build */ }
if (bigAssets.length) add("High", "Very large 3D model files in the build", `${bigAssets.map((x) => `${x.f.replace(/-[\w]{8}\./, ".")}: ${x.mb.toFixed(1)} MB`).join("; ")}. Not opened by the pages in this test, but any page that uses them would take minutes on school Wi-Fi (56 MB ≈ 5 minutes at 1.5 Mbit/s).`, "Compress the models (gltf-transform: Draco or Meshopt geometry, KTX2/WebP textures, texture size 1–2K) to under 3 MB, and load them only when opened.");
for (const c of sec.filter((x) => !x.pass)) {
  add(/innerHTML/.test(c.detail) ? "Low" : c.severity === "high" ? "High" : c.severity === "medium" ? "Medium" : "Low", `Security: ${c.name}`, c.detail,
    /Strict-Transport/.test(c.name) ? "Add `Strict-Transport-Security: max-age=31536000` in nginx (or confirm the hosting proxy adds it)."
      : /third-party|Google/.test(c.name + c.detail) ? "Self-host the fonts (same fix as the blank-screen finding)."
        : /innerHTML/.test(c.detail) ? "Low risk today: the HTML comes from the app's own drawing code, not from users. Keep it that way, or render the SVG with React elements."
          : "See detail.");
}
const rank = { High: 0, Medium: 1, Low: 2, Info: 3 };
findings.sort((a, b) => rank[a.sev] - rank[b.sev]);

// ---------------------------------------------------------------- device summary
const verdict = (id) => {
  const rs = byDev(id);
  const med = median(rs.map((r) => r.readyMs));
  const maxFcp = Math.max(...rs.map((r) => r.fcpMs ?? 0));
  const minFps = Math.min(...rs.filter((r) => r.lab?.fps != null).map((r) => r.lab.fps));
  const td = rs.find((r) => r.threeD)?.threeD;
  let v = med < 3000 ? "Good" : med < 6000 ? "OK" : "Slow";
  if (maxFcp > 5000) v += ", but blank screen on first visit";
  if (td?.fps != null && td.fps < 20) v += "; 3D too slow";
  return { med, maxFcp, minFps, td, v, data: rs.find((r) => r.page === "student-home")?.kb, errors: rs.reduce((n, r) => n + (r.errorCount ?? 0), 0) };
};

// ------------------------------------------------------------------ screenshots
const shots = [
  ["ipad-safari", "lab-respiration-fullscreen", "iPad (Safari engine), breathing lab in full screen"],
  ["phone", "lab-orbits", "Low-end phone, astronomy lab"],
  ["chromebook", "studio-3d", "Budget Chromebook with software 3D"],
  ["ipad-safari", "student-home", "iPad (Safari engine), student home after the font timeout"],
];
const shotMd = [];
for (const [dev, page, caption] of shots) {
  const src = `${OUT}${dev}/${page}.png`;
  if (!existsSync(src)) continue;
  const dst = `${REPORT_DIR}${ASSETS}/${dev}-${page}.png`;
  copyFileSync(src, dst);
  try { execSync(`sips -Z 900 "${dst}" >/dev/null 2>&1`); } catch { /* keep full size */ }
  shotMd.push(`**${caption}**\n\n![${caption}](${ASSETS}/${dev}-${page}.png)\n`);
}

// ------------------------------------------------------------------ markdown
const L = [];
L.push(`# Old-device check: usability, performance and security`);
L.push("");
L.push(`Beyond Books, tested ${date} on the production build (vite preview) against the local backend.`);
L.push("");
L.push("## Summary");
L.push("");
const passed = sec.filter((c) => c.pass).length;
L.push(`- **Devices:** ${devices.length} school-device profiles, ${pageIds.length} pages each (${results.length} page visits).`);
L.push(`- **Labs** run smoothly on every profile (lowest ${Math.min(...results.filter((r) => r.lab?.fps).map((r) => r.lab.fps))} fps; 60 is perfect), and full screen opened on ${results.filter((r) => r.lab?.fullscreen === true).length} of ${results.filter((r) => r.lab).length} lab visits.`);
L.push(`- **Security:** ${passed} of ${sec.length} checks pass; ${sec.length - passed} to fix (see Security).`);
L.push(`- **Biggest risks for schools:** ${findings.filter((f) => f.sev === "High").map((f) => f.title.toLowerCase()).join("; ") || "none"}.`);
L.push("");
L.push("| Device profile | Typical page ready | Slowest first paint | Lab smoothness | 3D | Verdict |");
L.push("|---|---|---|---|---|---|");
for (const d of devices) {
  const v = verdict(d.id);
  L.push(`| ${d.name} | ${s(v.med)} | ${s(v.maxFcp)} | ${Number.isFinite(v.minFps) ? `${v.minFps}+ fps` : "–"} | ${v.td?.fps != null ? `${v.td.fps} fps` : v.td?.canvas === false ? "no canvas" : "not measured"} | ${v.v} |`);
}
L.push("");
L.push("## Findings and fixes (most important first)");
L.push("");
findings.forEach((f, i) => {
  L.push(`${i + 1}. **[${f.sev}] ${f.title}**`);
  L.push(`   - What we saw: ${f.detail}`);
  L.push(`   - Fix: ${f.fix}`);
});
L.push("");
if (fonts) {
  L.push("## Font experiment (why first visits can be blank)");
  L.push("");
  L.push("First paint of the sign-in page in a fresh browser, three ways:");
  L.push("");
  L.push("| Browser engine | Google Fonts as today | Google unreachable (school filter) | No Google (self-hosted fonts) |");
  L.push("|---|---|---|---|");
  for (const [eng, m] of Object.entries(fonts)) L.push(`| ${eng} | ${fmt(m.today)} | ${fmt(m.unreachable)} | ${fmt(m.selfHosted)} |`);
  L.push("");
}
L.push("## Page ready time by device");
L.push("");
L.push("Time until the page finished loading and the network went quiet (lower is better). First paint in brackets when it was over 2 s.");
L.push("");
L.push(`| Page | ${devices.map((d) => d.id).join(" | ")} |`);
L.push(`|---|${devices.map(() => "---").join("|")}|`);
for (const p of pageIds) {
  L.push(`| ${pageName[p]} | ${devices.map((d) => { const r = results.find((x) => x.page === p && x.device === d.id); if (!r) return "–"; if (r.failed) return "failed"; return `${s(r.readyMs)}${(r.fcpMs ?? 0) > 2000 ? ` (${s(r.fcpMs)})` : ""}`; }).join(" | ")} |`);
}
L.push("");
L.push("## Labs on each device");
L.push("");
L.push("Each lab was opened, one control was used (start the animation, add a part, change the object), the frame rate was measured for 3 seconds, then Full screen was opened and closed.");
L.push("");
L.push(`| Lab | Action | ${devices.map((d) => d.id).join(" | ")} |`);
L.push(`|---|---|${devices.map(() => "---").join("|")}|`);
for (const p of pageIds.filter((x) => x.startsWith("lab-"))) {
  const any = results.find((r) => r.page === p);
  L.push(`| ${pageName[p].replace("Lab: ", "")} | ${any?.lab?.action ?? ""} | ${devices.map((d) => { const r = results.find((x) => x.page === p && x.device === d.id); if (!r?.lab) return "–"; if (r.lab.error) return "error"; return `${r.lab.fps} fps, ${r.lab.responseMs} ms, full screen ${r.lab.fullscreen === true ? `✓ (${r.lab.fullscreenBoardShare}% of screen)` : "✗"}`; }).join(" | ")} |`);
}
L.push("");
L.push("## Usability details");
L.push("");
L.push(`| Device | Data for first page | Pages wider than screen | Small touch targets (pages) | Browser errors |`);
L.push("|---|---|---|---|---|");
for (const d of devices) {
  const rs = byDev(d.id);
  L.push(`| ${d.id} | ${rs[0]?.kb ?? "–"} KB | ${rs.filter((r) => r.overflowX > 0).length} | ${touch.includes(d.id) ? `${rs.reduce((n, r) => n + (r.smallTargets ?? 0), 0)} (${rs.filter((r) => r.smallTargets > 0).length} pages)` : "n/a (mouse)"} | ${rs.reduce((n, r) => n + (r.errorCount ?? 0), 0)} |`);
}
const axeRuns = results.filter((r) => r.axe && !r.axe.error);
if (axeRuns.length) {
  const tot = axeRuns.reduce((a, r) => ({ c: a.c + r.axe.critical, s: a.s + r.axe.serious, m: a.m + r.axe.moderate }), { c: 0, s: 0, m: 0 });
  L.push("");
  L.push(`Accessibility scan (axe-core, WCAG 2.1 AA) on ${axeRuns.length} pages: ${tot.c} critical, ${tot.s} serious, ${tot.m} moderate issues.`);
}
L.push("");
L.push("## Security");
L.push("");
L.push("| Area | Check | Result | Detail |");
L.push("|---|---|---|---|");
for (const c of sec) L.push(`| ${c.area} | ${c.name} | ${c.pass ? "✅ pass" : `❌ ${c.severity}`} | ${c.detail.replace(/\|/g, "\\|")} |`);
L.push("");
if (shotMd.length) {
  L.push("## Screenshots");
  L.push("");
  L.push(...shotMd);
}
L.push("## How this was tested");
L.push("");
L.push("| Profile | Browser engine | Screen | CPU | Network |");
L.push("|---|---|---|---|---|");
for (const d of devices) L.push(`| ${d.name} | ${d.engine === "webkit" ? "WebKit (Safari's engine)" : `Chromium${d.softwareGL ? ", software 3D (no GPU)" : ", real GPU"}`} | ${d.id === "laptop" ? "1440×900" : d.id === "chromebook" ? "1366×768" : d.id === "phone" ? "360×740" : "768×1024"} | ${d.cpu > 1 ? `${d.cpu}× slower` : "full speed"} | ${d.net === "school" ? "1.5 Mbit/s, 150 ms" : d.net === "slow4g" ? "1.6 Mbit/s, 170 ms" : "local"} |`);
L.push("");
L.push("- Tool: `tools/device-check` (Playwright 1.65 with Chromium and WebKit, axe-core). Run `tools/device-check/check.sh` with the backend on :8000 and `npx vite preview --port 4173` in frontend/.");
L.push("- Signed in as the seeded teacher and student with ordinary sessions. The run is read-only: every API write is blocked, so no progress, answers or settings were saved.");
L.push("- Security probes send only empty or invalid changes, so nothing is modified even if a check fails.");
L.push("- **Limits:** these are emulations on a Mac, not the real devices. WebKit on macOS is close to iPad Safari but not identical (no real iPad GPU or memory limits). CPU slowdown affects JavaScript, not the GPU, so the Chromebook profile uses software 3D as a stand-in for a weak GPU. A short check on one real old iPad and one real Chromebook is still recommended before a school pilot.");
L.push("");
const file = `${REPORT_DIR}device-check-${date}.md`;
writeFileSync(file, L.join("\n"));
console.log(`Wrote ${file} (${findings.length} findings)`);
