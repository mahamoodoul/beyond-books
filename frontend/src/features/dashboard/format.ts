/** Small display helpers shared by the teacher and student home pages. */

const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir"]);

/** "Ms Amara Okafor" -> "Amara": greet by first name, not by title. */
export function firstName(displayName: string | undefined): string {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  const name = parts.find((p) => !TITLES.has(p.toLowerCase().replace(/\.$/, "")));
  return name ?? parts[0] ?? "";
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "3 hours ago", "yesterday", ... (falls back to the date after a week). */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString();
}
