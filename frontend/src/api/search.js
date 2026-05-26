import {
  buildSearchRequest,
  normalizeSearchResponse
} from "./searchSchema";

const BASE_URL = "http://localhost:8000";
const SEARCH_API_URL = `${BASE_URL}/search`;
const LINKEDIN_ENRICH_API_URL = `${BASE_URL}/search/linkedin/enrich`;

export async function searchJobs(input, options = {}) {
  const response = await fetch(SEARCH_API_URL, {
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
  const response = await fetch(LINKEDIN_ENRICH_API_URL, {
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