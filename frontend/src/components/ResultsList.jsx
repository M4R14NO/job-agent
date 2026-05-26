import { Progress, Spinner } from "@chakra-ui/react";

export default function ResultsList({
  jobs,
  rerankRequested,
  rerankApplied,
  rerankTopN,
  rerankSkipReason,
  searchPhaseMessage,
  onSelectJob,
  isLoading,
  hasResponse,
  refinementProgress
}) {
  const showResultsEmpty = hasResponse && jobs.length === 0 && !isLoading;
  const showPrompt = !hasResponse && !isLoading;

  const formatDetailsStatus = (job) => {
    const status = String(job?._detailsStatus || "").trim();
    if (!status || status === "ok" || status === "pending") return null;
    if (status === "not_found") return "details unavailable (not_found)";
    if (status === "timeout") return "details unavailable (timed out)";
    if (status === "http_error") return `details unavailable (${job?._detailsError || "http_error"})`;
    if (status === "skipped_duplicate") return "details unavailable (skipped_duplicate)";
    if (status === "invalid") return "details unavailable (invalid job url)";
    return `details unavailable (${status})`;
  };

  return (
    <div className="results">
      <div className="results-header">
        <h2>Results</h2>
        <span>{jobs.length} jobs</span>
      </div>
      {isLoading && (
        <div className="results-loading">
          <Spinner size="sm" color="blue.500" />
          <span>{searchPhaseMessage || "Searching job boards. This can take a minute."}</span>
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
      {rerankRequested && !rerankApplied ? (
        <p className="helper rerank-status-badge rerank-status-badge-warning">
          Rerank requested but skipped{rerankSkipReason ? `: ${rerankSkipReason}` : "."}
        </p>
      ) : null}
      {showPrompt && <p className="helper">Run a search to see results.</p>}
      {showResultsEmpty ? (
        <p className="empty">No jobs found yet.</p>
      ) : jobs.length > 0 ? (
        <ul className="job-list">
          {jobs.map((job, index) => {
            const hasDetails = (job.description || job.job_description || "").trim().length > 0;

            return (
            <li key={`${job.job_url ?? "job"}-${index}`}>
              <div className="job-title">
                {job.title}
                {job._enrichedAt != null && (
                  <span className="fresh-dot" title="Just enriched with full details" />
                )}
              </div>
              {job.rerank_score != null ? (
                <div className="job-rank">
                  <span className="badge badge-alt">Rerank: {job.rerank_score}</span>
                </div>
              ) : null}
              {job.rerank_score != null && job.match_reasons?.[0] ? (
                <p className="helper">Rerank reason: {job.match_reasons[0]}</p>
              ) : null}
              {!hasDetails && formatDetailsStatus(job) ? (
                <p className="helper details-unavailable">{formatDetailsStatus(job)}</p>
              ) : null}
              <div className="job-meta">
                <span>{job.company}</span>
                <span>{job.location}</span>
                <span>{job.site}</span>
              </div>
              <div className="job-actions">
                {hasDetails ? (
                  <button
                    className="primary btn-sm job-details-btn"
                    onClick={() => onSelectJob(job)}
                  >
                    View details
                  </button>
                ) : null}
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
