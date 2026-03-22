# Future Refactoring Checklist

These are non-blocking improvements worth tackling as the prototype grows.

## Priority order

### 1. Centralize request and response shapes

- [x] Extract the `SearchRequest` model from `backend/app/main.py` into a dedicated schema module such as `backend/app/schemas/search.py`.
- [x] Add a matching response schema for the `/search` endpoint in the same backend schema module, including the `jobs` payload contract.
- [x] Create a frontend contract file such as `frontend/src/api/searchSchema.js` or `frontend/src/types/search.js` that mirrors the request and response fields used by the UI.
- [x] Replace ad hoc field fallbacks in `frontend/src/App.jsx`, such as `job.company ?? job.company_name`, with one normalization path defined in the schema or mapper layer.
- [ ] Document the canonical job object shape in this file or in `README.md` once the contract is stabilized.

Why first: this establishes a stable contract and reduces the risk of spreading backend assumptions across later refactors.

### 2. Extract API calls into a client module

- [x] Create `frontend/src/api/search.js` to own the `POST /search` request currently embedded in `frontend/src/App.jsx`.
- [x] Move the `fetch("http://localhost:8000/search", ...)` call and `JSON.stringify(...)` payload creation out of `frontend/src/App.jsx` and into the API client.
- [x] Move response parsing and HTTP error handling into `frontend/src/api/search.js` so `frontend/src/App.jsx` only handles UI state transitions.
- [x] Introduce a small mapper in `frontend/src/api/search.js` or `frontend/src/api/mappers.js` to normalize backend job fields before they reach the UI.
- [ ] Keep the backend route definition in `backend/app/main.py` unchanged unless the new schema extraction requires updated imports.

Why second: once data shapes are centralized, the API client can become the single entry point for server communication.

### 3. Move derived data and formatting into utilities or hooks

- [x] Extract the `descriptionHtml` logic from `frontend/src/App.jsx` into a utility such as `frontend/src/utils/jobDescription.js` or a hook such as `frontend/src/hooks/useJobDescription.js`.
- [x] Move Markdown rendering with `marked` and sanitization with `DOMPurify` out of `frontend/src/App.jsx` so the modal rendering only consumes prepared HTML.
- [ ] Move any future display formatting, such as job meta labels or match reason formatting, into `frontend/src/utils/` instead of adding more `useMemo` blocks to `frontend/src/App.jsx`.
- [ ] If tests are added later, target the extracted formatter module directly rather than testing formatting behavior only through `frontend/src/App.jsx`.

Why third: this reduces rendering complexity and makes the later component split cleaner.

### 4. Split the UI into focused components

- [x] Keep `frontend/src/App.jsx` as the screen-level container for state and orchestration.
- [x] Extract the search form and filter controls from `frontend/src/App.jsx` into a component such as `frontend/src/components/SearchFilters.jsx`.
- [x] Extract the results list markup from `frontend/src/App.jsx` into `frontend/src/components/ResultsList.jsx`.
- [x] Extract the selected job modal from `frontend/src/App.jsx` into `frontend/src/components/JobModal.jsx`.
- [ ] Move any repeated job summary UI from `frontend/src/App.jsx` into a small reusable component such as `frontend/src/components/JobCard.jsx` if duplication appears during the split.
- [ ] Leave `frontend/src/main.jsx` unchanged unless component exports or app bootstrapping requirements change.

Why fourth: after data flow, API access, and formatting logic are separated, component extraction becomes lower-risk and easier to review.

## Expected outcome

- Cleaner separation between data access, view logic, and presentation.
- Easier backend and frontend changes without broad UI edits.
- Better testability for formatting and request-mapping logic.