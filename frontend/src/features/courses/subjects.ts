import type { IconName } from "@/components/ui/Icon";

export interface SubjectStyle {
  icon: IconName;
  /** Gradient for course banners/cards. */
  banner: string;
  /** Text colour on light backgrounds. */
  text: string;
}

const STYLES: { match: RegExp; style: SubjectStyle }[] = [
  { match: /bio|life|anatom|ecolog/i, style: { icon: "leaf", banner: "from-emerald-700 to-teal-500", text: "text-emerald-700" } },
  { match: /chem/i, style: { icon: "flask", banner: "from-violet-700 to-fuchsia-500", text: "text-violet-700" } },
  { match: /math|algebra|geometr|calcul|statist/i, style: { icon: "target", banner: "from-blue-700 to-sky-500", text: "text-blue-700" } },
  { match: /phys|mechanic|motion|energy/i, style: { icon: "activity", banner: "from-amber-600 to-orange-500", text: "text-amber-700" } },
];
const DEFAULT: SubjectStyle = { icon: "book", banner: "from-navy-900 to-navy-700", text: "text-navy-700" };

/** Colour and icon for a course, from its subject (or title when the subject is empty). */
export function subjectStyle(subject: string | null | undefined, title = ""): SubjectStyle {
  const text = `${subject ?? ""} ${title}`;
  return STYLES.find((s) => s.match.test(text))?.style ?? DEFAULT;
}
