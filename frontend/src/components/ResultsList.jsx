export default function ResultsList({ jobs, onSelectJob }) {
  return (
    <div className="results">
      <div className="results-header">
        <h2>Results</h2>
        <span>{jobs.length} jobs</span>
      </div>
      {jobs.length === 0 ? (
        <p className="empty">No jobs found yet.</p>
      ) : (
        <ul className="job-list">
          {jobs.map((job, index) => (
            <li key={`${job.job_url ?? "job"}-${index}`}>
              <div className="job-title">{job.title}</div>
              <div className="job-rank">
                <span className="badge">
                  Match: {job.match_score ?? "pending"}
                </span>
              </div>
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
      )}
    </div>
  );
}
