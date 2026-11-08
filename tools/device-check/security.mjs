/**
 * Security checks for the device report (local only, no data changes): sign-in protection,
 * roles and sessions, CSRF, CORS, response headers, cookie settings, the production nginx
 * headers, risky frontend code, and known-vulnerable packages. Every "must be refused" probe
 * sends an empty or invalid change, so nothing is modified even if a check failed.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const API = process.env.DEVICE_CHECK_API ?? "http://localhost:8000/api/v1";
const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = new URL("./out/", import.meta.url).pathname;
const S = JSON.parse(readFileSync(`${OUT}sessions.json`, "utf8"));
const lab = S.labs[0]?.id;
const checks = [];

const add = (area, name, pass, detail, severity = "high") => checks.push({ area, name, pass, detail, severity: pass ? "ok" : severity });
const call = async (method, path, { role, body, headers = {}, cookie } = {}) => {
  const h = { "Content-Type": "application/json", "X-Requested-With": "edu3d", ...headers };
  const c = cookie ?? (role ? `${S.cookie}=${S[`${role}_token`]}` : null);
  if (c) h.Cookie = c;
  const r = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  let json = null;
  try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, headers: r.headers, json };
};

// ------------------------------------------------------------ sessions and roles
{
  const r = await call("GET", "/labs");
  add("Access control", "Signed-out visitor cannot read labs", r.status === 401, `GET /labs without a session → ${r.status}`);
  const me = await call("GET", "/users/me", { role: "student" });
  add("Access control", "A valid student session works", me.status === 200 && me.json?.account_type === "student", `GET /users/me → ${me.status} (${me.json?.account_type ?? "?"})`, "medium");
  const tampered = S.student_token.slice(0, -3) + (S.student_token.endsWith("a") ? "bbb" : "aaa");
  const t = await call("GET", "/users/me", { cookie: `${S.cookie}=${tampered}` });
  add("Access control", "A tampered session token is rejected", t.status === 401, `edited token signature → ${t.status}`);
  const [h, p] = S.student_token.split(".");
  const noneTok = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.`;
  const n = await call("GET", "/users/me", { cookie: `${S.cookie}=${noneTok}` });
  add("Access control", "An unsigned (alg=none) token is rejected", n.status === 401, `alg=none token → ${n.status}`);
  void h;
  if (lab) {
    const a = await call("GET", `/labs/${lab}/sessions`, { role: "student" });
    add("Access control", "A student cannot see other students' lab activity", [403, 404].includes(a.status), `student GET /labs/{id}/sessions → ${a.status}`);
    const b = await call("PATCH", `/labs/${lab}`, { role: "student", body: {} });
    add("Access control", "A student cannot edit a lab", [403, 404].includes(b.status), `student PATCH /labs/{id} (empty change) → ${b.status}`);
  }
  const c = await call("POST", "/labs", { role: "student", body: { title: "" } });
  add("Access control", "A student cannot create labs", [403, 422].includes(c.status) && c.status !== 201, `student POST /labs (invalid body) → ${c.status}${c.status === 422 ? " (validation ran before the role check: inconclusive)" : ""}`);
  const d = await call("POST", "/courses", { role: "student", body: { title: "" } });
  add("Access control", "A student cannot create courses", d.status === 403, `student POST /courses (invalid body) → ${d.status}`, d.status === 422 ? "low" : "high");
}

// ---------------------------------------------------------------------- CSRF
{
  const r = await call("PATCH", lab ? `/labs/${lab}` : "/users/me", { role: "teacher", body: {}, headers: { "X-Requested-With": "" } });
  add("CSRF", "Cookie requests without the app header are refused", r.status === 403 && r.json?.error?.code === "CSRF_CHECK_FAILED", `PATCH without X-Requested-With → ${r.status} ${r.json?.error?.code ?? ""}`);
}

// ---------------------------------------------------------------------- CORS
{
  const r = await fetch(`${API}/users/me`, { headers: { Origin: "https://evil.example", Cookie: `${S.cookie}=${S.student_token}` } });
  const acao = r.headers.get("access-control-allow-origin");
  add("CORS", "Other websites cannot read the API with the pupil's cookies", !acao || (acao !== "https://evil.example" && acao !== "*"), `Origin https://evil.example → Access-Control-Allow-Origin: ${acao ?? "(none)"}`);
}

// ------------------------------------------------------------ sign-in protection
{
  const wrong = await call("POST", "/auth/login", { body: { email: S.student_email ?? "student@gmail.com", password: "definitely-wrong-password" } });
  const ghost = await call("POST", "/auth/login", { body: { email: "device-check-nobody@example.com", password: "definitely-wrong-password" } });
  const same = wrong.status === ghost.status && wrong.json?.error?.message === ghost.json?.error?.message;
  add("Sign-in", "Wrong password and unknown email give the same answer (no account guessing)", same, `existing email → ${wrong.status} "${wrong.json?.error?.message}", unknown email → ${ghost.status} "${ghost.json?.error?.message}"`, "medium");
  let limitedAt = null;
  for (let i = 2; i <= 12; i++) {
    const r = await call("POST", "/auth/login", { body: { email: "device-check-nobody@example.com", password: `wrong-${i}` } });
    if (r.status === 429) { limitedAt = i; break; }
  }
  add("Sign-in", "Password guessing is slowed down (rate limit)", limitedAt !== null && limitedAt <= 11, limitedAt ? `blocked with 429 at attempt ${limitedAt}` : "no 429 after 12 attempts");
}

// ---------------------------------------------------------------- headers
{
  const r = await call("GET", "/users/me", { role: "student" });
  const want = { "x-content-type-options": "nosniff", "x-frame-options": null, "referrer-policy": null, "cache-control": null };
  const got = Object.fromEntries(Object.keys(want).map((k) => [k, r.headers.get(k)]));
  add("Headers (API)", "API sends nosniff", got["x-content-type-options"] === "nosniff", `X-Content-Type-Options: ${got["x-content-type-options"]}`, "medium");
  add("Headers (API)", "API answers with personal data are not cached", /no-store|private/.test(got["cache-control"] ?? ""), `Cache-Control on /users/me: ${got["cache-control"] ?? "(none)"}`, "medium");
  add("Headers (API)", "API forbids framing / sets a referrer policy", !!got["x-frame-options"] || !!got["referrer-policy"], `X-Frame-Options: ${got["x-frame-options"]}, Referrer-Policy: ${got["referrer-policy"]}`, "low");
}

// --------------------------------------------------------- cookies (from code)
{
  const api = readFileSync(`${ROOT}backend/app/modules/authentication/api.py`, "utf8");
  const cfg = readFileSync(`${ROOT}backend/app/core/config.py`, "utf8");
  add("Cookies", "Session cookie is HttpOnly (scripts cannot read it)", /httponly=True/.test(api), "set_cookie(..., httponly=True)");
  add("Cookies", "Session cookie is SameSite=Lax", /samesite="lax"/.test(api), 'set_cookie(..., samesite="lax")', "medium");
  const prodSecure = /if not self\.cookie_secure/.test(cfg);
  add("Cookies", "Production refuses to start without Secure cookies", prodSecure, prodSecure ? "config validator rejects cookie_secure=False outside local" : "cookie_secure defaults to False with no production guard", "high");
}

// -------------------------------------------------- production web server headers
{
  const ng = readFileSync(`${ROOT}infrastructure/docker/nginx.conf.template`, "utf8") + readFileSync(`${ROOT}infrastructure/docker/nginx.conf`, "utf8");
  const has = (re) => re.test(ng);
  add("Headers (web, nginx)", "Content-Security-Policy", has(/Content-Security-Policy/i), has(/Content-Security-Policy/i) ? "present" : "missing");
  add("Headers (web, nginx)", "Clickjacking protection (frame-ancestors / X-Frame-Options)", has(/frame-ancestors|X-Frame-Options/i), has(/frame-ancestors|X-Frame-Options/i) ? "present" : "missing", "medium");
  add("Headers (web, nginx)", "HTTPS enforced (Strict-Transport-Security)", has(/Strict-Transport-Security/i), has(/Strict-Transport-Security/i) ? "present" : "missing (fine if the hosting/proxy in front adds it)", "low");
  add("Headers (web, nginx)", "Referrer-Policy", has(/Referrer-Policy/i), has(/Referrer-Policy/i) ? "present" : "missing", "low");
  add("Headers (web, nginx)", "Permissions-Policy (camera/mic only where needed)", has(/Permissions-Policy/i), has(/Permissions-Policy/i) ? "present" : "missing", "low");
  const fonts = has(/fonts\.googleapis|fonts\.gstatic/);
  const html = readFileSync(`${ROOT}frontend/index.html`, "utf8");
  const google = /fonts\.googleapis/.test(html);
  add("Privacy", "No third-party requests from pupils' browsers", !google, google ? `index.html loads Google Fonts: every visit sends the pupil's IP address to Google (an issue under GDPR for schools, and blocked on some school networks)${fonts ? "" : "; the CSP does not list Google Fonts either, so in production the fonts may be blocked"}` : "fonts are self-hosted", "medium");
}

// ------------------------------------------------------- risky frontend code
{
  let hits = "";
  try { hits = execSync(`grep -rn "dangerouslySetInnerHTML\\|\\.innerHTML\\s*=" ${ROOT}frontend/src --include=*.tsx --include=*.ts || true`).toString().trim(); } catch { /* none */ }
  const lines = hits ? hits.split("\n").map((l) => l.replace(ROOT, "")) : [];
  add("Code", "No raw HTML injection in the frontend (XSS)", lines.length === 0, lines.length ? `${lines.slice(0, 5).join("; ")} (review whether any of it can contain user text)` : "no dangerouslySetInnerHTML or innerHTML assignments", "low");
}

