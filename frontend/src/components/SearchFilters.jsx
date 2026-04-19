import { useEffect, useMemo, useRef, useState } from "react";
import { Switch, Tooltip } from "@chakra-ui/react";

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

const RECENT_LOCATIONS_KEY = "job-agent:recent-locations";
const RECENT_ROLES_KEY = "job-agent:recent-roles";

const ROLE_SUGGESTIONS = [
  "Software Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "Full Stack Engineer",
  "Data Scientist",
  "ML Engineer",
  "Product Manager",
  "UX Designer",
  "DevOps Engineer",
  "Security Engineer",
  "QA Engineer",
  "Solutions Architect"
];

const LOCATION_GROUPS = [
  {
    label: "Cities",
    items: ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt", "Stuttgart", "Vienna", "Zurich"]
  },
  {
    label: "Regions",
    items: ["Bavaria", "Berlin", "Hesse", "North Rhine-Westphalia", "Baden-Wuerttemberg"]
  },
  {
    label: "Countries",
    items: ["Germany", "Austria", "Switzerland", "Netherlands", "United Kingdom"]
  }
];

export default function SearchFilters({
  searchTerm, onSearchTermChange,
  location, onLocationChange,
  hoursOld, onHoursOldChange,
  isRemote, onIsRemoteChange,
  resultsWanted, onResultsWantedChange,
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
  onClearAll,
  isLoading,
  error,
  onSearch
}) {
  const [showExample, setShowExample] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [recentLocations, setRecentLocations] = useState([]);
  const [recentRoles, setRecentRoles] = useState([]);
  const [postedDays, setPostedDays] = useState(() => (hoursOld ? Math.round(hoursOld / 24) : ""));
  const [isLlmOpen, setIsLlmOpen] = useState(false);
  const barRef = useRef(null);

  function handleSiteToggle(id, checked) {
    onSitesChange(
      checked ? [...sites, id] : sites.filter((s) => s !== id)
    );
  }

  const isSearchDisabled = isLoading;
  const needsResume = false;

  const activeTimeLabel = useMemo(() => {
    const match = TIME_FILTERS.find((option) => option.value === hoursOld);
    if (match) return match.label;
    if (hoursOld) {
      const days = Math.max(1, Math.round(hoursOld / 24));
      return `Last ${days} days`;
    }
    return "Any time";
  }, [hoursOld]);

  const locationGroups = useMemo(() => {
    const groups = [];
    if (recentLocations.length) {
      groups.push({ label: "Recent", items: recentLocations });
    }
    return [...groups, ...LOCATION_GROUPS];
  }, [recentLocations]);

  const roleGroups = useMemo(() => {
    const groups = [];
    if (recentRoles.length) {
      groups.push({ label: "Recent", items: recentRoles });
    }
    groups.push({ label: "Suggested roles", items: ROLE_SUGGESTIONS });
    return groups;
  }, [recentRoles]);

  useEffect(() => {
    const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentLocations(parsed.filter((item) => typeof item === "string"));
      }
    } catch (err) {
      localStorage.removeItem(RECENT_LOCATIONS_KEY);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(RECENT_ROLES_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentRoles(parsed.filter((item) => typeof item === "string"));
      }
    } catch (err) {
      localStorage.removeItem(RECENT_ROLES_KEY);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!barRef.current) return;
      if (!barRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeDropdown !== "date") return;
    if (hoursOld) {
      setPostedDays(Math.round(hoursOld / 24));
    }
  }, [activeDropdown, hoursOld]);

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

  const handleLocationSelect = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onLocationChange(trimmed);
    setActiveDropdown(null);
    setRecentLocations((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 6);
      localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleRoleSelect = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSearchTermChange(trimmed);
    setActiveDropdown(null);
    setRecentRoles((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 6);
      localStorage.setItem(RECENT_ROLES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleDateSelect = (value) => {
    onHoursOldChange(value);
    setActiveDropdown(null);
  };

  const handleSearchKey = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    setActiveDropdown(null);
    onSearch();
  };

  const handleClearAllClick = () => {
    setActiveDropdown(null);
    onClearAll?.();
  };

  return (
    <>
      <div className="search-bar" ref={barRef}>
        <div className={`search-segment has-dropdown ${activeDropdown === "role" ? "is-active" : ""}`}>
          <label className="search-label" htmlFor="searchTerm">Role</label>
          <input
            id="searchTerm"
            placeholder="Search roles, skills, or companies"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            onFocus={() => setActiveDropdown("role")}
            onKeyDown={handleSearchKey}
          />
          {activeDropdown === "role" && (
            <div className="search-dropdown">
              {roleGroups.map((group) => (
                <div key={group.label} className="dropdown-group">
                  <p className="dropdown-label">{group.label}</p>
                  <div className="dropdown-list">
                    {group.items.map((item) => (
                      <button
                        key={`${group.label}-${item}`}
                        type="button"
                        className="dropdown-item"
                        onClick={() => handleRoleSelect(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="search-divider" />
        <div className={`search-segment has-dropdown ${activeDropdown === "location" ? "is-active" : ""}`}>
          <label className="search-label" htmlFor="location">Location</label>
          <input
            id="location"
            placeholder="Add a location"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            onFocus={() => setActiveDropdown("location")}
            onKeyDown={handleSearchKey}
          />
          {activeDropdown === "location" && (
            <div className="search-dropdown">
              {locationGroups.map((group) => (
                <div key={group.label} className="dropdown-group">
                  <p className="dropdown-label">{group.label}</p>
                  <div className="dropdown-list">
                    {group.items.map((item) => (
                      <button
                        key={`${group.label}-${item}`}
                        type="button"
                        className="dropdown-item"
                        onClick={() => handleLocationSelect(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!locationGroups.length && <p className="helper">No locations yet.</p>}
            </div>
          )}
        </div>
        <div className="search-divider" />
        <div className={`search-segment has-dropdown ${activeDropdown === "date" ? "is-active" : ""}`}>
          <label className="search-label">Posted</label>
          <button
            type="button"
            className="search-select"
            onClick={() => setActiveDropdown(activeDropdown === "date" ? null : "date")}
          >
            {activeTimeLabel}
          </button>
          {activeDropdown === "date" && (
            <div className="search-dropdown">
              <div className="dropdown-list">
                {TIME_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="dropdown-item"
                    onClick={() => handleDateSelect(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="dropdown-custom">
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <label className="label" htmlFor="customDays">Custom days</label>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    Enter the number of days to look back.
                  </Tooltip.Content>
                </Tooltip.Root>
                <input
                  id="customDays"
                  type="number"
                  min={1}
                  placeholder="e.g. 5"
                  value={postedDays}
                  onChange={(e) => {
                    const next = e.target.value === "" ? "" : Number(e.target.value);
                    setPostedDays(next);
                    if (!Number.isFinite(next)) return;
                    onHoursOldChange(next * 24);
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="search-divider" />
        <div className="search-segment search-toggle">
          <label className="search-label">Remote</label>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span>
                <Switch.Root
                  checked={isRemote}
                  onCheckedChange={(details) => onIsRemoteChange(details.checked)}
                  colorPalette="orange"
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {isRemote ? "Remote-only jobs enabled" : "Remote-only jobs disabled"}
            </Tooltip.Content>
          </Tooltip.Root>
        </div>
        <div className="search-actions">
          <button type="button" className="ghost" onClick={handleClearAllClick}>
            Clear all
          </button>
          <button className="primary" disabled={isSearchDisabled || needsResume} onClick={onSearch}>
            <span className="button-content">
              {isLoading ? <span className="spinner" aria-hidden="true" /> : null}
              {isLoading ? "Searching..." : "Search"}
            </span>
          </button>
        </div>
      </div>

      <div className={`llm-panel ${isLlmOpen ? "is-open" : ""}`}>
        <button type="button" className="ghost" onClick={() => setIsLlmOpen((prev) => !prev)}>
          {isLlmOpen ? "Hide tailoring" : "Tailor results with CV"}
        </button>
        {isLlmOpen && (
          <div className="llm-panel-body">
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
                Preferences bias the automatic LLM rerank after results are loaded.
              </p>
            </div>
            <div>
              <label htmlFor="resume" className="label">Resume / CV text</label>
              <textarea
                id="resume"
                rows={8}
                placeholder="Paste plain text from your resume here..."
                value={resumeText}
                onChange={(e) => onResumeTextChange(e.target.value)}
              />
              <div className="inline-actions">
                <button type="button" className="secondary" disabled>
                  Upload CV (soon)
                </button>
                <button
                  className="ghost"
                  onClick={() => setShowExample((prev) => !prev)}
                  type="button"
                >
                  {showExample ? "Hide example" : "Show example"}
                </button>
              </div>
              {showExample && (
                <pre className="example-box">{exampleText}</pre>
              )}
            </div>
            <div className="field-grid">
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
            </div>
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
          </div>
        )}
      </div>

      <div className="filters-accordion">
        <details className="accordion-item">
          <summary className="accordion-button">
            <span>Advanced filters</span>
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
            </div>
          </div>
        </details>
      </div>

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
