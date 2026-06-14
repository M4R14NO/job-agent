const escapeRegexLiteral = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const sanitizeProfileId = (value) => {
  const normalized = (value || "").trim().toLowerCase();
  const safe = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return safe || `profile-${Date.now()}`;
};

export const buildCvIdSuggestion = ({ jobTitle, existingIds } = {}) => {
  const normalizedIds = new Set((existingIds || []).map((id) => String(id || "").toLowerCase()));
  const baseSlug = String(jobTitle || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const prefix = baseSlug ? `${baseSlug}-v` : "v";
  let version = 2;
  let candidate = `${prefix}${version}`;
  while (normalizedIds.has(candidate.toLowerCase())) {
    version += 1;
    candidate = `${prefix}${version}`;
  }
  return candidate;
};

export const buildJobDraftProfileId = ({ baseId, company } = {}) => {
  const companySlug = sanitizeProfileId(company || "company");
  const base = sanitizeProfileId(baseId || "profile")
    .replace(/-v\d+$/, "")
    .replace(new RegExp(`-${escapeRegexLiteral(companySlug)}-draft(-v\\d+)?$`), "");
  return `${base}-${companySlug}-draft`;
};

export const buildNextAvailableDraftProfileId = ({ draftBaseId, existingIds } = {}) => {
  const normalizedBase = sanitizeProfileId(draftBaseId || "profile-draft");
  const idSet = new Set((existingIds || []).map((id) => String(id || "")));
  if (!idSet.has(normalizedBase)) return normalizedBase;

  const suffixPattern = new RegExp(`^${escapeRegexLiteral(normalizedBase)}-v(\\d+)$`);
  const versions = Array.from(idSet)
    .map((id) => {
      const match = suffixPattern.exec(id || "");
      return match ? Number(match[1]) : null;
    })
    .filter((value) => Number.isFinite(value));

  const maxVersion = versions.length ? Math.max(...versions) : 1;
  return `${normalizedBase}-v${Math.max(2, maxVersion + 1)}`;
};

export const buildCompanySuffixProfileId = ({ baseId, company } = {}) => {
  const base = sanitizeProfileId(baseId || "profile");
  const companySlug = sanitizeProfileId(company || "company");
  const withoutTrailingVersion = base.replace(/-v\d+$/, "");
  const withoutCompanySuffix = withoutTrailingVersion.replace(new RegExp(`-${escapeRegexLiteral(companySlug)}$`), "");
  return `${withoutCompanySuffix}-${companySlug}`;
};

export const buildNextVersionedProfileId = ({ profileId, existingIds } = {}) => {
  const normalized = (profileId || "profile").trim();
  const base = normalized.replace(/-v\d+$/, "") || "profile";
  const regex = new RegExp(`^${escapeRegexLiteral(base)}-v(\\d+)$`);
  const versionCandidates = (existingIds || [])
    .map((id) => {
      const match = regex.exec(String(id || ""));
      return match ? Number(match[1]) : null;
    })
    .filter((value) => Number.isFinite(value));
  const maxVersion = versionCandidates.length ? Math.max(...versionCandidates) : (normalized === base ? 1 : 0);
  return `${base}-v${Math.max(2, maxVersion + 1)}`;
};
