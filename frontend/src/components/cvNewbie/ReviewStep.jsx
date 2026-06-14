export default function ReviewStep({
  cvTemplateId,
  cvOutputLanguage,
  resumeText,
  hasDraft,
  hasResumeTextChanges,
  isGeneratingDraft,
  draftError,
  branchReviewMode,
  reviewContent
}) {
  return (
    <div className="cv-step-content">
      {isGeneratingDraft ? (
        <div className="cv-review-progress">
          <div className="progress-header">
            <span>Writing CV ...</span>
            <span>Local LLM call can take a few moments, please wait...</span>
          </div>
          <div className="cv-review-progress-track">
            <span className="cv-review-progress-bar" aria-hidden="true" />
          </div>
        </div>
      ) : null}
      {draftError ? <p className="error">{draftError}</p> : null}

      <div className="cv-review-content">
        {reviewContent}
      </div>
    </div>
  );
}
