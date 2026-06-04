export default function ReviewStep({
  cvTemplateId,
  cvOutputLanguage,
  resumeText,
  hasDraft,
  hasResumeTextChanges,
  isGeneratingDraft,
  draftError,
  onGenerateDraft,
  reviewContent
}) {
  const canGenerate = Boolean(resumeText.trim()) && !isGeneratingDraft;
  const canAutoFill = hasDraft && hasResumeTextChanges && canGenerate;
  const buttonLabel = hasDraft && hasResumeTextChanges
    ? "Automagically fill CV given the updated CV text data"
    : "Fill CV with AI magic";

  return (
    <div className="cv-step-content">
      <div className="cv-review-header">
        <div className="cv-review-summary-bar">
          <span className="eyebrow">Review</span>
          <div className="cv-review-summary-items">
            <span className="cv-review-summary-item">
              <span className="helper">Template</span>
              <span>{cvTemplateId || "awesomecv"}</span>
            </span>
            <span className="cv-review-summary-item">
              <span className="helper">Language</span>
              <span>{cvOutputLanguage || "english"}</span>
            </span>
            <span className="cv-review-summary-item">
              <span className="helper">CV text</span>
              <span>{resumeText.trim() ? "Ready" : "Missing"}</span>
            </span>
          </div>
        </div>
        <div className="cv-review-primary">
          <button
            type="button"
            className="primary cv-create-button"
            onClick={onGenerateDraft}
            disabled={hasDraft ? !canAutoFill : !canGenerate}
          >
            {isGeneratingDraft ? "Generating..." : buttonLabel}
          </button>
          <p className="helper">After generating, click "Update preview" to refresh the PDF.</p>
        </div>
      </div>

      {draftError ? <p className="error">{draftError}</p> : null}

      <div className="cv-review-content">
        {reviewContent}
      </div>
    </div>
  );
}
