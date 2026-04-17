import { useEffect, useState } from "react";
import { generateCoverLetter, parseCvCanonical } from "../api/llm";

export function JobDetailsCard({ job, descriptionHtml }) {
  return (
    <div className="panel-card job-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Job detail</p>
          <h2>{job.title}</h2>
          <p className="subtitle">{job.company}</p>
        </div>
      </div>

      <div className="modal-meta">
        <span>{job.location}</span>
        <span>{job.site}</span>
        <span>{job.date_posted}</span>
      </div>

      <div className="modal-rank">
        <div className="rank-header">
          <h3>Match score</h3>
          <div className="rank-badges">
            <span className="badge">{job.match_score ?? "pending"}</span>
            {job.rerank_score != null && (
              <span className="badge badge-alt">Rerank: {job.rerank_score}</span>
            )}
          </div>
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
        {job.rerank_score != null && job.match_reasons?.[0] ? (
          <p className="helper">Rerank reason: {job.match_reasons[0]}</p>
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
  );
}

export function JobActionsCard({
  mode,
  job,
  resumeText,
  selectedModel,
  lmTimeout,
  onStartCvReview
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [coverError, setCoverError] = useState("");
  const [isGeneratingCv, setIsGeneratingCv] = useState(false);
  const [cvError, setCvError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("awesomecv");
  const [selectedDocType, setSelectedDocType] = useState("resume");
  const [outputLanguage, setOutputLanguage] = useState("english");
  const [coverOutputLanguage, setCoverOutputLanguage] = useState(outputLanguage);

  useEffect(() => {
    setCoverLetter("");
    setCoverError("");
    setIsGenerating(false);
    setCvError("");
    setIsGeneratingCv(false);
    setCoverOutputLanguage(outputLanguage);
  }, [job]);

  const handleGenerate = async () => {
    if (!selectedModel) {
      setCoverError("Select a model to generate a cover letter.");
      return;
    }
    setIsGenerating(true);
    setCoverError("");
    try {
      const draft = await generateCoverLetter({
        resume_text: resumeText,
        job_title: job.title,
        company: job.company,
        job_description: job.description,
        job_url: job.job_url,
        model: selectedModel,
        lm_timeout: lmTimeout,
        output_language: coverOutputLanguage
      });
      setCoverLetter(draft);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCv = async () => {
    if (!selectedModel) {
      setCvError("Select a model to generate a CV.");
      return;
    }
    setIsGeneratingCv(true);
    setCvError("");
    try {
      const canonical = await parseCvCanonical({
        resume_text: resumeText,
        model: selectedModel,
        lm_timeout: lmTimeout,
        output_language: outputLanguage,
        job_title: job.title,
        company: job.company,
        job_description: job.description,
        job_url: job.job_url
      });
      onStartCvReview({
        canonical,
        job,
        templateId: selectedTemplate,
        docType: selectedDocType,
        outputLanguage
      });
    } catch (err) {
      setCvError(err instanceof Error ? err.message : "Failed to generate CV");
    } finally {
      setIsGeneratingCv(false);
    }
  };

  if (!mode || mode === "none") {
    return null;
  }

  const showCoverOutput = Boolean(coverLetter) || isGenerating || coverError;

  return (
    <div className="panel-card job-actions">
      {mode === "cover" ? (
        <div className="action-panel action-panel-cover">
          <div className="rank-header">
            <h3>Cover letter</h3>
            <div className="cover-controls">
              <div className="cover-language">
                <label htmlFor="coverLanguage" className="label">Language</label>
                <select
                  id="coverLanguage"
                  value={coverOutputLanguage}
                  onChange={(e) => setCoverOutputLanguage(e.target.value)}
                >
                  <option value="english">English</option>
                  <option value="german">German</option>
                </select>
              </div>
              <button className="secondary" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Drafting..." : "Generate"}
              </button>
            </div>
          </div>
          <p className="helper">
            Uses the same LLM settings as the refinement flow for a tailored draft.
          </p>
          {isGenerating && (
            <p className="progress">Generating cover letter with the selected model...</p>
          )}
          {coverError && <p className="error">{coverError}</p>}
          {showCoverOutput && (
            <textarea
              readOnly
              value={coverLetter}
              placeholder="Generate a tailored cover letter draft..."
            />
          )}
        </div>
      ) : null}

      {mode === "cv" ? (
        <div className="action-panel action-panel-cv">
          <div className="rank-header">
            <h3>CV generation</h3>
            <button className="secondary" onClick={handleGenerateCv} disabled={isGeneratingCv}>
              {isGeneratingCv ? "Extracting..." : "Create CV"}
            </button>
          </div>
          <p className="helper">Uses the LLM to parse your resume text into editable CV data.</p>
          <div className="cv-options">
            <div>
              <label htmlFor="cvTemplate" className="label">Template</label>
              <select
                id="cvTemplate"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="awesomecv">AwesomeCV</option>
              </select>
            </div>
            <div>
              <label htmlFor="docType" className="label">Document type</label>
              <select
                id="docType"
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
              >
                <option value="resume">Resume</option>
                <option value="cv">CV</option>
              </select>
            </div>
            <div>
              <label htmlFor="outputLanguage" className="label">Output language</label>
              <select
                id="outputLanguage"
                value={outputLanguage}
                onChange={(e) => setOutputLanguage(e.target.value)}
              >
                <option value="english">English</option>
                <option value="german">German</option>
              </select>
            </div>
          </div>
          {isGeneratingCv && (
            <p className="progress">Extracting canonical CV data...</p>
          )}
          {cvError && <p className="error">{cvError}</p>}
        </div>
      ) : null}
    </div>
  );
}
