"""{{PROJECT_NAME}} — interactive illustration (Streamlit starter).

Phase A of a research_publish project. This app illustrates findings from the
paper produced in Phase R (grounded STORM). Run with:

    pip install -r requirements.txt
    streamlit run app.py

Replace the placeholder finding + widget below with the entries from
docs/findings-to-illustrate.md. Keep the paper cross-reference (G_RP_A1) and the
reproducibility note (G_RP_A2) — both are paired-deliverable rules.
"""

import streamlit as st

# --- paper cross-reference surface (G_RP_A1) ---------------------------------
# This app illustrates findings from docs/paper/{{PAPER_TITLE}}.md.
# The paper's §5 Illustrations references this app in return.
PAPER = "docs/paper/{{PAPER_TITLE}}.md"
SOURCES = "docs/sources/registry.md"

st.set_page_config(page_title="{{PROJECT_NAME}}", layout="centered")
st.title("{{PROJECT_NAME}}")
st.caption(f"This interactive app illustrates findings from `{PAPER}`.")

st.markdown(
    "Each illustration below corresponds to a finding in the paper. "
    "Every claim the paper makes binds to a logged source in "
    f"`{SOURCES}` (grounded STORM: no source → no claim)."
)

# --- one illustrated finding (replace with docs/findings-to-illustrate.md) ----
st.subheader("F1 — {{finding headline}} [S001]")
st.write("{{One sentence restating the finding the reader is about to explore.}}")

# Placeholder interactive control — swap for the real model / data widget.
value = st.slider("{{a parameter the reader can vary}}", min_value=0, max_value=100, value=50)
st.write(f"Illustrated result for parameter = {value}: {{compute / plot from in-repo data}}")

# --- reproducibility surface (G_RP_A2) --------------------------------------
with st.expander("Reproducibility"):
    st.markdown(
        "The data and transformations behind these figures are reproducible from "
        "this repo (e.g. `data/` + a `prepare` step) — not from a one-off local run. "
        f"Sources: `{SOURCES}`. Paper: `{PAPER}`."
    )
