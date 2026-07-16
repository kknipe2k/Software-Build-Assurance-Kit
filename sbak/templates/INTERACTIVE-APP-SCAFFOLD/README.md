# Interactive app scaffolds (`research_publish` — Phase A)

> Starter skeletons for the **interactive illustrative app** half of a `research_publish` project. Phase R (grounded STORM) produced the paper + `docs/findings-to-illustrate.md`; Phase A turns those findings into something a reader can explore. Pick **one** format, delete the other two.

## The three starters

| Format | Path | Best when |
|---|---|---|
| **Streamlit** (Python) | `streamlit/app.py` | the illustration is a live model / data widget and you're in a Python stack |
| **Observable** (Framework / Markdown + JS) | `observable/index.md` | the illustration is data-driven charts in a narrative article |
| **Plain HTML/JS** (Distill-style) | `html-js/index.html` | you want zero build step / maximum portability for a static interactive figure |

Each is a **minimal runnable skeleton** — replace the placeholder content with the findings from `docs/findings-to-illustrate.md`.

## The two paired-deliverable rules these scaffolds bake in

- **`G_RP_A1` — cross-reference (both directions).** The app is not a standalone artifact. Every starter ships the **"this illustrates findings from `docs/paper/<paper>`"** surface; the paper's §5 Illustrations (`sbak/templates/PAPER-TEMPLATE.md`) carries the reciprocal "see the interactive app at `<URL>`". Keep both ends wired — a standalone app *or* a standalone paper is the failure mode. (C wires this surface as a gate.)
- **`G_RP_A2` — reproducibility surface.** If the app uses data, the data **and** the transformations the paper relied on are reproducible from this repo — no "I ran the analysis on my laptop and that's the figure." Put the data + the transform script in-repo (e.g. `data/` + a `build`/`prepare` step) and reference them from the app. This is what makes `research_publish` distinct from generic content-plus-app work.

## Phase A re-tiers — it is NOT Lite-locked like Phase R

Phase R always runs at **Lite process** (the discipline lives in the registry, not in milestones). **Phase A re-tiers** to whatever the app's complexity warrants — and **inherits the full scaffold + Stage V of the re-tiered tier** (a Standard Phase A runs Stage V like any Standard greenfield build; a single-page Observable notebook may stay Lite). The re-tier is an **explicit, user-driven event** surfaced at the end of Phase R (see bootstrap `CLAUDE.md` Phase-0 routing and `sbak/BUILD-PLAYBOOK.md` §3.9). If Phase A reveals more complexity than the re-tier assumed, the standard re-tier-mid-phase protocol applies (`OPERATING-MODES.md` §8 Q7).
