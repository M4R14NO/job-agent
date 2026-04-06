const SITES = [
  { id: "indeed", label: "Indeed" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "google", label: "Google" }
];

export default function SearchFilters({
  searchTerm, onSearchTermChange,
  location, onLocationChange,
  resultsWanted, onResultsWantedChange,
  hoursOld, onHoursOldChange,
  isRemote, onIsRemoteChange,
  sites, onSitesChange,
  fetchFullDescriptions, onFetchFullDescriptionsChange,
  resumeText, onResumeTextChange,
  wishes, onWishesChange,
  models,
  selectedModel,
  onSelectedModelChange,
  lmTimeout,
  onLmTimeoutChange,
  modelError,
  enableRerank,
  onEnableRerankChange,
  rerankTopN,
  onRerankTopNChange,
  defaultRerankTopN,
  cachedAvailable,
  cachedAt,
  onLoadCache,
  onClearCache,
  isLoading,
  error,
  onSearch,
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
  onCvOutputLanguageChange
}) {
  function handleSiteToggle(id, checked) {
    onSitesChange(
      checked ? [...sites, id] : sites.filter((s) => s !== id)
    );
  }

  return (
    <>
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

      <div className="field-grid">
        <div>
          <label htmlFor="searchTerm" className="label">Search term</label>
          <input
            id="searchTerm"
            placeholder="e.g. backend engineer"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="location" className="label">Location</label>
          <input
            id="location"
            placeholder="e.g. Berlin"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="results" className="label">Results wanted</label>
          <input
            id="results"
            type="number"
            min={1}
            max={50}
            value={resultsWanted}
            onChange={(e) => onResultsWantedChange(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="hoursOld" className="label">Hours old</label>
          <input
            id="hoursOld"
            type="number"
            min={1}
            max={720}
            value={hoursOld}
            onChange={(e) => onHoursOldChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="filters">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={isRemote}
            onChange={(e) => onIsRemoteChange(e.target.checked)}
          />
          Remote only
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={fetchFullDescriptions}
            onChange={(e) => onFetchFullDescriptionsChange(e.target.checked)}
          />
          Fetch full descriptions (slower)
        </label>
        <div className="site-group">
          <span className="label">Sites</span>
          <div className="site-options">
            {SITES.map((site) => (
              <label key={site.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={sites.includes(site.id)}
                  onChange={(e) => handleSiteToggle(site.id, e.target.checked)}
                />
                {site.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="model" className="label">LLM model</label>
        <select
          id="model"
          value={selectedModel}
          onChange={(e) => onSelectedModelChange(e.target.value)}
          disabled={!models.length}
        >
          {!models.length && <option value="">No models available</option>}
          {models.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
        {modelError && <p className="error">{modelError}</p>}
      </div>

      <div className="rerank-controls">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={enableRerank}
            onChange={(e) => onEnableRerankChange(e.target.checked)}
          />
          Enable LLM rerank
        </label>
        {enableRerank && (
          <div>
            <label htmlFor="rerankTopN" className="label">Rerank top K</label>
            <input
              id="rerankTopN"
              type="number"
              min={1}
              max={50}
              placeholder="Auto"
              value={rerankTopN ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  onRerankTopNChange(null);
                  return;
                }
                onRerankTopNChange(Number(value));
              }}
            />
            <p className="helper">
              Auto default: {defaultRerankTopN ?? "-"} (40% of results, min 3)
            </p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="lmTimeout" className="label">LLM timeout (seconds)</label>
        <input
          id="lmTimeout"
          type="number"
          min={5}
          max={300}
          value={lmTimeout}
          onChange={(e) => onLmTimeoutChange(Number(e.target.value))}
        />
        <p className="helper">Use higher values for slower local models.</p>
      </div>

      <label htmlFor="resume" className="label">Resume text</label>
      <textarea
        id="resume"
        rows={10}
        placeholder="Paste plain text from your resume here..."
        value={resumeText}
        onChange={(e) => onResumeTextChange(e.target.value)}
      />

      <label htmlFor="wishes" className="label">Job wishes (optional)</label>
      <textarea
        id="wishes"
        rows={4}
        placeholder="Preferred titles, skills, industries, or constraints..."
        value={wishes}
        onChange={(e) => onWishesChange(e.target.value)}
      />

      <button
        className="primary"
        disabled={!resumeText.trim() || isLoading}
        onClick={onSearch}
      >
        {isLoading ? "Running..." : "Run search"}
      </button>

      {cachedAvailable && (
        <div className="cache-actions">
          <button className="secondary" onClick={onLoadCache}>
            Use cached results
          </button>
          <button className="secondary" onClick={onClearCache}>
            Clear cache
          </button>
          {cachedAt && (
            <span className="cache-note">Cached at {new Date(cachedAt).toLocaleString()}</span>
          )}
        </div>
      )}

      {isLoading && (
        <p className="progress">
          Searching job boards. This can take a minute, especially for
          LinkedIn or Google.
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
