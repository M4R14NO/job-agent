const BASE_URL = "http://localhost:8000";

export async function fetchModels() {
  const response = await fetch(`${BASE_URL}/models`);
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data?.detail ? `: ${data.detail}` : "";
    } catch (err) {
      detail = "";
    }
    throw new Error(`Models request failed with status ${response.status}${detail}`);
  }
  const data = await response.json();
  return Array.isArray(data.models) ? data.models : [];
}

export async function generateCoverLetter(payload) {
  const response = await fetch(`${BASE_URL}/cover-letter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data?.detail ? `: ${data.detail}` : "";
    } catch (err) {
      detail = "";
    }
    throw new Error(`Cover letter request failed with status ${response.status}${detail}`);
  }

  const data = await response.json();
  return data.cover_letter ?? "";
}
