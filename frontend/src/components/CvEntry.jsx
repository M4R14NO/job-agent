import { useMemo, useState } from "react";
import { Progress, Spinner } from "@chakra-ui/react";

const SECTION_DESCRIPTORS = [
  { key: "summary", label: "Summary", hasContent: (profile) => Boolean((profile?.data?.summary || "").trim()) },
  { key: "skills", label: "Skills", hasContent: (profile) => (profile?.data?.skills || []).length > 0 },
  { key: "languages", label: "Languages", hasContent: (profile) => (profile?.data?.languages || []).length > 0 },
  { key: "interests", label: "Interests", hasContent: (profile) => (profile?.data?.interests || []).length > 0 },
  { key: "experience", label: "Experience", hasContent: (profile) => (profile?.data?.experience || []).length > 0 },
  { key: "volunteer", label: "Volunteer", hasContent: (profile) => (profile?.data?.volunteer || []).length > 0 },
  { key: "honors", label: "Honors", hasContent: (profile) => (profile?.data?.awards || []).length > 0 },
  { key: "certificates", label: "Certificates", hasContent: (profile) => (profile?.data?.certificates || []).length > 0 },
  { key: "writing", label: "Writing", hasContent: (profile) => (profile?.data?.publications || []).length > 0 },
  { key: "education", label: "Education", hasContent: (profile) => (profile?.data?.education || []).length > 0 }
];

const EXAMPLE_CV_TEXT = `PROFILE
Name: Alex Rivers
Headline: Senior Machine Learning Engineer | Applied AI Systems
Summary: 8+ years delivering production AI systems, MLOps workflows, and measurable product impact.

CONTACT
Email: alex.rivers@example.com
Phone: +49 151 0000 0000
Location: Munich, Germany
Links: github.com/alexrivers, linkedin.com/in/alexrivers

EXPERIENCE
2022-01 to Present | Principal ML Engineer | Northstar AI GmbH | Munich, Germany
- Led retrieval and ranking platform serving 2M+ requests/day with 99.95% uptime.
- Improved recommendation CTR by 18% through hybrid embedding plus keyword architecture.
- Mentored 6 engineers and established model release quality gates.

2019-04 to 2021-12 | Senior Data Scientist | Helios Analytics | Berlin, Germany
- Built forecasting services that reduced inventory misses by 24%.
- Introduced feature store conventions and model registry governance.

EDUCATION
M.Sc. Computer Science | Technical University of Munich | 2018
B.Sc. Information Engineering | University of Stuttgart | 2016

SKILLS
Machine Learning: ranking systems, NLP, recommendation systems, experimentation
Programming: Python, TypeScript, SQL, Bash
Platforms: AWS, Docker, Kubernetes, Airflow, Postgres

LANGUAGES
German (C1), English (C2), Spanish (B1)

VOLUNTEER
Mentor | Data4Good Munich | 2021-Present
- Run monthly workshops on practical ML project setup.

HONORS
Top 10 Finalist | European ML Challenge | 2023
Dean's List | TU Munich | 2016-2018

CERTIFICATES
AWS Certified Machine Learning Specialty | AWS | 2024
TensorFlow Developer Certificate | Google | 2022

WRITING
"Efficient Ranking with Hybrid Signals" | Applied AI Review | 2024
"Reliable Offline Evaluation in Recommenders" | MLOps Journal | 2023

INTERESTS
Trail running, analog photography, open-source developer tooling

STRENGTHS
Cross-functional leadership, system thinking, pragmatic delivery

HOBBIES
Rock climbing, chess, espresso brewing

PROJECTS
Open-source feature drift monitor for tabular models (github.com/alexrivers/drift-watch)`;

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
};

const normalizeText = (value) => String(value || "").toLowerCase();

const fuzzyFieldMatch = (query, text) => {
  const q = normalizeText(query).trim();
  const t = normalizeText(text);
  if (!q || q.length < 4) return false;
  if (t.includes(q)) return true;
  let qi = 0;
  let startIndex = -1;
  let endIndex = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      if (startIndex === -1) startIndex = ti;
      endIndex = ti;
      qi += 1;
    }
  }
  if (qi !== q.length) return false;
  // Reject very wide matches to avoid matching almost every row.
  const span = endIndex - startIndex + 1;
  return span <= q.length * 3;
};

