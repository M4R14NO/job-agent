import { Spinner } from "@chakra-ui/react";
import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { generateCoverLetter, parseCvCanonical } from "../api/llm";

export function JobDetailsCard({ job, descriptionHtml, collapsible = false, defaultCollapsed = false }) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (collapsible && isCollapsed) {
    return (
      <div className="panel-card job-panel job-panel-collapsed">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Job detail</p>
            <h2>{job.title}</h2>
            <p className="subtitle">{job.company}</p>
          </div>
          <button
            type="button"
            className="ghost icon-button"
            onClick={() => setIsCollapsed(false)}
            aria-label="Expand job detail"
          >
            <span className="icon" aria-hidden="true">▸</span>
            <span>Expand</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-card job-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Job detail</p>
          <h2>{job.title}</h2>
          <p className="subtitle">{job.company}</p>
        </div>
        {collapsible && (
          <button
            type="button"
            className="ghost icon-button"
            onClick={() => setIsCollapsed(true)}
            aria-label="Collapse job detail"
          >
            <span className="icon" aria-hidden="true">▾</span>
            <span>Collapse</span>
          </button>
        )}
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

export function PdfPreviewCard({
  pdfUrl,
  isGenerating,
  isDownloading,
  templateId,
  onTemplateIdChange,
  themeColor,
  onThemeColorChange,
  showProfileImage,
  onShowProfileImageChange,
  onUpdate,
  onDownload,
  disabled = false,
  disabledReason = ""
}) {
  const colorPresets = templateId === "hipstercv"
    ? ["#496E8C", "#2F5D50", "#0F766E", "#374151", "#7C3AED", "#B45309"]
    : ["#C0392B", "#E11D48", "#0F766E", "#2563EB", "#9333EA", "#EA580C"];

  const handleTemplateKeyDown = (event) => {
    if (event.key === "Tab" && !event.shiftKey && !disabled && !isGenerating) {
      event.preventDefault();
      document.getElementById("pdf-update-preview-button")?.focus();
    }
  };

  const handleUpdateKeyDown = (event) => {
    if (event.key === "Tab" && !event.shiftKey && !disabled && !isGenerating) {
      event.preventDefault();
      document.getElementById("pdf-download-button")?.focus();
    }
  };

  return (
    <div className={`panel-card pdf-preview-card${disabled ? " is-disabled" : ""}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">PDF preview</p>
          <h2>Rendered CV</h2>
        </div>
        <div className="pdf-preview-actions">
          <div className="pdf-preview-controls-row">
            {onTemplateIdChange && (
              <div className="pdf-preview-template-control">
                <span className="pdf-preview-template-label">Switch template</span>
                <select
                  id="pdf-preview-template-select"
                  className="pdf-preview-template-select"
                  value={templateId}
                  onChange={(event) => onTemplateIdChange(event.target.value)}
                  aria-label="Template"
                  disabled={disabled}
                  onKeyDown={handleTemplateKeyDown}
                >
                  <option value="awesomecv">AwesomeCV</option>
                  <option value="hipstercv">HipsterCV</option>
                </select>
              </div>
            )}
            {onThemeColorChange && (
              <div className="pdf-preview-template-control">
                <span className="pdf-preview-template-label">Theme color</span>
                <input
                  id="pdf-preview-theme-color"
                  className="pdf-preview-theme-color-input"
                  type="color"
                  value={themeColor || "#496E8C"}
                  onChange={(event) => onThemeColorChange(event.target.value)}
                  disabled={disabled || isGenerating}
                  aria-label="Theme color"
                />
                <div className="pdf-preview-color-palette" role="group" aria-label="Theme color presets">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`pdf-preview-color-swatch${(themeColor || "").toUpperCase() === preset.toUpperCase() ? " is-active" : ""}`}
                      style={{ backgroundColor: preset }}
                      onClick={() => onThemeColorChange(preset)}
                      disabled={disabled || isGenerating}
                      aria-label={`Set color ${preset}`}
                      title={preset}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="pdf-preview-button-row">
            {onShowProfileImageChange && (
              <div className="pdf-preview-switch-control">
                <span className="pdf-preview-template-label">Show image</span>
                <button
                  id="pdf-preview-show-image-toggle"
                  type="button"
                  className={`pdf-preview-switch${showProfileImage !== false ? " is-on" : ""}`}
                  role="switch"
                  aria-checked={showProfileImage !== false}
                  aria-label="Show profile image"
                  onClick={() => onShowProfileImageChange(showProfileImage === false)}
                  disabled={disabled || isGenerating}
                >
                  <span className="pdf-preview-switch-thumb" />
                </button>
              </div>
            )}
            <button
              id="pdf-update-preview-button"
              type="button"
              className="secondary btn-sm"
              onClick={onUpdate}
              disabled={disabled || isGenerating}
              onKeyDown={handleUpdateKeyDown}
            >
              <RefreshCw size={14} />
              {isGenerating ? "Rendering…" : "Update preview"}
            </button>
            <button
              id="pdf-download-button"
              type="button"
              className="primary btn-sm pdf-download-button"
              onClick={onDownload}
              disabled={disabled || isDownloading || !pdfUrl}
              title={disabled ? disabledReason : (!pdfUrl ? "Render a preview first" : "Download the current PDF")}
            >
              <Download size={14} />
              {isDownloading ? "Downloading…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>
      <div className="pdf-preview-container">
        {disabled ? (
          <div className="pdf-preview-placeholder">
            <p className="helper">{disabledReason || "Preview is disabled until CV form data exists."}</p>
          </div>
        ) : pdfUrl ? (
          <iframe
            src={pdfUrl}
            title="CV PDF preview"
            className="pdf-preview-iframe"
          />
        ) : (
          <div className="pdf-preview-placeholder">
            {isGenerating
              ? <p className="helper">Rendering PDF preview…</p>
              : <p className="helper">Click "Update preview" to render the current CV as PDF.</p>
            }
          </div>
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
              <button
                className="secondary llm-action-button"
                onClick={handleGenerate}
                disabled={isGenerating}
                title="Use AI to draft a cover letter for this role using your resume text and the job description."
              >
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
          </div>
          <p className="helper cv-helper-copy">
            Edit the resume source text below. This exact text is used as the AI input to generate your CV sections.
            After generation, you can still review and edit the CV content.
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
                    <option value="hipstercv">HipsterCV</option>
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
              <div className="cv-generate-row">
                <button
                  className="primary cv-generate-button llm-action-button"
                  onClick={handleGenerateCv}
                  disabled={isGeneratingCv}
                  title="Use AI to create a structured CV draft from your source text and the selected template settings."
                >
                  {isGeneratingCv ? (
                    <>
                      <Spinner size="sm" color="currentColor" />
                      <span>Filling CV...</span>
                    </>
                  ) : (
                    "Create CV"
                  )}
                </button>
              </div>
            </div>
            <div className="cv-sample-preview">
              <p className="label">Sample CV preview</p>
              <img
                src="/cv_example.png"
                alt="Sample CV layout preview"
                loading="lazy"
              />
            </div>
          </div>
          {cvError && <p className="error">{cvError}</p>}
        </div>
      ) : null}
    </div>
  );
}
