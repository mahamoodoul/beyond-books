/**
 * Font experiment: first paint of the sign-in page in Chromium and WebKit with Google Fonts
 * (a) as today, (b) unreachable (a school filter that drops the connection), (c) not requested
 * at all, which is what self-hosted fonts would give. Writes out/fonts.json.
 */
import { writeFileSync } from "node:fs";
import { chromium, webkit } from "playwright";

const BASE = process.env.DEVICE_CHECK_URL ?? "http://127.0.0.1:4173";
const MODES = { today: null, unreachable: "hang", selfHosted: "abort" };
const out = {};
for (const [name, engine, opts] of [["Chromium", chromium, { channel: "chromium", args: ["--no-proxy-server"] }], ["WebKit (Safari)", webkit, {}]]) {
  const b = await engine.launch(opts);
  out[name] = {};
  for (const [mode, how] of Object.entries(MODES)) {
    const c = await b.newContext();
    if (how === "hang") await c.route(/fonts\.(googleapis|gstatic)\.com/, () => {});
    if (how === "abort") await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await c.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "commit" });
    await p.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length > 0, null, { timeout: 90_000 }).catch(() => {});
    const fcp = await p.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null);
    out[name][mode] = fcp == null ? null : Math.round(fcp);
    console.log(`${name} ${mode}: ${fcp == null ? "no paint within 90 s" : `${Math.round(fcp)} ms`}`);
    await c.close();
  }
  await b.close();
}
writeFileSync(new URL("./out/fonts.json", import.meta.url), JSON.stringify(out, null, 2));
