const BASE_URL = "http://localhost:8000";

export const API_BASE_URL = BASE_URL;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseErrorDetail(response) {
  try {
    const data = await response.json();
    const rawDetail = String(data?.detail || "").trim();
    if (!rawDetail) return "";

    const isTracebackLike =
      rawDetail.length > 280 ||
      /traceback|file\s+"\//i.test(rawDetail) ||
      /error code:\s*\d+/i.test(rawDetail);

    if (isTracebackLike) {
      if (response.status === 504) {
        return ": LLM service timed out. Check LM Studio and loaded model, then retry.";
      }
      return ": LLM service is currently unavailable. Check LM Studio and loaded model, then retry.";
    }

    return `: ${rawDetail}`;
  } catch (_err) {
    return "";
  }
}

async function assertOk(response, messagePrefix) {
  if (response.ok) return;
  const detail = await parseErrorDetail(response);
  throw new ApiError(`${messagePrefix} with status ${response.status}${detail}`, response.status);
}

function apiFetch(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...options
  });
}

export async function fetchAuthStatus() {
  const response = await apiFetch("/auth/me");
  if (response.status === 401) {
    return { auth_enabled: true, authenticated: false, username: null };
  }
  await assertOk(response, "Auth status request failed");
  return response.json();
}

export async function loginWithPassword(username, password) {
  const response = await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  await assertOk(response, "Login request failed");
  return response.json();
}

export async function logoutSession() {
  const response = await apiFetch("/auth/logout", { method: "POST" });
  await assertOk(response, "Logout request failed");
  return response.json();
}

export async function fetchHealth() {
  const response = await apiFetch("/health");
  await assertOk(response, "Health request failed");
  return response.json();
}

export async function fetchModels() {
  const response = await apiFetch("/models");
  await assertOk(response, "Models request failed");
  const data = await response.json();
  return Array.isArray(data.models) ? data.models : [];
}

export async function generateCoverLetter(payload) {
  const response = await apiFetch("/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "Cover letter request failed");

  const data = await response.json();
  return data.cover_letter ?? "";
}

function getFilenameFromDisposition(header) {
  if (!header) return "cv.pdf";
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] || "cv.pdf";
}

export async function generateCv(payload) {
  const response = await apiFetch("/cv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV request failed");

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}

export async function parseCvCanonical(payload) {
  const response = await apiFetch("/cv/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV parse failed");

  return response.json();
}

export async function rewriteCvCanonical(payload) {
  const response = await apiFetch("/cv/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV rewrite failed");

  return response.json();
}

export async function validateCvCanonical(payload) {
  const response = await apiFetch("/cv/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV validation failed");

  return response.json();
}

export async function listCvProfiles() {
  const response = await apiFetch("/cv/profiles");
  await assertOk(response, "CV profile list failed");
  return response.json();
}

export async function getCvProfile(profileId) {
  const response = await apiFetch(`/cv/profiles/${profileId}`);
  await assertOk(response, "CV profile fetch failed");
  return response.json();
}

export async function saveCvProfile(profileId, payload) {
  const response = await apiFetch(`/cv/profiles/${profileId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV profile save failed");
  return response.json();
}

export async function deleteCvProfile(profileId) {
  const response = await apiFetch(`/cv/profiles/${profileId}`, {
    method: "DELETE" }
  );
  await assertOk(response, "CV profile delete failed");
  return response.json();
}

export async function renderCvFromCanonical(payload) {
  const response = await apiFetch("/cv/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV render failed");

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}

export async function previewCvMapping(payload) {
  const response = await apiFetch("/cv/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV preview failed");

  return response.json();
}

export async function renderCvFromTemplate(payload) {
  const response = await apiFetch("/cv/render-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await assertOk(response, "CV render failed");

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}

export async function uploadCvProfileImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch("/cv/profile-image", {
    method: "POST",
    body: formData
  });
  await assertOk(response, "Profile image upload failed");

  return response.json();
}
