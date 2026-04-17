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

function getFilenameFromDisposition(header) {
  if (!header) return "cv.pdf";
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] || "cv.pdf";
}

export async function generateCv(payload) {
  const response = await fetch(`${BASE_URL}/cv`, {
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
    throw new Error(`CV request failed with status ${response.status}${detail}`);
  }

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}

export async function parseCvCanonical(payload) {
  const response = await fetch(`${BASE_URL}/cv/parse`, {
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
    throw new Error(`CV parse failed with status ${response.status}${detail}`);
  }

  return response.json();
}

export async function rewriteCvCanonical(payload) {
  const response = await fetch(`${BASE_URL}/cv/rewrite`, {
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
    throw new Error(`CV rewrite failed with status ${response.status}${detail}`);
  }

  return response.json();
}

export async function validateCvCanonical(payload) {
  const response = await fetch(`${BASE_URL}/cv/validate`, {
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
    throw new Error(`CV validation failed with status ${response.status}${detail}`);
  }

  return response.json();
}

export async function listCvProfiles() {
  const response = await fetch(`${BASE_URL}/cv/profiles`);
  if (!response.ok) {
    throw new Error(`CV profile list failed with status ${response.status}`);
  }
  return response.json();
}

export async function getCvProfile(profileId) {
  const response = await fetch(`${BASE_URL}/cv/profiles/${profileId}`);
  if (!response.ok) {
    throw new Error(`CV profile fetch failed with status ${response.status}`);
  }
  return response.json();
}

export async function saveCvProfile(profileId, payload) {
  const response = await fetch(`${BASE_URL}/cv/profiles/${profileId}`, {
    method: "PUT",
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
    throw new Error(`CV profile save failed with status ${response.status}${detail}`);
  }
  return response.json();
}

export async function deleteCvProfile(profileId) {
  const response = await fetch(`${BASE_URL}/cv/profiles/${profileId}`, {
    method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(`CV profile delete failed with status ${response.status}`);
  }
  return response.json();
}

export async function renderCvFromCanonical(payload) {
  const response = await fetch(`${BASE_URL}/cv/render`, {
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
    throw new Error(`CV render failed with status ${response.status}${detail}`);
  }

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}

export async function previewCvMapping(payload) {
  const response = await fetch(`${BASE_URL}/cv/preview`, {
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
    throw new Error(`CV preview failed with status ${response.status}${detail}`);
  }

  return response.json();
}

export async function renderCvFromTemplate(payload) {
  const response = await fetch(`${BASE_URL}/cv/render-template`, {
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
    throw new Error(`CV render failed with status ${response.status}${detail}`);
  }

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}
