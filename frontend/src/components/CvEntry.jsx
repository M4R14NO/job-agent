import { useEffect, useMemo, useState } from "react";

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

const getSectionStats = (profile) => {
  const visible = SECTION_DESCRIPTORS.filter((descriptor) => descriptor.hasContent(profile)).map((descriptor) => descriptor.label);
  const hidden = SECTION_DESCRIPTORS.filter((descriptor) => !descriptor.hasContent(profile)).map((descriptor) => descriptor.label);
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
  onRefreshProfiles,
  onLoadProfile,
  onCreateCvFromResume,
  isCreatingCv,
  isLoadingProfile,
  cvEntryError,
  cvTemplateId,
  onCvTemplateIdChange,
  cvOutputLanguage,
  onCvOutputLanguageChange,
  resumeText,
  onResumeTextChange,
  newProfileId,
  onNewProfileIdChange
}) {
  const [activeTab, setActiveTab] = useState("load");
  const [showExampleCvText, setShowExampleCvText] = useState(false);

  const selectedProfile = useMemo(
    () => cvProfiles.find((profile) => profile.profile_id === selectedProfileId) || null,
    [cvProfiles, selectedProfileId]
  );

  useEffect(() => {
    if (!selectedProfile) return;
    onCvTemplateIdChange(selectedProfile.template_id || "awesomecv");
    onResumeTextChange(selectedProfile.audit?.raw_resume_text || "");
  }, [selectedProfile, onCvTemplateIdChange, onResumeTextChange]);

  const handleProfileSelect = (profile) => {
    onSelectedProfileIdChange(profile.profile_id);
    onCvTemplateIdChange(profile.template_id || "awesomecv");
    onResumeTextChange(profile.audit?.raw_resume_text || "");
  };

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
          <div className="cv-profile-table-wrap">
            <table className="cv-profile-table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Template</th>
                  <th>Revision</th>
                  <th>Updated</th>
                  <th>Sections</th>
                </tr>
              </thead>
              <tbody>
                {cvProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <p className="helper">No profiles found. Create one from CV text.</p>
                    </td>
                  </tr>
                ) : (
                  cvProfiles.map((profile) => {
                    const sectionStats = getSectionStats(profile);
                    const isSelected = selectedProfileId === profile.profile_id;
                    return (
                      <tr key={profile.profile_id} className={isSelected ? "is-selected" : ""}>
                        <td>
                          <button
                            type="button"
                            className="cv-profile-select"
                            onClick={() => handleProfileSelect(profile)}
                          >
                            {profile.profile_id}
                          </button>
                        </td>
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

          <label htmlFor="loadedProfileCvText" className="label">CV text for selected profile (optional edits)</label>
          <textarea
            id="loadedProfileCvText"
            rows={8}
            placeholder="Select a profile to load its stored CV text here..."
            value={resumeText}
            onChange={(e) => onResumeTextChange(e.target.value)}
          />

          <div className="cv-entry-actions">
            <button
              type="button"
              className="secondary"
              onClick={onLoadProfile}
              disabled={isLoadingProfile || profilesLoading || !selectedProfileId}
            >
              {isLoadingProfile ? "Loading profile..." : "Load selected profile"}
            </button>
            <p className="helper">Template is automatically taken from the selected profile.</p>
          </div>
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
    </div>
  );
}
