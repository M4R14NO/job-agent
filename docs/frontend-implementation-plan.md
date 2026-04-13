# Frontend implementation plan

## Scope
Update the search sidebar, LLM refinement flow, and job detail action UI. Focus on Chakra UI components, clearer information hierarchy, and better feedback during long-running operations.

## Goals
- Keep search term, location, and remote-only visible at all times.
- Move remaining search options into two Chakra accordion sections.
- Add LLM refinement helper text, examples, and clearer CTAs.
- Widen the search sidebar for better resume text editing.
- Show better progress feedback during search and LLM refinement.
- use Chakra UI components where possible/available

## Plan

### 1) Search sidebar layout
- Keep always-visible fields:
  - Search term
  - Location
  - Remote-only checkbox (unchecked default)
- Increase sidebar width for resume editing (target 360-420px on desktop).

### 2) Accordion: Search Options
- Section title: "Search Options"
- Contents:
  - Results wanted
  - Time filter (1 day, 3 days, 1 week, 2 weeks, 1 month)
  - Sites (Indeed, LinkedIn, Google)
  - Fetch full descriptions toggle
- Add per-section action button (apply search options). Default collapsed.

### 3) Accordion: LLM search refinement
- Section title: "LLM search refinement"
- Contents:
  - Job wishes textarea
    - Placeholder with cultural values and constraints example
    - Helper text: how wishes are used by the LLM
  - Re-rank checkbox (default false)
    - Helper text describing rerank behavior
  - Resume/CV textarea (mandatory when refinement enabled)
    - Helper text: include dates/time spans
    - Collapsible "Show example text" area with sample canonical data snippets
  - LLM model dropdown
  - LLM timeout using Chakra NumberInput (minutes, default 2)
- Add per-section action button (apply refinement). Default collapsed.

### 4) Results area feedback
- Show a spinner in the results area while searching.
- For LLM refinement, show a progress bar with a token counter.
  - Progress range based on elapsed time vs LLM timeout.
  - Display current tokens above or inside the bar.

### 5) Job detail action UI
- Action buttons in top bar should be colored blue (Create CV / Generate cover letter).
- Cover letter panel layout should match the CV panel styling pattern.
- Use Chakra components for layout primitives where possible.

## Files to change
- frontend/src/components/SearchFilters.jsx
- frontend/src/App.jsx
- frontend/src/styles.css
- frontend/src/components/ResultsList.jsx
- frontend/src/components/JobModal.jsx

## Open questions
- Should the accordion sections be collapsed by default or persist open state per user session?
- Do you want to store refinement inputs per session or per search?

## Verification
- Sidebar shows term/location/remote without accordion interaction.
- Accordion sections render with correct fields and helper text.
- Resume editor has more width and readable layout.
- Search results show spinner during search.
- LLM refinement progress bar shows time-based progress and token count.
- Action buttons are blue and visually consistent with the CV panel styling.
