export default function JobStep({ applicationContext, onApplicationContextChange }) {
  return (
    <div className="cv-step-content">
      <div className="cv-step-grid">
        <div>
          <label htmlFor="cvNewbieJobTitle" className="label">Job title (optional)</label>
          <input
            id="cvNewbieJobTitle"
            value={applicationContext.job_title || ""}
            onChange={(event) =>
              onApplicationContextChange((prev) => ({ ...prev, job_title: event.target.value }))
            }
          />
        </div>
        <div>
          <label htmlFor="cvNewbieCompany" className="label">Company (optional)</label>
          <input
            id="cvNewbieCompany"
            value={applicationContext.company || ""}
            onChange={(event) =>
              onApplicationContextChange((prev) => ({ ...prev, company: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="cv-step-field">
        <label htmlFor="cvNewbieJobDesc" className="label">Job description (optional)</label>
        <textarea
          id="cvNewbieJobDesc"
          rows={8}
          value={applicationContext.job_description || ""}
          onChange={(event) =>
            onApplicationContextChange((prev) => ({ ...prev, job_description: event.target.value }))
          }
          placeholder="Paste the job description to tailor keywords and summary."
        />
      </div>
      <div className="cv-step-field">
        <label htmlFor="cvNewbieJobUrl" className="label">Job URL (optional)</label>
        <input
          id="cvNewbieJobUrl"
          value={applicationContext.job_url || ""}
          onChange={(event) =>
            onApplicationContextChange((prev) => ({ ...prev, job_url: event.target.value }))
          }
          placeholder="https://..."
        />
      </div>
    </div>
  );
}