const profileSearchFields = (profile) => [
  profile.profile_id,
  profile.company,
  profile.application_status,
  profile.application_date,
  profile.job_title,
  profile.job_description,
  profile.job_url,
  profile.template_id,
  profile.audit?.raw_resume_text,
  JSON.stringify(profile.data || {})
];

const profileMatchesQuery = (profile, query) => {
  const normalized = normalizeText(query).trim();
  if (!normalized) return true;
  const terms = normalized.split(/\s+/).filter(Boolean);
  const fields = profileSearchFields(profile).map((field) => normalizeText(field));
  return terms.every((term) => fields.some((field) => field.includes(term) || fuzzyFieldMatch(term, field)));
};

const statusBadgeClass = (status) => {
  const normalized = normalizeText(status);
  if (normalized === "offer" || normalized === "invited" || normalized === "interviewing") return "status-badge is-positive";
  if (normalized === "applied" || normalized === "in-prep") return "status-badge is-neutral";
  if (normalized === "rejected" || normalized === "closed") return "status-badge is-negative";
  return "status-badge";
};

const nextProfileVersionName = (profileId) => {
  const normalized = (profileId || "profile").trim() || "profile";
  const match = normalized.match(/^(.*?)-v(\d+)$/);
  if (match) {
    return `${match[1]}-v${Number(match[2]) + 1}`;
  }
  return `${normalized}-v2`;
};

const getSectionStats = (profile) => {
  const knownKeys = SECTION_DESCRIPTORS.map((descriptor) => descriptor.key);
  const templateId = profile?.template_id || "awesomecv";
  const orderedSections = templateId === "hipstercv"
    ? [
      ...(Array.isArray(profile?.sidebar_section_order) ? profile.sidebar_section_order : []),
      ...(Array.isArray(profile?.main_section_order) ? profile.main_section_order : [])
    ]
    : (Array.isArray(profile?.section_order) ? profile.section_order : []);

  const hasExplicitLayout = orderedSections.length > 0;
  const visibleKeySet = hasExplicitLayout
    ? new Set(orderedSections.filter((key) => knownKeys.includes(key)))
    : new Set(
      SECTION_DESCRIPTORS
        .filter((descriptor) => descriptor.hasContent(profile))
        .map((descriptor) => descriptor.key)
    );

  const visible = SECTION_DESCRIPTORS
    .filter((descriptor) => visibleKeySet.has(descriptor.key))
    .map((descriptor) => descriptor.label);
  const hidden = SECTION_DESCRIPTORS
    .filter((descriptor) => !visibleKeySet.has(descriptor.key))
    .map((descriptor) => descriptor.label);
  return {
    visible,
    hidden
  };
};

