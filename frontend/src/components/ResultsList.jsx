import { Progress, Spinner } from "@chakra-ui/react";

export default function ResultsList({
  jobs,
  rerankApplied,
  rerankTopN,
  onSelectJob,
  isLoading,
  hasResponse,
  refinementProgress
}) {
  const showResultsEmpty = hasResponse && jobs.length === 0 && !isLoading;
  const showPrompt = !hasResponse && !isLoading;

  return (
    <div className="results">
      <div className="results-header">
        <h2>Results</h2>
        <span>{jobs.length} jobs</span>
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
          <Progress value={refinementProgress.percent} size="sm" colorScheme="blue" />
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
          {jobs.map((job, index) => (
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
          ))}
        </ul>
      ) : null}
    </div>
  );
}
