# Accessibility guidelines

Beyond Books is used by students and teachers on laptops, tablets and phones, with a mouse, a
keyboard, a screen reader or a trackpad, in light or dark mode. The target is **WCAG 2.2 level AA**.
These guidelines are for everyone who changes `frontend/`.

## Before you open a pull request

1. **Keyboard:** everything you added can be reached and used with Tab / Shift+Tab, Enter, Space
   and (for tabs) the arrow keys. Focus is always visible and never trapped.
2. **Names:** every button, link and form field has an accessible name: visible text, a `<label>`
   (use `Field`), or `aria-label` for icon-only buttons.
3. **Contrast:** text is at least 4.5:1 (3:1 at 24px, or 18.66px bold and up), and icons and control
   borders are at least 3:1. Check **both** themes.
4. **Structure:** one `<h1>` per page and headings in order. `AppLayout` provides the `<main>`;
   don't add another.
5. **Small screens:** the page works at 320px wide with no sideways scrolling, and text can be
   zoomed to 200%.
6. **Motion:** animations and scripted scrolling respect `prefers-reduced-motion`.
7. **Audit:** run `__a11yAudit()` in the browser console (`npm run dev`) on every page you
   touched, in light and dark mode. It should report nothing.

## What the app already does for you

Use these instead of building your own:

| Need | Use | Where |
|---|---|---|
| Skip past the navigation | Skip link, rendered on every page | `app/router/RouteAnnouncer.tsx` |
| Page title and screen-reader announcement on navigation | `RouteAnnouncer`: names the tab after `data-page-title` or the page's `<h1>`, announces it and moves focus to `#main-content` | `app/router/RouteAnnouncer.tsx` |
| Labelled form field | `Field` + `Input` / `Textarea` | `components/ui` |
| Error and status messages | `ErrorAlert` (`role="alert"`), `Loading` (`role="status"`) | `components/feedback` |
| Tabs | `role="tablist"` + `role="tab"` / `aria-selected`, plus `ref={useRovingTabs()}` for arrow keys | `lib/useRovingTabs.ts` |
| Horizontal strips that scroll | `useScrollFade()` + class `scroll-fade`: edge fade and active item kept in view | `lib/useScrollFade.ts` |
| Screen-reader-only text | class `visually-hidden` | `styles/index.css` |
| Counts in text | `plural(n, "lesson")` instead of `lesson(s)` | `lib/plural.ts` |
| Reduced motion | `useReducedMotion()`; `scrollBehavior()` for `scrollIntoView` | `features/three-d/library/hooks`, `lib/motion.ts` |
| 3D viewers | Named `role="group"` with operating instructions, keyboard-focusable part labels, a parts list as the keyboard route, and wheel scrolls the page (Ctrl/⌘ + wheel zooms) | `features/three-d/library/components` |

**Every page:** give it exactly one `<h1>`. If the `<h1>` doesn't make a good browser-tab title
(for example "Welcome back, Teacher"), set `data-page-title` on the page's root element:

```tsx
return <div className="dashboard-page" data-page-title="Overview">…</div>;
```

A page that shouldn't show a visible `<h1>` still needs one:
`<h1 className="visually-hidden">Chapter Studio: {chapter.title}</h1>`.

## Patterns

### Buttons, links and icons

- Use `<Link>` to navigate and `<button type="button">` for actions. Never use a clickable `<div>`.
- Icon-only buttons need a name: `<button aria-label="Remove question">✕</button>`.
- Hide decorative icons and symbols from screen readers with `aria-hidden="true"`. Images that
  carry meaning need `alt` text; decorative images use `alt=""`.
- Disclosure buttons (menus, "Show more") set `aria-expanded` and, where there is a panel,
  `aria-controls`.

### Forms

- Every field has a visible label (`Field`, or a `<label>` wrapping the control). A placeholder is
  not a label.
- Pre-fill fields that edit an existing value (see `AccountPage`).
- Show errors with `ErrorAlert` (an alert region) next to the form, and confirm success with a
  `role="status"` line such as "Name saved."

### Tabs

