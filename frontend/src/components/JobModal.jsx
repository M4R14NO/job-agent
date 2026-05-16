import { Spinner } from "@chakra-ui/react";
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
  onResumeTextChange,
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
  const [outputLanguage, setOutputLanguage] = useState("english");
  const [coverOutputLanguage, setCoverOutputLanguage] = useState(outputLanguage);
  const [cvSourceText, setCvSourceText] = useState(resumeText);

  useEffect(() => {
    setCoverLetter("");
    setCoverError("");
    setIsGenerating(false);
    setCvError("");
    setIsGeneratingCv(false);
    setCoverOutputLanguage(outputLanguage);
  }, [job]);

  useEffect(() => {
    setCvSourceText(resumeText);
  }, [resumeText, job]);

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
    if (!cvSourceText.trim()) {
      setCvError("Resume source text is required to generate a CV.");
      return;
    }
    setIsGeneratingCv(true);
    setCvError("");
    try {
      const canonical = await parseCvCanonical({
        resume_text: cvSourceText,
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
        docType: "resume",
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
              {isGeneratingCv ? "Filling CV..." : "Create CV"}
            </button>
          </div>
          <p className="helper">
            Edit the resume source text below. This exact text is used as the AI input to populate your CV sections.
          </p>
          <div className="action-panel-cv-content">
            <div className="action-panel-cv-form">
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
              <label htmlFor="cvSourceText" className="label">Resume source text</label>
              <textarea
                id="cvSourceText"
                rows={12}
                placeholder="Paste plain text from your resume here..."
                value={cvSourceText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setCvSourceText(nextValue);
                  onResumeTextChange?.(nextValue);
                }}
              />
            </div>
            <div className="cv-sample-preview">
              <p className="label">Sample CV preview</p>
              <img
                src="https://github.com/user-attachments/assets/cfcb6279-b8e8-44d2-a164-22b12ef2569e"
                alt="Sample CV layout preview"
                loading="lazy"
              />
            </div>
          </div>
          {isGeneratingCv && (
            <div className="results-loading">
              <Spinner size="sm" color="blue.500" />
              <span>Filling your CV with AI. This can take a minute.</span>
            </div>
          )}
          {cvError && <p className="error">{cvError}</p>}
        </div>
      ) : null}
    </div>
  );
}
