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
  isLoading,
  error,
  onSearch
}) {
  function handleSiteToggle(id, checked) {
    onSitesChange(
      checked ? [...sites, id] : sites.filter((s) => s !== id)
    );
  }

  return (
    <>
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