```tsx
const tabs = useRovingTabs<HTMLDivElement>();
<div role="tablist" aria-label="Course sections" ref={tabs}>
  <button role="tab" id="course-tab-0" aria-selected={tab === 0} aria-controls="course-tabpanel">Chapters</button>
</div>
<div role="tabpanel" id="course-tabpanel" aria-labelledby="course-tab-0">…</div>
```

The hook makes the list a single Tab stop. Left/Right/Home/End move between tabs, and selection
follows focus.

### Colour and status

- Never use colour alone. Status combines colour with an icon and a word (see `STATUS` in
  `features/analytics/charts.tsx`).
- Prefer the theme variables (`var(--ink)`, `var(--ink-soft)`, `var(--muted)`, `var(--surface)`,
  `var(--line)`, …) or the slate palette, which is already mapped for dark mode in `index.css`.
  If you introduce a new Tailwind hue (for example `text-fuchsia-700`), add its dark-mode mapping
  in the dark-theme block at the end of `styles/index.css`.
- Content drawn over a light 3D canvas stays light in dark mode: wrap it in `.keep-light`.

### Tables and dense rows

- Use real `<table>` markup with `<th>` headers, and give cells padding so headers don't run
  together.
- On phones, don't squeeze columns: move secondary information under the primary cell (the reason
  under the student's name in `AnalyticsPanel`) or hide it with `hidden sm:table-cell`.

### Layout that survives small screens

- Grid columns that hold text use `minmax(0, 1fr)` (`grid-cols-1`, `grid-cols-[minmax(0,1fr)_26rem]`),
  never a bare `1fr` or an implicit column. Otherwise one long word or a `truncate` title widens
  the whole page.
- A flex item that holds text needs `min-w-0` **and** a basis (`basis-52`) when it sits next to
  buttons, so the buttons wrap below instead of squeezing the text to a word per line.
- Boxes with `aspect-ratio` plus a minimum height need an explicit width (`w-full`). Otherwise the
  browser widens the box to keep the ratio.
- Check 320, 375 and 768px widths, and both orientations on a tablet.

### Motion

- CSS animations are already reduced globally under `prefers-reduced-motion`.
- Pass `behavior: scrollBehavior()` to `scrollIntoView`, because an explicit `"smooth"` ignores
  the user setting.
- Anything auto-playing (tours, rotation) needs a pause control and must not start on its own
  when motion is reduced.

## Two Tailwind gotchas that already bit us

1. **Unlayered CSS beats every utility.** Tailwind v4 puts its utilities in `@layer utilities`,
   and any rule outside a layer wins over them. A global `button { color: inherit }` once made
   every button ignore its `text-*` and `font-*` classes, leaving primary buttons with grey text
   at 3.2:1 contrast. Put new element-wide defaults in `@layer base`.
2. **Dark mode is a mapping, not automatic.** The dark theme remaps the light palette
   (`bg-white`, `text-slate-900`, `bg-*-50`, …) to theme variables. Unmapped classes stay light,
   which gives white cards with light text. After styling something, toggle the theme and run
   `__a11yAudit()`.

## Testing

- **Keyboard:** unplug the mouse mentally. Tab through the page from the top: the skip link
  appears first, every control shows the focus ring, and nothing gets stuck.
- **Screen reader:** a quick pass with VoiceOver (macOS: ⌘F5) or NVDA (Windows). On navigation the
  new page name is announced. The headings list (VO rotor) makes sense, and form fields read
  their labels.
- **Automated:** `__a11yAudit()` in the dev console, in light and dark mode.
- **Small screens:** use the browser's device toolbar at 320, 375 and 768px. The page must not
  scroll sideways (`document.documentElement.scrollWidth` equals the viewport width).
- **Reduced motion:** in DevTools, open Rendering and emulate `prefers-reduced-motion: reduce`.
- **Zoom:** at 200% browser zoom nothing is cut off or overlapping.

## Known gaps

- Chapter delete and account delete use the browser's native `confirm()`, which is accessible but
  unstyled. A custom dialog must trap focus, close on Escape and return focus to its trigger.
- Not automated in CI yet: there is no end-to-end suite. When one is added, run an axe-based
  check (for example `@axe-core/playwright`) on the main pages so regressions are caught before
  review.
