# {{PROJECT_NAME}} — Design Brief (`design.md`)

> The agent-readable design system for this project. **Read before writing any UI code.** Reference its tokens, component states, and Do's/Don'ts — don't invent values. This is the contract Stage V's design pass checks the running deliverable against.
>
> Authored at Phase 1.6 (web/UI deliverables only). Two ways it gets here: imported from Claude Design (Pro+), or built from the Phase 1.5 discovery interview. Either way it conforms to the 9-section structure below — the canonical `DESIGN.md` format consumed by Claude Code, Cursor, and Copilot.
>
> Re-tier note: this file is **advisory rails** for the build, not an immutable contract. Deviating from a token is allowed when justified; silently ignoring the whole brief is the failure mode the design pass exists to catch.

---

## 1. Visual theme & atmosphere

The overall mood, density, and personality. One paragraph a build agent can calibrate against.

- **Mood:** {{e.g. calm and editorial / dense and utilitarian / playful and bold}}
- **Density:** {{spacious / balanced / compact}}
- **Reference apps:** {{1–3 apps whose feel this should evoke — Linear, Stripe, Notion, etc.}}
- **One-line north star:** {{"it should feel like ___"}}

## 2. Color palette & roles

Define as CSS custom properties with **semantic** names (role, not raw color). The build uses these variables, never hard-coded hex.

```css
:root {
  /* Surfaces */
  --color-bg:            {{#hex}};
  --color-surface:       {{#hex}};
  --color-surface-raised:{{#hex}};
  /* Text */
  --color-text:          {{#hex}};
  --color-text-muted:    {{#hex}};
  /* Brand / accent */
  --color-primary:       {{#hex}};
  --color-primary-hover: {{#hex}};
  /* Semantic */
  --color-success:       {{#hex}};
  --color-warning:       {{#hex}};
  --color-danger:        {{#hex}};
  --color-border:        {{#hex}};
}
```

Contrast: every text/background pair must meet {{WCAG AA (4.5:1 body, 3:1 large) | AAA}}. State the target; the design pass checks it.

## 3. Typography rules

```css
:root {
  --font-sans: {{e.g. "Inter", system-ui, sans-serif}};
  --font-mono: {{e.g. "JetBrains Mono", monospace}};
  /* Type scale (rem) */
  --text-xs:  {{0.75}};
  --text-sm:  {{0.875}};
  --text-base:{{1}};
  --text-lg:  {{1.125}};
  --text-xl:  {{1.5}};
  --text-2xl: {{2}};
  /* Weights */
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-bold:   700;
  /* Line heights */
  --leading-tight: 1.2;
  --leading-body:  1.6;
}
```

Hierarchy: define at least {{N}} distinct levels (page title → section → body → caption). Visible hierarchy is a design-pass check — flat typography is a fail.

## 4. Component stylings

Per primary component, define every state. Add/remove components to match the app.

| Component | Default | Hover | Active | Disabled | Focus (a11y) |
|---|---|---|---|---|---|
| Button (primary) | {{}} | {{}} | {{}} | {{}} | visible focus ring |
| Button (secondary) | {{}} | {{}} | {{}} | {{}} | visible focus ring |
| Input / text field | {{}} | — | {{focused border}} | {{}} | visible focus ring |
| Card / surface | {{}} | {{}} | — | — | — |
| Nav item | {{}} | {{}} | {{selected}} | — | visible focus ring |

Every interactive element has a **visible focus state** — keyboard users must see where they are. No `outline: none` without a replacement.

## 5. Layout principles

```css
:root {
  /* Spacing scale (rem) — use these, not arbitrary values */
  --space-1: 0.25; --space-2: 0.5; --space-3: 0.75;
  --space-4: 1;    --space-6: 1.5; --space-8: 2; --space-12: 3;
  /* Radii */
  --radius-sm: {{4px}}; --radius-md: {{8px}}; --radius-lg: {{16px}};
  /* Container */
  --container-max: {{e.g. 1200px}};
}
```

- **Grid / structure:** {{single column / sidebar + main / responsive grid — describe the primary layout}}
- **Whitespace rhythm:** consistent spacing from the scale; no one-off margins.
- **Alignment:** {{left-aligned content default; describe any intentional centering}}. Stray center-alignment with no reason is a common fail — call out where centering is intended.

## 6. Depth & elevation

```css
:root {
  --shadow-sm: {{0 1px 2px rgba(0,0,0,0.05)}};
  --shadow-md: {{0 4px 6px rgba(0,0,0,0.07)}};
  --shadow-lg: {{0 10px 25px rgba(0,0,0,0.1)}};
}
```

Surface hierarchy: {{describe what sits on what — e.g. cards raise above bg with shadow-sm; modals use shadow-lg + overlay}}. Don't use shadows decoratively; they encode elevation.

## 7. Do's and Don'ts

The guardrails the build agent reads as enforcement. Be specific to this project.

**Do:**
- Use the design tokens above for every color, space, radius, and type value.
- {{project-specific — e.g. "keep primary actions to one per view"}}

**Don't:**
- Hard-code hex colors, px spacing, or font sizes outside the token set.
- Ship raw browser-default styling (unstyled buttons, Times New Roman, no spacing).
- {{project-specific — e.g. "no more than 2 font weights per screen"}}

## 8. Responsive behavior

- **Breakpoints:** {{mobile <640 / tablet 640–1024 / desktop >1024 — or "desktop-only v1, state it"}}
- **Primary target:** {{desktop / mobile-first}}
- **Touch vs hover:** {{if touch matters, hover-only affordances need a tap equivalent}}
- **What reflows:** {{describe how the primary layout adapts — sidebar collapses, grid → single column, etc.}}

## 9. Agent prompt guide

Reusable prompts for future design work on this project, so new UI stays consistent.

- *"Add a {{component}} matching the existing design system — use the tokens in `docs/design.md`, the button states from §4, and the spacing scale from §5."*
- *"Review this view against `docs/design.md` §7 Do's and Don'ts and the contrast target in §2."*
- {{add project-specific prompts as the system matures}}
