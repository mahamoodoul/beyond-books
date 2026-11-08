/**
 * Old-device check: opens the main student and teacher pages on emulated school devices and
 * measures load time, data downloaded, main-thread blocking, animation smoothness, layout
 * problems, small touch targets, console errors and accessibility. Read-only: every API call that
 * is not a GET is blocked, so no lab progress, quiz answer or setting is saved.
 *
 *   1. backend on :8000, `npx vite preview --port 4173` in frontend/ (production build)
 *   2. cd backend && .venv/bin/python ../tools/device-check/mint_sessions.py > ../tools/device-check/out/sessions.json
 *   3. cd tools/device-check && npm run check && npm run report
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { chromium, devices, webkit } from "playwright";

const BASE = process.env.DEVICE_CHECK_URL ?? "http://127.0.0.1:4173"; // not "localhost": macOS tries IPv6 first and stalls
const OUT = new URL("./out/", import.meta.url).pathname;
const S = JSON.parse(readFileSync(`${OUT}sessions.json`, "utf8"));
const ONLY = process.env.DEVICES?.split(",");

// School Wi-Fi shared by a class: ~1.5 Mbit/s each, 150 ms latency. Slow 4G for the phone.
const NET = {
  school: { latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 },
  slow4g: { latency: 170, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 },
};

export const DEVICES = [
  {
    id: "laptop", name: "Reference laptop (no limits)", engine: "chromium",
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, cpu: 1, net: null, axe: true,
  },
  {
    id: "chromebook", name: "Budget Chromebook (Celeron class, 1366×768, school Wi-Fi, weak GPU: software 3D)", engine: "chromium",
    context: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }, cpu: 6, net: "school", softwareGL: true,
  },
  {
    id: "ipad-safari", name: "iPad 6th gen, Safari engine (WebKit, 768×1024, touch)", engine: "webkit",
    context: { ...(devices["iPad (gen 6)"] ?? devices["iPad (gen 7)"]) }, cpu: 1, net: null,
  },
  {
    id: "ipad-slow", name: "iPad 6th gen size and CPU (Chromium, 4× slower CPU, school Wi-Fi)", engine: "chromium",
    context: { ...(devices["iPad (gen 6)"] ?? devices["iPad (gen 7)"]), defaultBrowserType: undefined }, cpu: 4, net: "school",
  },
  {
    id: "phone", name: "Low-end Android phone (360×740, 6× slower CPU, slow 4G)", engine: "chromium",
    context: { ...devices["Galaxy S8"], defaultBrowserType: undefined }, cpu: 6, net: "slow4g",
  },
];

const LAB_ACTION = {
  respiration: { label: "Start breathing (Auto)", run: (p) => p.getByRole("button", { name: /Auto/ }).first().click() },
  orbits: { label: "Play the solar system", run: (p) => p.getByRole("button", { name: /Play/ }).first().click() },
  tectonics: { label: "Run the plates", run: (p) => p.getByRole("button", { name: /Run/ }).first().click() },
  circuit: { label: "Add a bulb", run: (p) => p.getByRole("button", { name: /Bulb/ }).first().click() },
  molecules: { label: "Add a hydrogen atom", run: (p) => p.getByRole("button", { name: /Add hydrogen/i }).first().click() },
  buoyancy: { label: "Change the object to steel", run: (p) => p.locator("select").first().selectOption("steel") },
};

const PAGES = [
  { id: "landing", name: "Landing page (animated)", role: null, path: "/", animated: true },
  { id: "login", name: "Sign-in page", role: null, path: "/login" },
  { id: "student-home", name: "Student home", role: "student", path: "/student" },
  { id: "student-courses", name: "My courses", role: "student", path: "/student/courses" },
  ...(S.lesson ? [{ id: "lesson", name: "Lesson reader", role: "student", path: `/student/lessons/${S.lesson}` }] : []),
  ...(S.assessment ? [{ id: "quiz", name: "Quiz", role: "student", path: `/student/assessments/${S.assessment}` }] : []),
  { id: "progress", name: "My progress", role: "student", path: "/student/progress" },
  { id: "labs", name: "Labs list", role: "student", path: "/student/labs" },
  ...S.labs.map((l) => ({ id: `lab-${l.kind}`, name: `Lab: ${l.title}`, role: "student", path: `/student/labs/${l.id}`, lab: l.kind })),
  ...(S.scene ? [{ id: "studio-3d", name: "3D Studio scene", role: "student", path: `/studio/scene/${S.scene}`, threeD: true }] : []),
  { id: "teacher-home", name: "Teacher home", role: "teacher", path: "/teacher" },
  { id: "teacher-labs", name: "Teacher labs", role: "teacher", path: "/teacher/labs" },
  { id: "teacher-insights", name: "Teacher analytics", role: "teacher", path: "/teacher/insights" },
];

const INIT = `
  window.__lt = { total: 0, count: 0, max: 0 };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lt.total += e.duration - 50; window.__lt.count++; window.__lt.max = Math.max(window.__lt.max, e.duration); } })
      .observe({ type: "longtask", buffered: true });
  } catch (e) { window.__lt = null; }
`;

async function fps(page, ms = 3000) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let frames = 0;
        let worst = 0;
        let last = performance.now();
        const start = last;
        const tick = (now) => {
          frames++;
          worst = Math.max(worst, now - last);
          last = now;
          if (now - start < ms) requestAnimationFrame(tick);
          else resolve({ fps: Math.round((frames * 1000) / (now - start)), worstFrameMs: Math.round(worst) });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

async function measurePage(context, device, pageDef) {
  const page = await context.newPage();
  const errors = [];
  let bytes = 0;
  let requests = 0;
  let biggest = { url: "", bytes: 0 };
  page.on("console", (m) => { if (m.type() === "error" && !/blocked-by-device-check|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("requestfinished", async (req) => {
    try {
      const s = await req.sizes();
      const b = s.responseBodySize + s.responseHeadersSize;
      bytes += b;
      requests++;
      if (b > biggest.bytes) biggest = { url: req.url().replace(BASE, "").slice(0, 90), bytes: b };
    } catch { /* ignore */ }
  });
  if (device.engine === "chromium" && (device.cpu > 1 || device.net)) {
    const cdp = await context.newCDPSession(page);
    if (device.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: device.cpu });
    if (device.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NET[device.net] });
  }

  const r = { page: pageDef.id, name: pageDef.name, device: device.id };
  const t0 = Date.now();
  try {
    await page.goto(BASE + pageDef.path, { waitUntil: "load", timeout: 90_000 });
    r.loadMs = Date.now() - t0;
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => { r.networkIdleTimeout = true; });
    r.readyMs = Date.now() - t0;
    await page.waitForTimeout(400);
  } catch (e) {
    r.failed = String(e.message).split("\n")[0];
    await page.close();
    return r;
  }
  r.finalPath = new URL(page.url()).pathname;
  r.redirectedToLogin = pageDef.role !== null && r.finalPath.startsWith("/login");
  const perf = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const de = document.documentElement;
    const touchables = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button]")].filter((el) => {
      const b = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    });
    const small = touchables.filter((el) => { const b = el.getBoundingClientRect(); return (b.width < 24 || b.height < 24) && !(el.tagName === "INPUT" && ["checkbox", "radio"].includes(el.type)) && !el.closest("p, li > a, td"); });
    const storage = { local: Object.keys(localStorage), session: Object.keys(sessionStorage) };
    return {
      fcpMs: fcp && Math.round(fcp),
      overflowX: de.scrollWidth > window.innerWidth + 1 ? de.scrollWidth - window.innerWidth : 0,
      smallTargets: small.length,
      smallExamples: small.slice(0, 4).map((el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40)),
      longTasks: window.__lt,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      storage,
      cookieVisible: document.cookie.includes("edu3d_access"),
      webgl: !!document.querySelector("canvas") ? (() => { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); })() : null,
    };
  });
  Object.assign(r, perf);

  if (pageDef.lab) {
    const act = LAB_ACTION[pageDef.lab];
    r.lab = { action: act.label };
    try {
      const t = Date.now();
      await act.run(page);
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      r.lab.responseMs = Date.now() - t;
      Object.assign(r.lab, await fps(page));
      const fsBtn = page.getByRole("button", { name: /^Full screen$/ }).first();
      if (await fsBtn.count()) {
        await fsBtn.click();
        await page.waitForTimeout(500);
        r.lab.fullscreen = await page.locator(".lab-fs").count() > 0;
        if (r.lab.fullscreen) {
          const box = await page.locator(".lab-fs svg[role=img]").first().boundingBox();
          const vp = page.viewportSize();
          r.lab.fullscreenBoardShare = box && vp ? Math.round(((box.width * box.height) / (vp.width * vp.height)) * 100) : null;
          await page.screenshot({ path: `${OUT}${device.id}/${pageDef.id}-fullscreen.png` });
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
          if (await page.locator(".lab-fs").count()) await page.getByRole("button", { name: /Exit full screen/ }).first().click().catch(() => {});
        }
      } else r.lab.fullscreen = "no button";
    } catch (e) {
      r.lab.error = String(e.message).split("\n")[0].slice(0, 160);
    }
  }
  if (pageDef.animated) r.anim = await fps(page);
  if (pageDef.threeD) {
    r.threeD = { canvas: (await page.locator("canvas").count()) > 0 };
    if (r.threeD.canvas) Object.assign(r.threeD, await fps(page));
  }
  if (device.axe && pageDef.role !== undefined) {
    try {
      const a = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      r.axe = { critical: 0, serious: 0, moderate: 0, minor: 0, rules: [] };
      for (const v of a.violations) {
        r.axe[v.impact ?? "minor"] += v.nodes.length;
        r.axe.rules.push(`${v.id} (${v.impact}, ${v.nodes.length})`);
      }
    } catch (e) {
      r.axe = { error: String(e.message).slice(0, 120) };
    }
  }
  await page.screenshot({ path: `${OUT}${device.id}/${pageDef.id}.png` });
  r.kb = Math.round(bytes / 1024);
  r.requests = requests;
  r.biggest = { ...biggest, kb: Math.round(biggest.bytes / 1024) };
  r.errors = errors.slice(0, 5);
  r.errorCount = errors.length;
  await page.close();
  return r;
}