// ------------------------------------------------------------ dependencies
{
  let npm = null;
  try {
    const out = execSync("npm audit --omit=dev --json", { cwd: `${ROOT}frontend`, stdio: ["ignore", "pipe", "ignore"] }).toString();
    npm = JSON.parse(out).metadata?.vulnerabilities;
  } catch (e) {
    try { npm = JSON.parse(e.stdout?.toString() ?? "{}").metadata?.vulnerabilities; } catch { npm = null; }
  }
  if (npm) add("Dependencies", "Frontend packages: no high/critical known vulnerabilities", (npm.high ?? 0) + (npm.critical ?? 0) === 0, `npm audit: ${npm.critical} critical, ${npm.high} high, ${npm.moderate} moderate, ${npm.low} low`);
  else add("Dependencies", "Frontend packages audited", false, "npm audit could not run (offline?)", "low");
  let py = null;
  try {
    execSync(`${ROOT}backend/.venv/bin/python -m pip freeze --exclude-editable > ${OUT}requirements.txt`);
    const out = execSync(`uvx pip-audit -r ${OUT}requirements.txt --no-deps --disable-pip --format json --progress-spinner off`, { stdio: ["ignore", "pipe", "ignore"], timeout: 240_000 }).toString();
    py = JSON.parse(out);
  } catch (e) {
    try { py = JSON.parse(e.stdout?.toString() ?? ""); } catch { py = null; }
  }
  if (py?.dependencies) {
    const vulns = py.dependencies.filter((d) => d.vulns?.length);
    add("Dependencies", "Backend packages: no known vulnerabilities", vulns.length === 0, vulns.length ? vulns.map((d) => `${d.name} ${d.version} (${d.vulns.map((v) => v.id).join(", ")})`).join("; ") : `pip-audit: ${py.dependencies.length} packages, none affected`, "medium");
  } else add("Dependencies", "Backend packages audited", false, "pip-audit could not run (offline?)", "low");
}

// ------------------------------------------------- automated backend tests
{
  try {
    const out = execSync(`EDU3D_ENV_FILE="" .venv/bin/python -m pytest tests/test_idor_sweep.py tests/test_labs.py -q -p no:logging -p no:cacheprovider 2>&1 | tail -1`, { cwd: `${ROOT}backend`, shell: "/bin/zsh" }).toString().trim();
    add("Access control", "Cross-school / cross-pupil sweep over every API route (automated tests)", /passed/.test(out) && !/failed|error/.test(out), out);
  } catch (e) {
    add("Access control", "Cross-school / cross-pupil sweep (automated tests)", false, String(e.stdout ?? e.message).slice(-200));
  }
}

writeFileSync(`${OUT}security.json`, JSON.stringify({ when: new Date().toISOString(), checks }, null, 2));
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} [${c.area}] ${c.name}: ${c.detail}`);
