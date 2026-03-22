export default function JobModal({ job, descriptionHtml, onClose }) {
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Job detail</p>
            <h2>{job.title}</h2>
            <p className="subtitle">{job.company}</p>
          </div>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>

        <div className="modal-meta">
          <span>{job.location}</span>
          <span>{job.site}</span>
          <span>{job.date_posted}</span>
        </div>

        <div className="modal-rank">
          <div className="rank-header">
            <h3>Match score</h3>
            <span className="badge">{job.match_score ?? "pending"}</span>
          </div>
          <p className="rank-note">
            {job.match_reasons?.length
              ? "Top matched keywords"
              : "Ranking will appear once the scoring logic is enabled."}
          </p>
          {job.match_reasons?.length ? (
            <div className="reason-list">
              {job.match_reasons.map((reason) => (
                <span key={reason} className="reason-chip">{reason}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="modal-body">
          <h3>Description</h3>
          {descriptionHtml ? (
            <div
              className="description-content"
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
            />
          ) : (
            <p>No description available.</p>
          )}
        </div>

        <div className="modal-actions">
          {job.job_url && (
            <a
              className="job-link"
              href={job.job_url}
              target="_blank"
              rel="noreferrer"
            >
              Open original posting
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
