/**
 * Astronomy engine (solar system, Moon, eclipses, seasons), a port of
 * backend/.../engines/orbits.py. Keep in sync: same numbers, same rounding, same messages.
 */
export const YEAR = 365.25;
export const PLANETS: Record<string, number> = { Mercury: 87.97, Venus: 224.7, Earth: YEAR, Mars: 686.98 };
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const ECLIPSE_WINDOW = 5;
export const MAX_DAYS = 1461;
export const TASKS: Record<string, string> = {
  solar_eclipse: "Line up a solar eclipse",
  lunar_eclipse: "Line up a lunar eclipse",
  periods: "Run time for a full Earth year and compare the planets",
  seasons: "Visit northern summer and winter",
  no_tilt: "Set Earth's tilt to 0° and see what happens to the seasons",
};

export type Season = (typeof SEASONS)[number];
export interface OrbitsState {
  view: "system" | "moon" | "seasons";
  days: number;
  moon_angle: number;
  tilt: number;
  latitude: number;
  seen_seasons: Season[];
}
export interface OrbitsGoal { tasks: string[] }
export interface PlanetPos { name: string; period_days: number; angle: number; orbits: number }
export interface OrbitsResult {
  planets: PlanetPos[];
  earth_angle: number;
  years: number;
  moon_phase: string;
  illuminated: number;
  eclipse: "solar" | "lunar" | null;
  season: Season;
  declination: number;
  day_hours: number;
  noon_sun: number;
  achieved: string[];
  tasks: string[];
}

export const DEFAULT_STATE: OrbitsState = { view: "system", days: 0, moon_angle: 90, tilt: 23.4, latitude: 60, seen_seasons: [] };

const rnd = (v: number, nd: number) => Math.floor(v * 10 ** nd + 0.5) / 10 ** nd;
const rad = (d: number) => (d * Math.PI) / 180;
const mod = (a: number, n: number) => ((a % n) + n) % n;
export const orbitsDone = (days: number, period: number) => Math.floor((days + 0.5) / period);
const times = (n: number) => (n === 1 ? "once" : `${n} times`);

export function phaseName(a: number): string {
  if (a <= ECLIPSE_WINDOW || a >= 360 - ECLIPSE_WINDOW) return "new moon";
  if (a < 85) return "waxing crescent";
  if (a <= 95) return "first quarter";
  if (a < 175) return "waxing gibbous";
  if (a <= 185) return "full moon";
  if (a < 265) return "waning gibbous";
  if (a <= 275) return "last quarter";
  return "waning crescent";
}

export function compute(s: OrbitsState): Omit<OrbitsResult, "achieved" | "tasks"> {
  const planets = Object.entries(PLANETS).map(([name, period]) => ({ name, period_days: period, angle: rnd(mod((360 * s.days) / period, 360), 1), orbits: orbitsDone(s.days, period) }));
  const earthAngle = mod((360 * s.days) / YEAR, 360);
  const a = s.moon_angle;
  const eclipse = a <= ECLIPSE_WINDOW || a >= 360 - ECLIPSE_WINDOW ? "solar" : Math.abs(a - 180) <= ECLIPSE_WINDOW ? "lunar" : null;
  const decl = s.tilt * Math.sin(rad(earthAngle));
  const x = -Math.tan(rad(s.latitude)) * Math.tan(rad(decl));
  const dayHours = (24 / Math.PI) * Math.acos(Math.max(-1, Math.min(1, x)));
  const noon = Math.max(0, 90 - s.latitude + decl);
  return {
    planets, earth_angle: rnd(earthAngle, 1), years: orbitsDone(s.days, YEAR), moon_phase: phaseName(a),
    illuminated: rnd((1 - Math.cos(rad(a))) / 2, 2), eclipse, season: SEASONS[Math.floor(mod(earthAngle + 45, 360) / 90)]!,
    declination: rnd(decl, 1), day_hours: rnd(dayHours, 1), noon_sun: rnd(noon, 1),
  };
}

function achievedNow(s: OrbitsState, r: ReturnType<typeof compute>): string[] {
  const now: string[] = [];
  if (r.eclipse === "solar") now.push("solar_eclipse");
  if (r.eclipse === "lunar") now.push("lunar_eclipse");
  if (r.years >= 1) now.push("periods");
  const seen = new Set<string>([...s.seen_seasons, ...(s.tilt >= 10 ? [r.season] : [])]);
  if (s.tilt >= 10 && seen.has("summer") && seen.has("winter")) now.push("seasons");
  if (s.tilt === 0) now.push("no_tilt");
  return now;
}

export function orbitsMessage(s: OrbitsState, r: ReturnType<typeof compute>): string {
  const p = Object.fromEntries(r.planets.map((x) => [x.name, x.orbits]));
  if (s.view === "system" && s.days === 0) return "Day 0, the March equinox. Press Play or drag the Time slider and watch the planets go round the Sun.";
  if (s.view === "system") return `Day ${s.days}: Earth has gone round the Sun ${times(p.Earth!)}. In the same time Mercury went round ${times(p.Mercury!)}, Venus ${times(p.Venus!)} and Mars ${times(p.Mars!)}: the closer to the Sun, the shorter the year.`;
  if (s.view === "moon") {
    let msg = `The Moon is a ${r.moon_phase} (${rnd(r.illuminated * 100, 0)} % lit).`;
    if (r.eclipse === "solar") msg += " Solar eclipse! The Moon is exactly between the Sun and Earth, and its shadow falls on Earth.";
    else if (r.eclipse === "lunar") msg += " Lunar eclipse! Earth is exactly between the Sun and the Moon, and Earth's shadow turns the Moon dark red.";
    else msg += " Drag the Moon in line with the Sun and Earth to make an eclipse.";
    return msg;
  }
  if (s.tilt === 0) return "With no tilt there are no seasons: the Sun is equally high all year, and day and night last 12 h everywhere.";
  return `At ${s.latitude}° N it is ${r.season}: the Sun is ${r.noon_sun}° high at noon and the day lasts ${r.day_hours} h. The tilt (${s.tilt}°), not the distance to the Sun, makes the seasons.`;
}

export function evaluateOrbits(s: OrbitsState, goal: OrbitsGoal, achieved: string[]): { result: OrbitsResult; message: string; goal_met: boolean; achieved: string[] } {
  const r = compute(s);
  const now = achievedNow(s, r).filter((t) => goal.tasks.includes(t));
  const done = [...new Set([...achieved, ...now])].sort();
  const met = goal.tasks.every((t) => done.includes(t));
  return { result: { ...r, achieved: done, tasks: goal.tasks }, message: orbitsMessage(s, r) + (met ? " Every task done!" : ""), goal_met: met, achieved: now };
}

/** Season the student is looking at, to remember in seen_seasons (only with a real tilt). */
export function seasonAt(days: number): Season {
  return SEASONS[Math.floor(mod((360 * days) / YEAR + 45, 360) / 90)]!;
}
