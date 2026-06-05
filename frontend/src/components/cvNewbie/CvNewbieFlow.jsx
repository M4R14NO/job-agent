import TemplateStep from "./TemplateStep";
import LanguageStep from "./LanguageStep";
import ResumeStep from "./ResumeStep";
import JobStep from "./JobStep";
import ReviewStep from "./ReviewStep";

export default function CvNewbieFlow({
  step,
  stepOrder,
  stepLabelMap,
  onStepChange,
  onNext,
  onBack,
  canAdvanceFromStep,
  cvTemplateId,
  onCvTemplateIdChange,
  cvOutputLanguage,
  onCvOutputLanguageChange,
  resumeText,
  onResumeTextChange,
  applicationContext,
  onApplicationContextChange,
  onGenerateDraft,
  isGeneratingDraft,
  reviewActionLabel,
  reviewActionDisabled,
  draftError,
  hasDraft,
  hasResumeTextChanges,
  reviewContent
}) {
  const stepIndex = Math.max(0, stepOrder.indexOf(step));
  const canGoNext = canAdvanceFromStep(step);
  const resolvedReviewLabel = reviewActionLabel || "Generate draft";
  const resolvedReviewDisabled = Boolean(reviewActionDisabled);

  const renderStepContent = () => {
    switch (step) {
      case "template":
        return (
          <TemplateStep
            cvTemplateId={cvTemplateId}
            onCvTemplateIdChange={onCvTemplateIdChange}
            hasDraft={hasDraft}
          />
        );
      case "language":
        return (
          <LanguageStep
            cvOutputLanguage={cvOutputLanguage}
            onCvOutputLanguageChange={onCvOutputLanguageChange}
            hasDraft={hasDraft}
          />
        );
      case "resume":
        return (
          <ResumeStep
            resumeText={resumeText}
            onResumeTextChange={onResumeTextChange}
            hasDraft={hasDraft}
          />
        );
      case "job":
        return (
          <JobStep
            applicationContext={applicationContext}
            onApplicationContextChange={onApplicationContextChange}
            hasDraft={hasDraft}
          />
        );
      case "review":
      default:
        return (
          <ReviewStep
            cvTemplateId={cvTemplateId}
            cvOutputLanguage={cvOutputLanguage}
            resumeText={resumeText}
            hasDraft={hasDraft}
            hasResumeTextChanges={hasResumeTextChanges}
            isGeneratingDraft={isGeneratingDraft}
            draftError={draftError}
            onGenerateDraft={onGenerateDraft}
            reviewContent={reviewContent}
          />
        );
    }
  };

  return (
    <div className="cv-newbie-flow">
      <div className="cv-stepper-shell">
        <div className="cv-stepper is-compact" role="tablist" aria-label="CV creation steps">
          {stepOrder.map((stepId, index) => {
            const isActive = stepId === step;
            const isComplete = index < stepIndex;
            return (
              <button
                key={stepId}
                type="button"
                className={`cv-step${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}`}
                onClick={() => onStepChange(stepId)}
                role="tab"
                aria-selected={isActive}
              >
                <span className="cv-step-index">{index + 1}</span>
                <span className="cv-step-text">
                  <span className="cv-step-title">{stepLabelMap[stepId]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cv-step-card">
        <div className="cv-step-card-header">
          <h2>{stepLabelMap[step]}</h2>
          <div className="cv-step-actions">
            <button
              type="button"
              className="secondary"
              onClick={onBack}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            {step === "review" ? (
              <button
                type="button"
                className="primary cv-step-next"
                onClick={onGenerateDraft}
                disabled={resolvedReviewDisabled}
              >
                {isGeneratingDraft ? (
                  <span className="cv-step-spinner" aria-hidden="true" />
                ) : null}
                {isGeneratingDraft ? "Generating..." : resolvedReviewLabel}
              </button>
            ) : (
              <button
                type="button"
                className="primary cv-step-next"
                onClick={onNext}
                disabled={!canGoNext}
              >
                Next
              </button>
            )}
          </div>
        </div>
        {renderStepContent()}
      </div>
    </div>
  );
}
