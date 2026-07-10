# Design Discovery Interview

> Runs at **Phase 1.5**, web/UI deliverables only (`deliverable_type: web`), after the spec and before milestone planning. Produces the answers the agent synthesizes into `docs/design.md` (the 9-section brief) at Phase 1.6.
>
> **Two paths in. Ask the gate question first:**
>
> **Path A — "Do you have Claude Design (Pro / Max / Team / Enterprise)?"** If yes: the user authors the design system in Claude Design, exports the `design.md` handoff, and drops it in `docs/design.md`. The agent validates it has the 9 sections, then **skips this interview** and goes to Phase 2.
>
> **Path B — no Claude Design.** Run this interview inside the session. Two sub-modes:
> - **B1 — from scratch:** ask the questions below at the tier-conditional depth.
> - **B2 — from a community template:** the user picks a starting point from `awesome-claude-design` (VoltAgent / rohitg00 — 68+ ready `design.md` files: Linear, Stripe, Vercel, fintech, e-commerce aesthetics), drops it in `docs/design.md`, and the agent runs only the **delta** questions (~10, any tier) — what to change from the template, which tokens are project-specific.
>
> The agent does not write `docs/design.md` until the user says they're good (same approve-before-write discipline as spec authoring).

---

## How the agent opens

> "This is a web/UI build, so before any interface code I'll capture a short design brief — it becomes `docs/design.md`, which every build stage reads so the UI is consistent and actually looks designed (not raw browser defaults).
>
> First: **do you have Claude Design** (Anthropic's design tool, on Pro and up)? If so, you can build the system there and hand me the export — fastest path. If not, I'll ask you some questions, or we can start from a community template and tweak it."

Then route to A, B1, or B2.

---

## Question set (Path B1)

Grouped by the `design.md` section each feeds. Tier-conditional depth:

- **Lite** (`deliverable_type: web` at Lite tier): ask the **★ starred** questions only (~8–10). Quick directional brief.
- **Standard:** ★ plus the unstarred core (~25–30).
- **Full:** everything, including the ◆ depth questions (~50–70).

The agent flexes wording and follows up on vague answers, but covers every section — don't skip a whole dimension.

### A. Theme & audience (→ §1)
- ★ Who uses this, and in what context (focused work tool? casual? public-facing)?
- ★ Name 1–3 apps whose look-and-feel you admire for this.
- ★ One line: "it should feel like ___."
- Density preference — spacious and calm, or dense and information-rich?
- ◆ Any brand personality words to hit (or avoid)?

### B. Color (→ §2)
- ★ Light, dark, or both?
- ★ A primary/brand color, or should I propose one?
- Any existing brand colors / logo to match?
- Accessibility target — WCAG AA (typical) or AAA?
- ◆ Semantic colors (success/warning/danger) — defaults fine, or specific?

### C. Typography (→ §3)
- ★ Any required font, or should I pick a clean default (e.g. Inter / system)?
- Serif, sans, or mono character?
- ◆ How many heading levels does the content need?

### D. Components & interaction (→ §4)
- ★ List the main UI pieces (buttons, forms, cards, nav, tables, modals…).
- Keyboard-first, mouse, or touch primary?
- Undo / confirmation expectations for destructive actions?
- ◆ Any component with specific state behavior worth noting now?

### E. Layout (→ §5)
- ★ Describe the primary screen: where does the user land, what's the main structure (sidebar? top nav? single column?)?
- Information density — how much on screen at once?
- ◆ Any intentional centering, or left-aligned throughout?

### F. Depth, responsive, guardrails (→ §6, §8, §7)
- Flat or layered (shadows / elevation)?
- ★ Device target — desktop, mobile-first, or responsive both? (If desktop-only for v1, say so — it's a valid scope cut.)
- ★ Anything you specifically **don't** want (no dark mode, no animation, no rounded corners…)?
- ◆ What's the empty state / error state / loading experience?

### G. Acceptance (→ feeds spec §Visual Acceptance + the design pass)
- ★ How will you know the UI is "good enough to ship"? (e.g. "looks like a real product, not a prototype"; "a stranger could use it without help".)

---

## Delta question set (Path B2 — from a community template)

When starting from an `awesome-claude-design` template, skip the full set. Ask only:

1. Which template did you pick (or paste it)? I'll read its 9 sections as the baseline.
2. Keep its color palette, or swap to yours? (If swap: primary color + light/dark.)
3. Keep its typography, or change the font character?
4. Your app's specific components — anything the template doesn't cover?
5. Your primary screen layout — does the template's structure fit, or adjust?
6. Device target — same as template, or different?
7. Anything in the template's Do's/Don'ts that doesn't apply here?
8. Your accessibility target?
9. One-line "it should feel like ___" — confirm or override the template's mood.
10. Acceptance: how you'll know it's ship-ready.

---

## After the answers (Path B1 or B2)

1. **Synthesize into the 9 sections** of `templates/design.md`, replacing every `{{placeholder}}` with a concrete value. No placeholders left in the instance file.
2. **Surface the drafted `docs/design.md` for approval.** Don't write to disk until the user confirms (web/Standard+ may write-then-review per the project's `pre_write_surface` setting, but design.md is worth a pre-write look — it drives every UI stage).
3. On approval, write `docs/design.md`, add it to the work read-first list, and note in `project-config.md` that the design brief is authored.
4. Proceed to Phase 2 (milestone planning).
