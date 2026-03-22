import { useState } from "react";

export default function App() {
  const [resumeText, setResumeText] = useState("");
  const [wishes, setWishes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [location, setLocation] = useState("");
  const [resultsWanted, setResultsWanted] = useState(10);
  const [hoursOld, setHoursOld] = useState(72);
  const [isRemote, setIsRemote] = useState(false);
  const [sites, setSites] = useState(["indeed", "linkedin", "google"]);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  const jobs = response?.jobs ?? [];

  const handleSearch = async () => {
    setIsLoading(true);
    setError("");
    setResponse(null);

    try {
      const res = await fetch("http://localhost:8000/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText.trim(),
          wishes: wishes.trim() || null,
          search_term: searchTerm.trim() || null,
          location: location.trim() || null,
          results_wanted: resultsWanted,
          hours_old: hoursOld,
          is_remote: isRemote,
          site_name: sites
        })
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Local-only prototype</p>
          <h1>Job Agent</h1>
          <p className="subtitle">
            Paste your resume text to start a search and ranking flow.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="field-grid">
          <div>
            <label htmlFor="searchTerm" className="label">
              Search term
            </label>
            <input
              id="searchTerm"
              placeholder="e.g. backend engineer"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="location" className="label">
              Location
            </label>
            <input
              id="location"
              placeholder="e.g. Berlin"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="results" className="label">
              Results wanted
            </label>
            <input
              id="results"
              type="number"
              min={1}
              max={50}
              value={resultsWanted}
              onChange={(event) =>
                setResultsWanted(Number(event.target.value))
              }
            />
          </div>
          <div>
            <label htmlFor="hoursOld" className="label">
              Hours old
            </label>
            <input
              id="hoursOld"
              type="number"
              min={1}
              max={720}
              value={hoursOld}
              onChange={(event) => setHoursOld(Number(event.target.value))}
            />
          </div>
        </div>

        <div className="filters">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isRemote}
              onChange={(event) => setIsRemote(event.target.checked)}
            />
            Remote only
          </label>
          <div className="site-group">
            <span className="label">Sites</span>
            <div className="site-options">
              {[
                { id: "indeed", label: "Indeed" },
                { id: "linkedin", label: "LinkedIn" },
                { id: "google", label: "Google" }
              ].map((site) => (
                <label key={site.id} className="checkbox">
                  <input
                    type="checkbox"
                    checked={sites.includes(site.id)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSites((prev) => [...prev, site.id]);
                      } else {
                        setSites((prev) =>
                          prev.filter((value) => value !== site.id)
                        );
                      }
                    }}
                  />
                  {site.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <label htmlFor="resume" className="label">
          Resume text
        </label>
        <textarea
          id="resume"
          rows={10}
          placeholder="Paste plain text from your resume here..."
          value={resumeText}
          onChange={(event) => setResumeText(event.target.value)}
        />
        <label htmlFor="wishes" className="label">
          Job wishes (optional)
        </label>
        <textarea
          id="wishes"
          rows={4}
          placeholder="Preferred titles, skills, industries, or constraints..."
          value={wishes}
          onChange={(event) => setWishes(event.target.value)}
        />

        <button
          className="primary"
          disabled={!resumeText.trim() || isLoading}
          onClick={handleSearch}
        >
          {isLoading ? "Running..." : "Run search"}
        </button>

        {error && <p className="error">{error}</p>}
        {response && (
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
                    <div className="job-title">{job.title ?? "Untitled"}</div>
                    <div className="job-meta">
                      <span>{job.company ?? job.company_name ?? "Unknown"}</span>
                      <span>{job.location ?? ""}</span>
                      <span>{job.site ?? ""}</span>
                    </div>
                    <div className="job-actions">
                      <button
                        className="secondary"
                        onClick={() => setSelectedJob(job)}
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
        )}
      </section>

      {selectedJob && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setSelectedJob(null)} />
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Job detail</p>
                <h2>{selectedJob.title ?? "Untitled"}</h2>
                <p className="subtitle">
                  {selectedJob.company ?? selectedJob.company_name ?? "Unknown"}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => setSelectedJob(null)}
              >
                Close
              </button>
            </div>

            <div className="modal-meta">
              <span>{selectedJob.location ?? ""}</span>
              <span>{selectedJob.site ?? ""}</span>
              <span>{selectedJob.date_posted ?? ""}</span>
            </div>

            <div className="modal-body">
              <h3>Description</h3>
              <p>
                {selectedJob.description
                  ? selectedJob.description.slice(0, 1200)
                  : "No description available."}
              </p>
            </div>

            <div className="modal-actions">
              {selectedJob.job_url && (
                <a
                  className="job-link"
                  href={selectedJob.job_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original posting
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
