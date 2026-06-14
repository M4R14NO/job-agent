const normalizeContextValue = (value) => String(value || "").trim().toLowerCase();

export const contextFromProfile = (profile) => ({
  company: profile?.company || "",
  application_status: profile?.application_status || "",
  application_date: profile?.application_date || "",
  job_title: profile?.job_title || "",
  job_description: profile?.job_description || "",
  job_url: profile?.job_url || "",
  profile_image: profile?.data?.profile_image || "",
  theme_color: profile?.theme_color || "",
  show_profile_image: profile?.show_profile_image !== false,
  header_text_align: profile?.header_text_align || "right",
  header_title_size: profile?.header_title_size || "Huge",
  header_subtitle_size: profile?.header_subtitle_size || "Large"
});

export const contextSnapshotFromProfile = (profile) => ({
  profile_id: profile?.profile_id || "",
  revision: profile?.revision ?? 0,
  updated_at: profile?.updated_at || null,
  raw_resume_text: profile?.audit?.raw_resume_text || "",
  ...contextFromProfile(profile)
});

export const buildProfileApplicationContextDiff = ({
  resumeText,
  applicationContext,
  loadedProfileSnapshot
} = {}) => {
  const current = {
    raw_resume_text: resumeText,
    ...(applicationContext || {})
  };
  const previous = {
    raw_resume_text: loadedProfileSnapshot?.raw_resume_text || "",
    company: loadedProfileSnapshot?.company || "",
    application_status: loadedProfileSnapshot?.application_status || "",
    application_date: loadedProfileSnapshot?.application_date || "",
    job_title: loadedProfileSnapshot?.job_title || "",
    job_description: loadedProfileSnapshot?.job_description || "",
    job_url: loadedProfileSnapshot?.job_url || "",
    profile_image: loadedProfileSnapshot?.profile_image || "",
    theme_color: loadedProfileSnapshot?.theme_color || "",
    show_profile_image: loadedProfileSnapshot?.show_profile_image !== false,
    header_text_align: loadedProfileSnapshot?.header_text_align || "right",
    header_title_size: loadedProfileSnapshot?.header_title_size || "Huge",
    header_subtitle_size: loadedProfileSnapshot?.header_subtitle_size || "Large"
  };

  const config = [
    ["raw_resume_text", "CV text"],
    ["company", "Company"],
    ["application_status", "Application status"],
    ["application_date", "Application date"],
    ["job_title", "Job title"],
    ["job_description", "Job description"],
    ["job_url", "Job URL"],
    ["profile_image", "Profile image"],
    ["theme_color", "Theme color"],
    ["show_profile_image", "Show profile image"],
    ["header_text_align", "Header text align"],
    ["header_title_size", "Header title size"],
    ["header_subtitle_size", "Header subtitle size"]
  ];

  const topLevelChanges = config
    .filter(([key]) => JSON.stringify(previous[key] || "") !== JSON.stringify(current[key] || ""))
    .map(([key, label]) => ({
      key,
      label,
      oldValue: String(previous[key] || "(empty)"),
      newValue: String(current[key] || "(empty)")
    }));

  return {
    topLevelChanges,
    totals: { added: 0, removed: 0, updated: topLevelChanges.length },
    hasChanges: topLevelChanges.length > 0
  };
};

export const doesProfileMatchJobContext = ({
  selectedJob,
  selectedProfileId,
  loadedProfileSnapshot,
  applicationContext
} = {}) => {
  if (!selectedJob || !selectedProfileId) return false;

  const loadedUrl = normalizeContextValue(loadedProfileSnapshot?.job_url);
  const currentUrl = normalizeContextValue(selectedJob?.job_url || applicationContext?.job_url);
  if (loadedUrl && currentUrl) {
    return loadedUrl === currentUrl;
  }

  const loadedTitle = normalizeContextValue(loadedProfileSnapshot?.job_title);
  const loadedCompany = normalizeContextValue(loadedProfileSnapshot?.company);
  const currentTitle = normalizeContextValue(selectedJob?.title || applicationContext?.job_title);
  const currentCompany = normalizeContextValue(selectedJob?.company || applicationContext?.company);

  return Boolean(loadedTitle && loadedCompany && loadedTitle === currentTitle && loadedCompany === currentCompany);
};
