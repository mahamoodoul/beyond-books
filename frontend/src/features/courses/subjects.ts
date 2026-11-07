import type { IconName } from "@/components/ui/Icon";

/**
 * One colour family per course. Known subjects get a fixed colour (biology is always green);
 * any other course gets a stable colour from a palette, chosen from its title, so every card on
 * "My courses" is coloured and two unknown courses rarely look alike.
 *
 * All class names are literal strings so Tailwind can find them.
 */
export interface SubjectStyle {
  icon: IconName;
  /** Gradient for course banners/cards (`bg-gradient-to-r`). */
  banner: string;
  /** Text colour on light backgrounds. */
  text: string;
  /** Light tint background for chips and stat tiles. */
  soft: string;
  /** Solid colour, e.g. for progress bars and dots. */
  solid: string;
}

// Tailwind only sees class names that are spelled out, so each family is written in full
// (never built from pieces like `bg-${hue}-50`).
const EMERALD: SubjectStyle = { icon: "leaf", banner: "from-emerald-700 to-teal-500", text: "text-emerald-700", soft: "bg-emerald-50", solid: "bg-emerald-500" };
const VIOLET: SubjectStyle = { icon: "flask", banner: "from-violet-700 to-fuchsia-500", text: "text-violet-700", soft: "bg-violet-50", solid: "bg-violet-500" };
const BLUE: SubjectStyle = { icon: "target", banner: "from-blue-700 to-sky-500", text: "text-blue-700", soft: "bg-blue-50", solid: "bg-blue-500" };
const AMBER: SubjectStyle = { icon: "activity", banner: "from-amber-600 to-orange-500", text: "text-amber-700", soft: "bg-amber-50", solid: "bg-amber-500" };
const ROSE: SubjectStyle = { icon: "clock", banner: "from-rose-700 to-pink-500", text: "text-rose-700", soft: "bg-rose-50", solid: "bg-rose-500" };
const CYAN: SubjectStyle = { icon: "sun", banner: "from-cyan-700 to-sky-400", text: "text-cyan-700", soft: "bg-cyan-50", solid: "bg-cyan-500" };
const INDIGO: SubjectStyle = { icon: "grid", banner: "from-indigo-700 to-blue-500", text: "text-indigo-700", soft: "bg-indigo-50", solid: "bg-indigo-500" };
const PINK: SubjectStyle = { icon: "sparkles", banner: "from-pink-600 to-rose-400", text: "text-pink-700", soft: "bg-pink-50", solid: "bg-pink-500" };
const LIME: SubjectStyle = { icon: "users", banner: "from-lime-700 to-green-500", text: "text-lime-700", soft: "bg-lime-50", solid: "bg-lime-500" };
const ORANGE: SubjectStyle = { icon: "file", banner: "from-orange-600 to-amber-400", text: "text-orange-700", soft: "bg-orange-50", solid: "bg-orange-500" };
const TEAL: SubjectStyle = { icon: "layers", banner: "from-teal-700 to-emerald-400", text: "text-teal-700", soft: "bg-teal-50", solid: "bg-teal-500" };
const SLATE: SubjectStyle = { icon: "settings", banner: "from-slate-700 to-slate-500", text: "text-slate-700", soft: "bg-slate-100", solid: "bg-slate-500" };
const PURPLE: SubjectStyle = { icon: "lightbulb", banner: "from-purple-700 to-violet-500", text: "text-purple-700", soft: "bg-purple-50", solid: "bg-purple-500" };
const NAVY: SubjectStyle = { icon: "book", banner: "from-navy-900 to-navy-700", text: "text-navy-700", soft: "bg-slate-100", solid: "bg-navy-900" };

const STYLES: { match: RegExp; style: SubjectStyle }[] = [
  { match: /bio|life science|anatom|ecolog|genetic|botan|zoolog/i, style: EMERALD },
  { match: /chem/i, style: VIOLET },
  { match: /math|algebra|geometr|calcul|statist|arithmetic|trigonometr/i, style: BLUE },
  { match: /phys|mechanic|motion|energy|electric/i, style: AMBER },
  { match: /histor|civics|politic/i, style: ROSE },
  { match: /geograph|earth|astronom|space|climate|environment/i, style: CYAN },
  { match: /computer|programming|coding|informatic|\bict\b|technolog|digital/i, style: INDIGO },
  { match: /\bart\b|design|drawing|music|drama|theatre/i, style: PINK },
  { match: /health|sport|physical education|\bpe\b|nutrition/i, style: LIME },
  { match: /english|language|literature|writing|reading|norsk|norwegian|spanish|french|german/i, style: ORANGE },
  { match: /econom|business|finance|accounting|entrepreneur/i, style: TEAL },
  { match: /engineer|robotic|electronic|mechatron/i, style: SLATE },
  { match: /philosoph|religion|ethic|psycholog|sociolog|social/i, style: PURPLE },
];

/** Palette for courses with no recognised subject; picked by title so the colour is stable. */
const FALLBACK: SubjectStyle[] = [NAVY, INDIGO, TEAL, ROSE, CYAN, PURPLE, ORANGE, PINK];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Colour and icon for a course, from its subject (or title when the subject is empty). */
export function subjectStyle(subject: string | null | undefined, title = ""): SubjectStyle {
  const text = `${subject ?? ""} ${title}`;
  const known = STYLES.find((s) => s.match.test(text))?.style;
  if (known) return known;
  const key = (subject ?? "").trim() || title.trim();
  return key ? { ...FALLBACK[hash(key) % FALLBACK.length]!, icon: "book" } : NAVY;
}
