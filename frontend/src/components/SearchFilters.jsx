import { useState } from "react";

const SITES = [
  { id: "indeed", label: "Indeed" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "google", label: "Google" }
];

const TIME_FILTERS = [
  { label: "Last day", value: 24 },
  { label: "Last 3 days", value: 72 },
  { label: "Last week", value: 168 },
  { label: "Last 2 weeks", value: 336 },
  { label: "Last month", value: 720 }
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
  lmTimeoutMinutes,
  onLmTimeoutChange,
  modelError,
  enableRerank,
  onEnableRerankChange,
  rerankTopN,
  onRerankTopNChange,
  defaultRerankTopN,
  llmProfiles,
  selectedLlmProfileId,
  onSelectedLlmProfileIdChange,
  llmProfileName,
  onLlmProfileNameChange,
  onSaveLlmProfile,
  onLoadLlmProfile,
  onDeleteLlmProfile,
  llmProfileError,
  cachedAvailable,
  cachedAt,
  onLoadCache,
  onClearCache,
  isLoading,
  error,
  onSearch
}) {
  const [showExample, setShowExample] = useState(false);

  function handleSiteToggle(id, checked) {
    onSitesChange(
      checked ? [...sites, id] : sites.filter((s) => s !== id)
    );
  }

  const isSearchDisabled = isLoading;
  const needsResume = enableRerank && !resumeText.trim();

  const exampleText = `PROFILE
Name: Ada Lovelace
Headline: Backend engineer, distributed systems
Summary: 6+ years building APIs in Go and Python.

EXPERIENCE
2021-03 to Present | Staff Backend Engineer | ExampleCo
- Led migration to event-driven architecture
- Reduced p95 latency from 900ms to 220ms

SKILLS
- Go, Python, Postgres, Kafka, AWS
`;

  const handleLmTimeoutMinutesChange = (valueString, valueNumber) => {
    const nextMinutes = Number.isFinite(valueNumber) ? valueNumber : 0;
    const clamped = Math.min(Math.max(nextMinutes, 0.5), 10);
    onLmTimeoutChange(Math.round(clamped * 60));
  };

  return (
    <>
      <div className="sidebar-section">
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
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={isRemote}
            onChange={(e) => onIsRemoteChange(e.target.checked)}
          />
          Remote only
        </label>
      </div>

      <div className="filters-accordion">
        <details className="accordion-item">
          <summary className="accordion-button">
            <span>Search Options</span>
            <span className="accordion-chevron">▾</span>
          </summary>
          <div className="accordion-panel">
            <div className="filters">
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
                <label htmlFor="hoursOld" className="label">Time filter</label>
                <select
                  id="hoursOld"
                  value={String(hoursOld)}
                  onChange={(e) => onHoursOldChange(Number(e.target.value))}
                >
                  {TIME_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="site-group">
                <span className="label">Sites</span>
                <div className="site-options">
                  {SITES.map((site) => (
                    <label key={site.id} className="checkbox small">
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
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={fetchFullDescriptions}
                  onChange={(e) => onFetchFullDescriptionsChange(e.target.checked)}
                />
                Fetch full descriptions (slower)
              </label>
              <button
                className="secondary"
                disabled={isSearchDisabled}
                onClick={onSearch}
              >
                Apply search options
              </button>
            </div>
          </div>
        </details>

        <details className="accordion-item">
          <summary className="accordion-button">
            <span>LLM search refinement</span>
            <span className="accordion-chevron">▾</span>
          </summary>
          <div className="accordion-panel">
            <div className="filters">
              <div>
                <label htmlFor="wishes" className="label">Job wishes</label>
                <textarea
                  id="wishes"
                  rows={4}
                  placeholder="e.g. mission-driven teams, no on-call, EU time zones, climate tech"
                  value={wishes}
                  onChange={(e) => onWishesChange(e.target.value)}
                />
                <p className="helper">
                  Uses your preferences to bias the LLM rerank toward culture, industry, and constraints.
                </p>
              </div>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={enableRerank}
                  onChange={(e) => onEnableRerankChange(e.target.checked)}
                />
                Enable LLM rerank
              </label>
              <p className="helper">
                Reorders the top results using your resume context and wishes.
              </p>

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

              <div>
                <label htmlFor="resume" className="label">Resume / CV text</label>
                <textarea
                  id="resume"
                  rows={10}
                  placeholder="Paste plain text from your resume here..."
                  value={resumeText}
                  onChange={(e) => onResumeTextChange(e.target.value)}
                />
                <p className="helper">
                  Include dates and time spans so the model can ground experiences.
                </p>
                {needsResume && <p className="error">Resume text is required to apply refinement.</p>}
              </div>

              <button
                className="ghost"
                onClick={() => setShowExample((prev) => !prev)}
                type="button"
              >
                {showExample ? "Hide example text" : "Show example text"}
              </button>
              {showExample && (
                <pre className="example-box">{exampleText}</pre>
              )}

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

              <div>
                <label htmlFor="lmTimeout" className="label">LLM timeout (minutes)</label>
                <input
                  id="lmTimeout"
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={lmTimeoutMinutes}
                  onChange={(e) => handleLmTimeoutMinutesChange(e.target.value, Number(e.target.value))}
                />
                <p className="helper">Default 2 minutes for most local models.</p>
              </div>

              <div className="profile-block">
                <label className="label">Named refinement profiles</label>
                <div className="filters">
                  <select
                    value={selectedLlmProfileId}
                    onChange={(e) => onSelectedLlmProfileIdChange(e.target.value)}
                  >
                    <option value="">Select a profile</option>
                    {llmProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Profile name"
                    value={llmProfileName}
                    onChange={(e) => onLlmProfileNameChange(e.target.value)}
                  />
                  <div className="profile-actions">
                    <button className="secondary" onClick={onSaveLlmProfile} type="button">
                      Save
                    </button>
                    <button className="secondary" onClick={() => onLoadLlmProfile()} type="button">
                      Load
                    </button>
                    <button className="secondary" onClick={onDeleteLlmProfile} type="button">
                      Delete
                    </button>
                  </div>
                  {llmProfileError && <p className="error">{llmProfileError}</p>}
                  <p className="helper">Saved locally in this browser.</p>
                </div>
              </div>

              <button
                className="secondary"
                disabled={isSearchDisabled || needsResume}
                onClick={onSearch}
              >
                Apply refinement
              </button>
            </div>
          </div>
        </details>
      </div>

      <button
        className="primary sidebar-primary"
        disabled={isSearchDisabled || needsResume}
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

      {error && <p className="error">{error}</p>}
    </>
  );
}
