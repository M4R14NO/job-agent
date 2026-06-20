import {
  buildSearchRequest,
  buildQueryDebugRequest,
  buildRerankJobsRequest,
  buildScoreJobsRequest,
  normalizeSearchResponse
} from "./searchSchema";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
const SEARCH_API_URL = `${BASE_URL}/search`;
const QUERY_DEBUG_API_URL = `${BASE_URL}/search/query-debug`;
const SCORE_JOBS_API_URL = `${BASE_URL}/search/score-jobs`;
const RERANK_JOBS_API_URL = `${BASE_URL}/search/rerank`;
const LINKEDIN_ENRICH_API_URL = `${BASE_URL}/search/linkedin/enrich`;

function apiFetch(url, options = {}) {
  return fetch(url, {
    credentials: "include",
    ...options
  });
}

export async function searchJobs(input, options = {}) {
  const response = await apiFetch(SEARCH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSearchRequest(input)),
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  return normalizeSearchResponse(data);
}

export async function enrichLinkedInJobs(jobs, options = {}) {
  const response = await apiFetch(LINKEDIN_ENRICH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobs }),
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`LinkedIn enrich failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.items) ? data.items : [];
}

export async function fetchQueryDebug(input, options = {}) {
  const response = await apiFetch(QUERY_DEBUG_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildQueryDebugRequest(input)),
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Query debug request failed with status ${response.status}`);
  }

  return response.json();
}

export async function scoreJobsWithQueryDebug(input, options = {}) {
  const response = await apiFetch(SCORE_JOBS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildScoreJobsRequest(input)),
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Score jobs request failed with status ${response.status}`);
  }

  const data = await response.json();
  return normalizeSearchResponse(data);
}

export async function rerankJobs(input, options = {}) {
  const response = await apiFetch(RERANK_JOBS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRerankJobsRequest(input)),
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Rerank jobs request failed with status ${response.status}`);
  }

  const data = await response.json();
  return normalizeSearchResponse(data);
}