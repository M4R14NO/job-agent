import { ArrowLeft, ArrowRight, Eye, EyeOff, WandSparkles } from "lucide-react";
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
  branchReviewMode,
  reviewContent,
  showResumeExample,
  onToggleResumeExample
}) {
  const stepIndex = Math.max(0, stepOrder.indexOf(step));
  const canGoNext = canAdvanceFromStep(step);
  const resolvedReviewLabel = reviewActionLabel || "Generate draft";
  const resolvedReviewDisabled = Boolean(reviewActionDisabled);

  const headerNote = (() => {
    if (step === "review") {
      if (branchReviewMode) {
        return "Edit directly below, or click \"Adapt CV to new job\" for a fresh AI adaptation.";
      }
      if (hasDraft && hasResumeTextChanges && !isGeneratingDraft) {
        return "After generating, click \"Update preview\" to refresh the PDF.";
      }
      return null;
    }
    if (!hasDraft) return null;
    if (step === "template") {
      return "You already generated a draft. Change the template and regenerate to update the CV.";
    }
    if (step === "language") {
      return "Draft already generated. Regenerate after changing the output language.";
    }
    if (step === "resume") {
      return "Draft already generated. Update this text and regenerate to refresh the draft.";
    }
    if (step === "job") {
      return "Draft already generated. Update job context and regenerate to refresh the draft.";
    }
    return null;
  })();

  const renderStepContent = () => {
    switch (step) {
      case "template":
        return (
          <TemplateStep
            cvTemplateId={cvTemplateId}
            onCvTemplateIdChange={onCvTemplateIdChange}
          />
        );
      case "language":
        return (
          <LanguageStep
            cvOutputLanguage={cvOutputLanguage}
            onCvOutputLanguageChange={onCvOutputLanguageChange}
          />
        );
      case "resume":
        return (
          <ResumeStep
            resumeText={resumeText}
            onResumeTextChange={onResumeTextChange}
            showExample={Boolean(showResumeExample)}
          />
        );
      case "job":
        return (
          <JobStep
            applicationContext={applicationContext}
            onApplicationContextChange={onApplicationContextChange}
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
            branchReviewMode={Boolean(branchReviewMode)}
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
        <div className={`cv-step-card-header${headerNote ? " has-note" : ""}`}>
          {headerNote ? (
            <div className="cv-step-note cv-step-header-note" role="note" aria-label="Step guidance">
              {headerNote}
            </div>
          ) : null}
          <div className="cv-step-actions">
            {step === "resume" ? (
              <button
                type="button"
                className="secondary"
                onClick={onToggleResumeExample}
              >
                {showResumeExample ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                {showResumeExample ? "Hide example" : "Show example"}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              onClick={onBack}
              disabled={stepIndex === 0}
            >
              <ArrowLeft size={14} aria-hidden="true" />
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
                {!isGeneratingDraft ? <WandSparkles size={14} aria-hidden="true" /> : null}
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
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {renderStepContent()}
      </div>
    </div>
  );
}
