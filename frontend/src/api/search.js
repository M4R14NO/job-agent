import {
  buildSearchRequest,
  normalizeSearchResponse
} from "./searchSchema";

const SEARCH_API_URL = "http://localhost:8000/search";

export async function searchJobs(input) {
  const response = await fetch(SEARCH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSearchRequest(input))
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  return normalizeSearchResponse(data);
}