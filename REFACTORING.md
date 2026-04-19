## Summary
Maximize end-user value by first removing confusing steps and smoothing the CV flow, then improving search discovery controls, followed by result sorting/filtering and loading feedback. Verify backend search capabilities (date, distance) before wiring UI filters to avoid broken affordances.

## Steps
1. Validate backend search capabilities for distance and date filtering; identify what fields are returned for job posting date and whether JobSpy supports distance in this project. If unsupported, define UI fallback copy or hide controls. blocks step 6 (State: DONE)
2. Simplify CV review flow by removing the diff view and showing editable preview directly; preserve mapping results for rendering. blocks step 3 (State: DONE)
3. Add section add/remove controls in the final step before rendering so users can iterate without going back; ensure the mapping state can be re-run without losing edits. (State: DONE)
4. Add consistent loading states for all LLM-triggering actions (search refinement, CV parse, mapping, cover letter generation, PDF render), including disabled buttons and spinner placement. (State: OPEN)
5. Redesign the search bar to an Airbnb-style layout (title, location, distance) with a CV upload option under the bar; treat CV upload as optional and clarify the benefit. parallel with step 4 (State: OPEN)
6. Implement client-side date filters (last week/month/etc.) and sorting by date in the results list, operating on the fetched results set, with UI controls near the list header. depends on step 1 (State: OPEN)
7. UX consistency pass: align button styles, empty states, error messaging, spacing, and labels across search, results, and CV flow. parallel with step 6 (State: OPEN)

## Relevant files

[SearchFilters.jsx](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — search inputs, CV text input, search button and loading state
[App.jsx](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — search state, progress tracking, request/response flow
[ResultsList.jsx](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — list header, result rendering, placement for sort/filter UI
[CvReview.jsx](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — diff view removal, preview rendering, mapping controls
[CvEntry.jsx](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — resume parsing action and loading state
[JobModal.jsx](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — cover letter generation action and loading state
[search.py](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — search request schema, potential additions
[search_service.py](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — JobSpy query options and fields
[main.py](vscode-file://vscode-app/Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html) — API endpoints for search and LLM calls

## Verification

- Manual UX walkthrough: search with and without CV upload, apply date filter, sort by date, open job details, generate cover letter, parse CV, run mapping, and render PDF; confirm spinners appear for every LLM action.
- API check: verify search response includes posting date and distance data when available; ensure date filter and sort logic behaves on missing dates.
- Regression check: confirm existing ranking still applies when no date sorting is selected.

## Decisions
- Prioritize removing the diff view and enabling section add/remove in the final step to reduce user confusion and backtracking.
Apply date filters client-side on fetched results to avoid losing recall, unless backend constraints require server-side filtering.
Show distance control only if JobSpy provides a reliable distance filter in this project configuration.
Further Considerations
- Distance UX: Option A show control but disable with tooltip when unsupported; Option B hide entirely; Option C allow entry and filter locally if distance data exists in results.
CV upload: Option A support file upload and parse client-side to text; Option B accept paste only with clearer copy and call-to-action.
Sorting: Option A date-only sort; Option B add relevance/date toggle with persisted selection.