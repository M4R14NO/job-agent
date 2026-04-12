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
  cvDocType,
  onCvDocTypeChange,
  cvOutputLanguage,
  onCvOutputLanguageChange,
  resumeText,
  onResumeTextChange
}) {
  return (
    <div className="cv-entry">
      <div className="cv-entry-header">
        <div>
          <p className="eyebrow">CV editor</p>
          <h3>Work on an existing profile</h3>
          <p className="helper">Load a saved profile or create a new one from resume text.</p>
        </div>
        <button type="button" className="ghost" onClick={onRefreshProfiles} disabled={profilesLoading}>
          {profilesLoading ? "Refreshing..." : "Refresh profiles"}
        </button>
      </div>

      <div className="field-grid">
        <div>
          <label htmlFor="profileSelect" className="label">Profile</label>
          <select
            id="profileSelect"
            value={selectedProfileId}
            onChange={(e) => onSelectedProfileIdChange(e.target.value)}
            disabled={profilesLoading || !cvProfiles.length}
          >
            {!cvProfiles.length && <option value="">No profiles found</option>}
            {cvProfiles.map((profile) => (
              <option key={profile.profile_id} value={profile.profile_id}>
                {profile.profile_id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cvTemplateEntry" className="label">Template</label>
          <select
            id="cvTemplateEntry"
            value={cvTemplateId}
            onChange={(e) => onCvTemplateIdChange(e.target.value)}
          >
            <option value="awesomecv">AwesomeCV</option>
          </select>
        </div>
        <div>
          <label htmlFor="cvDocTypeEntry" className="label">Document type</label>
          <select
            id="cvDocTypeEntry"
            value={cvDocType}
            onChange={(e) => onCvDocTypeChange(e.target.value)}
          >
            <option value="resume">Resume</option>
            <option value="cv">CV</option>
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

      <label htmlFor="resumeCv" className="label">Resume text</label>
      <textarea
        id="resumeCv"
        rows={10}
        placeholder="Paste plain text from your resume here..."
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
          {isLoadingProfile ? "Loading profile..." : "Load profile"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onCreateCvFromResume}
          disabled={isCreatingCv || !resumeText.trim()}
        >
          {isCreatingCv ? "Parsing resume..." : "Create from resume text"}
        </button>
        <p className="helper">Resume text is only required when creating a new profile.</p>
      </div>

      {profilesError && <p className="error">{profilesError}</p>}
      {cvEntryError && <p className="error">{cvEntryError}</p>}
    </div>
  );
}
