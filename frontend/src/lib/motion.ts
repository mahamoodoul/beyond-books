/** "smooth" unless the user asked the OS for reduced motion (scripted scrolling ignores the CSS rule). */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