export default function CvEntry({
  cvProfiles,
  profilesLoading,
  profilesError,
  selectedProfileId,
  onSelectedProfileIdChange,
  onProfileRowSelect,
  onRefreshProfiles,
  onCreateCvFromResume,
  onUpdateProfileCvText,
  onRemapProfileCvText,
  isCreatingCv,
  isLoadingProfile,
  isUpdatingProfileCvText,
  isRemappingProfileCvText,
  remapProgress,
  cvEntryError,
  cvTemplateId,
  onCvTemplateIdChange,
  cvOutputLanguage,
  onCvOutputLanguageChange,
  applicationContext,
  onApplicationContextChange,
  resumeText,
  onResumeTextChange,
  newProfileId,
  onNewProfileIdChange
}) {
  const [activeTab, setActiveTab] = useState("load");
  const [showExampleCvText, setShowExampleCvText] = useState(false);
  const [profileSearchDraft, setProfileSearchDraft] = useState("");
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updated");
  const [sortDirection, setSortDirection] = useState("desc");
  const [remapDialogOpen, setRemapDialogOpen] = useState(false);
  const [remapProfileName, setRemapProfileName] = useState("");

  const selectedProfile = useMemo(
    () => cvProfiles.find((profile) => profile.profile_id === selectedProfileId) || null,
    [cvProfiles, selectedProfileId]
  );

  const filteredProfiles = useMemo(() => {
    const filtered = cvProfiles.filter((profile) => profileMatchesQuery(profile, profileSearchQuery));
    const sorted = [...filtered].sort((a, b) => {
      const leftDate = Date.parse(a.updated_at || a.created_at || "") || 0;
      const rightDate = Date.parse(b.updated_at || b.created_at || "") || 0;
      const getValue = (profile, key) => {
        if (key === "updated") return Date.parse(profile.updated_at || profile.created_at || "") || 0;
        if (key === "revision") return Number(profile.revision || 0);
        return normalizeText(profile?.[key]);
      };
      const left = sortBy === "updated" ? leftDate : getValue(a, sortBy);
      const right = sortBy === "updated" ? rightDate : getValue(b, sortBy);
      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return normalizeText(a.profile_id).localeCompare(normalizeText(b.profile_id));
    });
    return sorted;
  }, [cvProfiles, profileSearchQuery, sortBy, sortDirection]);

  const remapTargetExists = useMemo(
    () => cvProfiles.some((profile) => profile.profile_id === remapProfileName.trim()),
    [cvProfiles, remapProfileName]
  );

  const handleProfileSelect = (profile) => {
    if (onProfileRowSelect) {
      onProfileRowSelect(profile);
      return;
    }
    onSelectedProfileIdChange(profile.profile_id);
  };

  const openRemapDialog = () => {
    const suggested = nextProfileVersionName(selectedProfile?.profile_id || selectedProfileId || "profile");
    setRemapProfileName(suggested);
    setRemapDialogOpen(true);
  };

  const handleConfirmRemap = () => {
    const targetProfileId = remapProfileName.trim();
    if (!targetProfileId) return;
    onRemapProfileCvText?.({
      targetProfileId,
      allowOverwrite: remapTargetExists
    });
    setRemapDialogOpen(false);
  };

  const toggleSort = (nextSortBy) => {
    if (sortBy === nextSortBy) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSortBy);
    setSortDirection(nextSortBy === "updated" || nextSortBy === "revision" ? "desc" : "asc");
  };

  const renderSortHeader = (label, key) => (
    <button type="button" className="table-sort-button" onClick={() => toggleSort(key)}>
      <span>{label}</span>
      {sortBy === key ? <span className="table-sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );

  return (
    <div className="cv-entry">
      <div className="cv-entry-header">
        <div>
          <p className="eyebrow">CV editor</p>
          <h3>Work on an existing profile</h3>
          <p className="helper">Choose a saved profile or create a fresh CV profile from CV text.</p>
        </div>
        <button type="button" className="ghost" onClick={onRefreshProfiles} disabled={profilesLoading}>
          {profilesLoading ? "Refreshing..." : "Refresh profiles"}
        </button>
      </div>

      <div className="cv-entry-tabs" role="tablist" aria-label="CV entry actions">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "load"}
          className={`cv-entry-tab${activeTab === "load" ? " is-active" : ""}`}
          onClick={() => setActiveTab("load")}
        >
          Load existing profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "create"}
          className={`cv-entry-tab${activeTab === "create" ? " is-active" : ""}`}
          onClick={() => setActiveTab("create")}
        >
          Create from CV text
        </button>
      </div>

      {activeTab === "load" ? (
        <div className="cv-entry-panel" role="tabpanel">
          <div>
            <label htmlFor="profileSearch" className="label">Search profiles</label>
            <div className="cv-search-row">
              <input
                id="profileSearch"
                type="text"
                placeholder="Search by profile name, company, status, job title, description, or CV text"
                value={profileSearchDraft}
                onChange={(e) => setProfileSearchDraft(e.target.value)}
              />
              <button type="button" className="secondary" onClick={() => setProfileSearchQuery(profileSearchDraft)}>
                Search
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setProfileSearchDraft("");
                  setProfileSearchQuery("");
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="cv-profile-table-wrap">
            <table className="cv-profile-table">
              <thead>
                <tr>
                  <th>{renderSortHeader("Profile", "profile_id")}</th>
                  <th>{renderSortHeader("Company", "company")}</th>
                  <th>{renderSortHeader("Status", "application_status")}</th>
                  <th>{renderSortHeader("Job title", "job_title")}</th>
                  <th>{renderSortHeader("Template", "template_id")}</th>
                  <th>{renderSortHeader("Revision", "revision")}</th>
                  <th>{renderSortHeader("Updated", "updated")}</th>
                  <th>Sections</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <p className="helper">No matching profiles found.</p>
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((profile) => {
                    const sectionStats = getSectionStats(profile);
                    const isSelected = selectedProfileId === profile.profile_id;
                    return (
                      <tr
                        key={profile.profile_id}
                        className={isSelected ? "is-selected" : ""}
                        onClick={() => handleProfileSelect(profile)}
                      >
                        <td>{profile.profile_id}</td>
                        <td>{profile.company || "-"}</td>
                        <td>
                          {profile.application_status ? (
                            <span className={statusBadgeClass(profile.application_status)}>{profile.application_status}</span>
                          ) : "-"}
                        </td>
                        <td>{profile.job_title || "-"}</td>
                        <td>{profile.template_id || "awesomecv"}</td>
                        <td>r{profile.revision ?? 0}</td>
                        <td>{formatDate(profile.updated_at || profile.created_at)}</td>
                        <td>
                          <span className="cv-profile-section-meta">
                            {sectionStats.visible.length} shown / {sectionStats.hidden.length} hidden
                          </span>
                          <span className="cv-profile-section-list">
                            + {sectionStats.visible.join(", ") || "None"}
                          </span>
                          <span className="cv-profile-section-list muted">
                            - {sectionStats.hidden.join(", ") || "None"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="sub-card" style={{ marginTop: 4 }}>
            <div className="sub-card-header">
              <strong>Application context</strong>
            </div>
            <p className="helper">Track the job application context and keep CV source text with it.</p>
            <div className="field-grid">
              <div>
                <label htmlFor="ctxCompany" className="label">Company</label>
                <input
                  id="ctxCompany"
                  value={applicationContext.company || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ctxDate" className="label">Application date</label>
                <input
                  id="ctxDate"
                  type="date"
                  value={applicationContext.application_date || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, application_date: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ctxJobTitle" className="label">Job title</label>
                <input
                  id="ctxJobTitle"
                  value={applicationContext.job_title || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, job_title: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ctxStatus" className="label">Application status</label>
                <select
                  id="ctxStatus"
                  className="app-status-select"
                  value={applicationContext.application_status || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, application_status: e.target.value }))}
                >
                  <option value="">Not set</option>
                  <option value="in-prep">In preparation</option>
                  <option value="applied">Applied</option>
                  <option value="invited">Invited</option>
                  <option value="interviewing">Interviewing</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="ctxJobUrl" className="label">Job URL</label>
                <input
                  id="ctxJobUrl"
                  value={applicationContext.job_url || ""}
                  placeholder="https://..."
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, job_url: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="ctxJobDescription" className="label">Job description</label>
                <textarea
                  id="ctxJobDescription"
                  rows={5}
                  value={applicationContext.job_description || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, job_description: e.target.value }))}
                  placeholder="Optional: paste a job description to tailor CV remapping"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="loadedProfileCvText" className="label">CV text</label>
                <textarea
                  id="loadedProfileCvText"
                  rows={8}
                  placeholder="Paste or edit CV text for this profile"
                  value={resumeText}
                  onChange={(e) => onResumeTextChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="cv-entry-actions">
            <button
              type="button"
              className="secondary cv-action-update"
              onClick={onUpdateProfileCvText}
              disabled={isUpdatingProfileCvText || isLoadingProfile || !selectedProfile}
            >
              {isUpdatingProfileCvText ? "Updating profile..." : "Update application profile data"}
            </button>
            <button
              type="button"
              className="secondary cv-action-remap"
              title="Use your CV text together with the optional job title and job description to create a tailored CV profile."
              onClick={openRemapDialog}
              disabled={isRemappingProfileCvText || isLoadingProfile || !selectedProfile || !resumeText.trim()}
            >
              {isRemappingProfileCvText ? "Tailoring profile..." : "Tailor CV using CV text + job description"}
            </button>
          </div>

          {isRemappingProfileCvText && remapProgress ? (
            <div className="refinement-progress">
              <div className="results-loading">
                <Spinner size="sm" color="blue.500" />
                <span>Tailoring your CV for this role. This can take about a minute.</span>
              </div>
              <div className="progress-header">
                <span>CV tailoring progress</span>
                <span>
                  {remapProgress.percent}% complete
                </span>
              </div>
              <Progress.Root value={remapProgress.percent} size="sm" colorPalette="blue">
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
              <p className="helper">
                {remapProgress.elapsedSeconds}s / {remapProgress.timeoutSeconds}s elapsed
              </p>
            </div>
          ) : null}

        </div>
      ) : (
        <div className="cv-entry-panel" role="tabpanel">
          <div className="field-grid">
            <div>
              <label htmlFor="newProfileName" className="label">New profile name</label>
              <input
                id="newProfileName"
                type="text"
                placeholder="e.g. data-scientist-2026"
                value={newProfileId}
                onChange={(e) => onNewProfileIdChange(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cvTemplateEntry" className="label">Template</label>
              <select
                id="cvTemplateEntry"
                value={cvTemplateId}
                onChange={(e) => onCvTemplateIdChange(e.target.value)}
              >
                <option value="awesomecv">AwesomeCV</option>
                <option value="hipstercv">HipsterCV</option>
              </select>
            </div>
            <div>
              <label htmlFor="cvLanguageEntry" className="label">Output language</label>
              <select
                id="cvLanguageEntry"
                value={cvOutputLanguage}
                onChange={(e) => onCvOutputLanguageChange(e.target.value)}
              >
                <option value="english">English</option>
                <option value="german">German</option>
              </select>
            </div>
          </div>

          <label htmlFor="resumeCv" className="label">CV text</label>
          <textarea
            id="resumeCv"
            rows={10}
            placeholder="Paste plain text from your CV here..."
            value={resumeText}
            onChange={(e) => onResumeTextChange(e.target.value)}
          />

          <button
            type="button"
            className="ghost"
            onClick={() => setShowExampleCvText((prev) => !prev)}
          >
            {showExampleCvText ? "Hide example CV text" : "Show example CV text"}
          </button>
          {showExampleCvText && <pre className="example-box">{EXAMPLE_CV_TEXT}</pre>}

          <div className="cv-entry-actions">
            <button
              type="button"
              className="secondary"
              onClick={onCreateCvFromResume}
              disabled={isCreatingCv || !resumeText.trim()}
            >
              {isCreatingCv ? "Parsing CV..." : "Create new CV profile"}
            </button>
            <p className="helper">Document type is fixed to CV for this workflow.</p>
          </div>
        </div>
      )}

      {profilesError && <p className="error">{profilesError}</p>}
      {cvEntryError && <p className="error">{cvEntryError}</p>}

      {remapDialogOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="remap-name-title">
          <div className="modal-backdrop" onClick={() => setRemapDialogOpen(false)} />
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="remap-name-title">Choose a name for the new profile version</h2>
            </div>
            <p className="helper">A new tailored profile will be generated using your CV text and saved under this name.</p>
            <div>
              <label htmlFor="remapProfileName" className="label">New profile name</label>
              <input
                id="remapProfileName"
                type="text"
                value={remapProfileName}
                onChange={(e) => setRemapProfileName(e.target.value)}
              />
            </div>
            {remapTargetExists ? (
              <p className="error">This name already exists. Continuing will overwrite the existing profile and previous data cannot be recovered.</p>
            ) : null}
            <div className="inline-actions">
              <button type="button" className="secondary" onClick={() => setRemapDialogOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`secondary ${remapTargetExists ? "cv-action-danger" : "cv-action-remap"}`}
                onClick={handleConfirmRemap}
                disabled={!remapProfileName.trim()}
              >
                {remapTargetExists ? "Overwrite existing profile" : "Create new profile version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
