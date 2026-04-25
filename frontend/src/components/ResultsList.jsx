import { Progress, Spinner } from "@chakra-ui/react";

const DATE_FILTER_OPTIONS = [
  { label: "Past 24 hours", value: 1 },
  { label: "Past 3 days", value: 3 },
  { label: "Past 7 days", value: 7 },
  { label: "Past 14 days", value: 14 },
  { label: "Past 30 days", value: 30 }
];

const SORT_OPTIONS = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Distance (nearest)", value: "distance" }
];

const MILES_TO_KM = 1.60934;

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDistanceKm = (job) => {
  if (!job) return null;
  const kmValue = toFiniteNumber(
    job.distance_km ?? job.distanceKm ?? job.distance_kilometers ?? job.distance_kilometres
  );
  if (kmValue != null) return kmValue;

  const milesValue = toFiniteNumber(job.distance_miles ?? job.distanceMiles ?? job.distance_mi);
  if (milesValue != null) return milesValue * MILES_TO_KM;

  if (typeof job.distance === "string") {
    const match = job.distance.match(/([\d.]+)\s*(km|kilometers?|mi|miles?)/i);
    if (match) {
      const value = Number(match[1]);
      if (!Number.isNaN(value)) {
        return match[2].toLowerCase().startsWith("km") ? value : value * MILES_TO_KM;
      }
    }
  }

  const distanceValue = toFiniteNumber(job.distance ?? job.distance_value ?? job.distanceValue);
  if (distanceValue == null) return null;
  const unit = typeof job.distance_unit === "string" ? job.distance_unit.toLowerCase() : "";
  if (unit.startsWith("km") || unit.startsWith("kilometer")) return distanceValue;
  return distanceValue * MILES_TO_KM;
};

const formatDistanceLabel = (job) => {
  const distanceKm = parseDistanceKm(job);
  if (distanceKm == null) return "";
  const rounded = distanceKm < 10 ? Math.round(distanceKm * 10) / 10 : Math.round(distanceKm);
  return `${rounded} km away`;
};

const formatPostedDateLabel = (value) => {
  if (!value) return "";
  if (value instanceof Date) {
    return `Posted ${value.toLocaleDateString()}`;
  }
  if (typeof value === "number") {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? "" : `Posted ${date.toLocaleDateString()}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return `Posted ${new Date(parsed).toLocaleDateString()}`;
    }
    return `Posted ${trimmed}`;
  }
  return "";
};

export default function ResultsList({
  jobs,
  rerankApplied,
  rerankTopN,
  onSelectJob,
  isLoading,
  hasResponse,
  refinementProgress,
  clientDateFilterDays,
  sortBy,
  onClientDateFilterChange,
  onSortChange,
  onClearClientDateFilter
}) {
  const showResultsEmpty = hasResponse && jobs.length === 0 && !isLoading;
  const showPrompt = !hasResponse && !isLoading;
  const hasDateFilter = clientDateFilterDays != null;

  const handleDateFilterChange = (event) => {
    const rawValue = event.target.value;
    if (!rawValue) {
      onClientDateFilterChange(null);
      return;
    }
    const parsed = Number(rawValue);
    onClientDateFilterChange(Number.isFinite(parsed) ? parsed : null);
  };

  return (
    <div className="results">
      <div className="results-header">
        <div className="results-header-info">
          <h2>Results</h2>
          <span>{jobs.length} jobs</span>
        </div>
        <div className="results-controls">
          <label className="results-control">
            <span>Date filter</span>
            <select value={clientDateFilterDays ?? ""} onChange={handleDateFilterChange}>
              <option value="">All dates</option>
              {DATE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="results-control">
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => onSortChange(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {hasDateFilter && (
            <button type="button" className="results-clear" onClick={onClearClientDateFilter}>
              Clear date filter
            </button>
          )}
        </div>
      </div>
      {isLoading && (
        <div className="results-loading">
          <Spinner size="sm" color="blue.500" />
          <span>Searching job boards. This can take a minute.</span>
        </div>
      )}
      {refinementProgress && (
        <div className="refinement-progress">
          <div className="progress-header">
            <span>LLM refinement</span>
            <span>
              Tokens {refinementProgress.currentTokens} / {refinementProgress.totalTokens} (est.)
            </span>
          </div>
          <Progress.Root value={refinementProgress.percent} size="sm" colorPalette="blue">
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <p className="helper">
            {refinementProgress.elapsedSeconds}s / {refinementProgress.timeoutSeconds}s elapsed
          </p>
        </div>
      )}
      {rerankApplied && rerankTopN ? (
        <p className="helper">LLM rerank applied to top {rerankTopN} results.</p>
      ) : null}
      {showPrompt && <p className="helper">Run a search to see results.</p>}
      {showResultsEmpty ? (
        <p className="empty">No jobs found yet.</p>
      ) : jobs.length > 0 ? (
        <ul className="job-list">
          {jobs.map((job, index) => {
            const postedLabel = formatPostedDateLabel(job.date_posted);
            const distanceLabel = formatDistanceLabel(job);
            return (
              <li key={`${job.job_url ?? "job"}-${index}`}>
              <div className="job-title">{job.title}</div>
              <div className="job-rank">
                <span className="badge">
                  Match: {job.match_score ?? "pending"}
                </span>
                {job.rerank_score != null && (
                  <span className="badge badge-alt">Rerank: {job.rerank_score}</span>
                )}
              </div>
              {job.rerank_score != null && job.match_reasons?.[0] ? (
                <p className="helper">Rerank reason: {job.match_reasons[0]}</p>
              ) : null}
              <div className="job-meta">
                <span>{job.company}</span>
                <span>{job.location}</span>
                <span>{job.site}</span>
              </div>
              {(postedLabel || distanceLabel) && (
                <div className="job-submeta">
                  {postedLabel && <span>{postedLabel}</span>}
                  {distanceLabel && <span>{distanceLabel}</span>}
                </div>
              )}
              <div className="job-actions">
                <button
                  className="secondary"
                  onClick={() => onSelectJob(job)}
                >
                  View details
                </button>
                {job.job_url && (
                  <a
                    className="job-link"
                    href={job.job_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View posting
                  </a>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
