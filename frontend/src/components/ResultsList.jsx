import { Progress, Spinner } from "@chakra-ui/react";

const RERANK_REASON_EXPLANATIONS = {
  rag: "Strong alignment with retrieval-augmented generation experience and related tooling.",
  llm: "Strong alignment with large language model experience and responsibilities.",
  mlops: "Strong alignment with machine-learning operations, deployment, and production workflows.",
  nlp: "Strong alignment with natural language processing skills and project experience.",
  python: "Strong alignment with Python-based engineering requirements.",
};

const formatRerankReason = (reason) => {
  const raw = String(reason || "").trim();
  if (!raw) return "";

  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  if (RERANK_REASON_EXPLANATIONS[normalized]) {
    return RERANK_REASON_EXPLANATIONS[normalized];
  }

  if (raw.length <= 3) {
    return `Matched on ${raw.toUpperCase()}-related requirements in the job description.`;
  }

  return raw;
};

export default function ResultsList({
  jobs,
  rerankRequested,
  rerankApplied,
  rerankTopN,
  rerankSkipReason,
  queryProfileId,
  bm25Query,
  bm25Language,
  bm25Tokenizer,
  searchPhaseMessage,
  onSelectJob,
  isLoading,
  hasResponse,
  refinementProgress
}) {
  const showResultsEmpty = hasResponse && jobs.length === 0 && !isLoading;
  const showPrompt = !hasResponse && !isLoading;
  const sortedJobs = jobs
    .map((job, index) => ({ job, index }))
    .sort((left, right) => {
      const leftPrimary = typeof left.job.rerank_score === "number"
        ? left.job.rerank_score
        : (typeof left.job.match_score === "number" ? left.job.match_score : -1);
      const rightPrimary = typeof right.job.rerank_score === "number"
        ? right.job.rerank_score
        : (typeof right.job.match_score === "number" ? right.job.match_score : -1);

      if (rightPrimary !== leftPrimary) {
        return rightPrimary - leftPrimary;
      }

      const leftSecondary = typeof left.job.match_score === "number" ? left.job.match_score : -1;
      const rightSecondary = typeof right.job.match_score === "number" ? right.job.match_score : -1;
      if (rightSecondary !== leftSecondary) {
        return rightSecondary - leftSecondary;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.job);

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
            <span>AI job matching</span>
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
        <p className="helper">AI ranking applied to top {rerankTopN} results.</p>
      ) : null}
      {rerankRequested && !rerankApplied ? (
        <p className="helper rerank-status-badge rerank-status-badge-warning">
          AI ranking requested but skipped{rerankSkipReason ? `: ${rerankSkipReason}` : "."}
        </p>
      ) : null}
      {hasResponse ? (
        <details className="advanced-options bm25-debug-panel">
          <summary className="advanced-summary">Candidate query debug (BM25)</summary>
          <div className="bm25-debug-content">
            <p className="helper">
              Query used to score and shortlist jobs before final AI ranking.
            </p>
            <p className="helper">
              Query context profile: {queryProfileId || "none"}
            </p>
            <p className="helper">
              Preprocessing: language={bm25Language || "n/a"}, tokenizer={bm25Tokenizer || "n/a"}
            </p>
            <pre className="bm25-query-box">{bm25Query || "No BM25 query generated for this search."}</pre>
          </div>
        </details>
      ) : null}
      {showPrompt && <p className="helper">Run a search to see results.</p>}
      {showResultsEmpty ? (
        <p className="empty">No jobs found yet.</p>
      ) : sortedJobs.length > 0 ? (
        <ul className="job-list">
          {sortedJobs.map((job, index) => {
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
              {job.rerank_score != null && job.match_reasons?.[0] ? (() => {
                const rawReason = String(job.match_reasons[0] || "").trim();
                const explanation = formatRerankReason(rawReason);
                return (
                  <p className="helper" title={rawReason ? `Raw reason: ${rawReason}` : undefined}>
                    Rerank reason: {explanation}
                  </p>
                );
              })() : null}
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
