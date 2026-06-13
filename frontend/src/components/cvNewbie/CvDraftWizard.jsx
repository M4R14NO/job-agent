import { useEffect, useMemo, useState } from "react";
import { parseCvCanonical } from "../../api/llm";
import CvNewbieFlow from "./CvNewbieFlow";

const STEP_ORDER = ["template", "language", "resume", "job", "review"];
const STEP_LABELS = {
  template: "Choose a CV template",
  language: "Pick the output language",
  resume: "Paste your CV text",
  job: "Optional job context",
  review: "Edit CV"
};

export default function CvDraftWizard({
  cvTemplateId,
  onTemplateIdChange,
  cvOutputLanguage,
  onCvOutputLanguageChange,
  resumeText,
  onResumeTextChange,
  applicationContext,
  onApplicationContextChange,
  newProfileId,
  onDraftGenerated,
  cvReview,
  selectedModel,
  lmTimeout,
  onBeforeStepLeave,
  reviewContent,
  branchReviewMode = false,
  initialStep = "template"
}) {
  const [cvCreateStep, setCvCreateStep] = useState(initialStep);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [lastGeneratedResumeText, setLastGeneratedResumeText] = useState("");

  const stepIndex = useMemo(
    () => Math.max(0, STEP_ORDER.indexOf(cvCreateStep)),
    [cvCreateStep]
  );

  const hasResumeTextChanges = Boolean(cvReview)
    && resumeText.trim() !== lastGeneratedResumeText;
  const canGenerateDraft = Boolean(resumeText.trim()) && !isGeneratingDraft;
  const canAutoFillDraft = Boolean(cvReview) && hasResumeTextChanges && canGenerateDraft;
  const reviewActionLabel = branchReviewMode
    ? "Adapt CV to new job"
    : (Boolean(cvReview) && hasResumeTextChanges
      ? "Let AI update your CV with the latest changes"
      : "Let AI write CV");
  const reviewActionDisabled = branchReviewMode
    ? (!canGenerateDraft || !selectedModel)
    : (Boolean(cvReview) ? !canAutoFillDraft : !canGenerateDraft);

  useEffect(() => {
    setCvCreateStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    if (!cvReview || lastGeneratedResumeText) return;
    setLastGeneratedResumeText(resumeText);
  }, [cvReview, lastGeneratedResumeText, resumeText]);

  const notifyStepLeave = (nextStep) => {
    if (typeof onBeforeStepLeave !== "function") return;
    onBeforeStepLeave({ from: cvCreateStep, to: nextStep });
  };

  const handleCreateStepNext = () => {
    const nextIndex = Math.min(stepIndex + 1, STEP_ORDER.length - 1);
    const nextStep = STEP_ORDER[nextIndex];
    notifyStepLeave(nextStep);
    setCvCreateStep(nextStep);
  };

  const handleCreateStepBack = () => {
    const nextIndex = Math.max(stepIndex - 1, 0);
    const nextStep = STEP_ORDER[nextIndex];
    notifyStepLeave(nextStep);
    setCvCreateStep(nextStep);
  };

  const handleCreateStepJump = (stepId) => {
    if (!STEP_ORDER.includes(stepId)) return;
    if (stepId !== cvCreateStep) {
      notifyStepLeave(stepId);
    }
    setCvCreateStep(stepId);
  };

  const sanitizeProfileId = (value) => {
    const normalized = (value || "").trim().toLowerCase();
    const safe = normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return safe || `profile-${Date.now()}`;
  };

  const handleGenerateDraft = async () => {
    if (!resumeText.trim()) {
      setDraftError("Paste your CV text to continue.");
      return;
    }
    if (!selectedModel) {
      setDraftError("Select a model to generate the CV draft.");
      return;
    }

    setDraftError("");
    setIsGeneratingDraft(true);
    try {
      const parsed = await parseCvCanonical({
        resume_text: resumeText,
        model: selectedModel,
        lm_timeout: lmTimeout,
        output_language: cvOutputLanguage,
        job_title: applicationContext.job_title || undefined,
        company: applicationContext.company || undefined,
        job_description: applicationContext.job_description || undefined,
        job_url: applicationContext.job_url || undefined
      });

      const safeProfileId = sanitizeProfileId(newProfileId || "newbie-cv");
      const canonical = {
        ...parsed,
        profile_id: parsed?.profile_id || safeProfileId,
        template_id: cvTemplateId || "awesomecv",
        audit: {
          ...(parsed?.audit || {}),
          raw_resume_text: resumeText
        }
      };

      onDraftGenerated?.({
        canonical,
        templateId: cvTemplateId,
        outputLanguage: cvOutputLanguage,
        jobContext: applicationContext
      });
      setLastGeneratedResumeText(resumeText);
      setCvCreateStep("review");
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Failed to generate the CV draft.");
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  return (
    <CvNewbieFlow
      step={cvCreateStep}
      stepOrder={STEP_ORDER}
      stepLabelMap={STEP_LABELS}
      onStepChange={handleCreateStepJump}
      onNext={handleCreateStepNext}
      onBack={handleCreateStepBack}
      canAdvanceFromStep={() => true}
      cvTemplateId={cvTemplateId}
      onCvTemplateIdChange={onTemplateIdChange}
      cvOutputLanguage={cvOutputLanguage}
      onCvOutputLanguageChange={onCvOutputLanguageChange}
      resumeText={resumeText}
      onResumeTextChange={onResumeTextChange}
      applicationContext={applicationContext}
      onApplicationContextChange={onApplicationContextChange}
      onGenerateDraft={handleGenerateDraft}
      isGeneratingDraft={isGeneratingDraft}
      reviewActionLabel={reviewActionLabel}
      reviewActionDisabled={reviewActionDisabled}
      draftError={draftError}
      hasDraft={Boolean(cvReview)}
      hasResumeTextChanges={hasResumeTextChanges}
      branchReviewMode={branchReviewMode}
      reviewContent={reviewContent}
    />
  );
}