async function runDevice(device) {
  // Chromium uses the real GPU ("chromium" channel); the software-GL profile uses the headless shell,
  // which renders WebGL on the CPU (SwiftShader): a stand-in for a weak or blocklisted GPU.
  const browser = device.engine === "webkit" ? await webkit.launch() : await chromium.launch({ ...(device.softwareGL ? {} : { channel: "chromium" }), args: ["--no-proxy-server"] }); // no macOS proxy auto-detect stall
  const { defaultBrowserType, ...ctx } = device.context;
  void defaultBrowserType;
  const results = [];
  mkdirSync(`${OUT}${device.id}`, { recursive: true });
  for (const role of [null, "student", "teacher"]) {
    const context = await browser.newContext({ ...ctx, serviceWorkers: "block" });
    await context.addInitScript(INIT);
    // read-only run: block every API write
    // (the test sessions have no refresh cookie, so the server's answer to a refresh is always 401)
    await context.route("**/api/**", (route) => {
      const req = route.request();
      if (req.method() === "GET") return route.continue();
      if (req.url().includes("/auth/refresh")) return route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "Not signed in." } } });
      return route.abort("blockedbyclient");
    });
    if (role) {
      await context.addCookies([{ name: S.cookie, value: S[`${role}_token`], url: BASE, httpOnly: true, sameSite: "Lax" }]);
    }
    for (const p of PAGES.filter((x) => x.role === role)) {
      process.stdout.write(`  ${device.id} ${p.id} … `);
      const r = await measurePage(context, device, p);
      results.push(r);
      console.log(r.failed ? `FAILED ${r.failed}` : `${r.readyMs} ms, ${r.kb} KB${r.lab ? `, ${r.lab.fps ?? "?"} fps` : ""}${r.errorCount ? `, ${r.errorCount} errors` : ""}`);
    }
    await context.close();
  }
  await browser.close();
  return results;
}

mkdirSync(OUT, { recursive: true });
const all = [];
for (const d of DEVICES.filter((x) => !ONLY || ONLY.includes(x.id))) {
  console.log(`\n${d.name}`);
  all.push(...(await runDevice(d)));
}
writeFileSync(`${OUT}results-${ONLY ? ONLY.join("-") : "all"}.json`, JSON.stringify({ when: new Date().toISOString(), base: BASE, devices: DEVICES.map(({ id, name, engine, cpu, net, softwareGL }) => ({ id, name, engine, cpu, net, softwareGL: !!softwareGL })), results: all }, null, 2));
console.log(`\nWrote ${OUT}results-${ONLY ? ONLY.join("-") : "all"}.json (${all.length} page visits)`);
