import { useEffect, useMemo, useState } from "react";
import CvEntry from "./CvEntry";
import CvNewbieFlow from "./cvNewbie/CvNewbieFlow";
import CvReview from "./CvReview";
import { PdfPreviewCard } from "./JobModal";
import { parseCvCanonical } from "../api/llm";

const STEP_ORDER = ["template", "language", "resume", "job", "review"];
const STEP_LABELS = {
  template: "Choose a template",
  language: "Pick the output language",
  resume: "Paste your CV text",
  job: "Optional job context",
  review: "Edit CV"
};

export default function CreateCvView({
  isNewbieCreateMode,
  cvTemplateId,
  onTemplateIdChange,
  cvOutputLanguage,
  onCvOutputLanguageChange,
  resumeText,
  onResumeTextChange,
  applicationContext,
  onApplicationContextChange,
  onNewbieDraftGenerated,
  cvReview,
  createReviewLayoutRef,
  createReviewLayoutStyle,
  createReviewSectionRef,
  pdfPreviewUrl,
  isPdfGenerating,
  isPdfDownloading,
  resolveTemplateThemeColor,
  onThemeColorChange,
  onShowProfileImageChange,
  onHipsterHeaderAlignChange,
  onHipsterHeaderTitleSizeChange,
  onHipsterHeaderSubtitleSizeChange,
  onUpdatePdfPreview,
  onDownloadPdf,
  unsyncedSaveCount,
  onCreateReviewResizeStart,
  selectedModel,
  lmTimeout,
  onCvDraftStateChange,
  onPreviewPayloadChange,
  onCvReviewProfileSaved,
  onUploadProfileImage,
  onClearProfileImage,
  isUploadingProfileImage,
  cvProfiles,
  profilesLoading,
  profilesError,
  selectedProfileId,
  onSelectedProfileIdChange,
  onProfileRowSelect,
  onRefreshProfiles,
  onDeleteProfiles,
  onExportProfiles,
  onImportProfiles,
  onUpdateProfileCvText,
  onRemapProfileCvText,
  onCreateNewEntry,
  onBeginNewEntry,
  isCreatingProfileEntry,
  isLoadingProfile,
  isUpdatingProfileCvText,
  isRemappingProfileCvText,
  isProfileBulkActionBusy,
  remapProgress,
  cvEntryError,
  newProfileId,
  onNewProfileIdChange,
  draftProfileId,
  isDraftProfileActive,
  onBeforeStepLeave
}) {
  const [cvCreateStep, setCvCreateStep] = useState("template");
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [lastGeneratedResumeText, setLastGeneratedResumeText] = useState("");
  const stepIndex = useMemo(() => Math.max(0, STEP_ORDER.indexOf(cvCreateStep)), [cvCreateStep]);
  const hasResumeTextChanges = Boolean(cvReview)
    && resumeText.trim() !== lastGeneratedResumeText;
  const canGenerateDraft = Boolean(resumeText.trim()) && !isGeneratingDraft;
  const canAutoFillDraft = Boolean(cvReview) && hasResumeTextChanges && canGenerateDraft;
  const reviewActionLabel = Boolean(cvReview) && hasResumeTextChanges
    ? "Automagically fill CV given the updated CV text data"
    : "Fill CV with AI magic";
  const reviewActionDisabled = Boolean(cvReview) ? !canAutoFillDraft : !canGenerateDraft;
  const canAdvanceFromStep = (stepId) => {
    return true;
  };

  const notifyStepLeave = (nextStep) => {
    if (typeof onBeforeStepLeave !== "function") return;
    onBeforeStepLeave({ from: cvCreateStep, to: nextStep });
  };

  const handleCreateStepNext = () => {
    if (!canAdvanceFromStep(cvCreateStep)) return;
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

  useEffect(() => {
    if (!cvReview || lastGeneratedResumeText) return;
    setLastGeneratedResumeText(resumeText);
  }, [cvReview, lastGeneratedResumeText, resumeText]);

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

      onNewbieDraftGenerated?.({
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
    <div className="create-layout">
        {isNewbieCreateMode ? (
          <CvNewbieFlow
            step={cvCreateStep}
            stepOrder={STEP_ORDER}
            stepLabelMap={STEP_LABELS}
            onStepChange={handleCreateStepJump}
            onNext={handleCreateStepNext}
            onBack={handleCreateStepBack}
            canAdvanceFromStep={canAdvanceFromStep}
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
            reviewContent={(
              <div
                ref={createReviewLayoutRef}
                className="create-review-layout is-resizable"
                style={createReviewLayoutStyle}
              >
                <div ref={createReviewSectionRef} className="create-review-pane create-review-pane-preview">
                  <PdfPreviewCard
                    pdfUrl={pdfPreviewUrl}
                    isGenerating={isPdfGenerating}
                    isDownloading={isPdfDownloading}
                    templateId={cvReview?.templateId || cvTemplateId}
                    onTemplateIdChange={onTemplateIdChange}
                    themeColor={resolveTemplateThemeColor(cvReview?.templateId || cvTemplateId || "awesomecv")}
                    onThemeColorChange={onThemeColorChange}
                    showProfileImage={applicationContext.show_profile_image !== false}
                    onShowProfileImageChange={onShowProfileImageChange}
                    hipsterHeaderAlign={applicationContext.header_text_align || "right"}
                    onHipsterHeaderAlignChange={onHipsterHeaderAlignChange}
                    hipsterHeaderTitleSize={applicationContext.header_title_size || "Huge"}
                    onHipsterHeaderTitleSizeChange={onHipsterHeaderTitleSizeChange}
                    hipsterHeaderSubtitleSize={applicationContext.header_subtitle_size || "Large"}
                    onHipsterHeaderSubtitleSizeChange={onHipsterHeaderSubtitleSizeChange}
                    onUpdate={onUpdatePdfPreview}
                    onDownload={onDownloadPdf}
                    unsyncedSaveCount={unsyncedSaveCount}
                    disabled={!cvReview}
                    disabledReason="Generate a draft to enable preview."
                  />
                </div>
                <div
                  className="panel-review-divider"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize preview and editor panels"
                  title="Drag to resize preview and editor"
                  onMouseDown={onCreateReviewResizeStart}
                />
                <div className="create-review-pane create-review-pane-editor">
                  {cvReview ? (
                    <CvReview
                      canonical={cvReview.canonical}
                      job={cvReview.job}
                      templateId={cvReview.templateId}
                      docType={cvReview.docType}
                      outputLanguage={cvReview.outputLanguage}
                      model={selectedModel}
                      lmTimeout={lmTimeout}
                      resumeText={resumeText}
                      applicationContext={applicationContext}
                      initialProfileId={cvReview.initialProfileId}
                      onDraftStateChange={onCvDraftStateChange}
                      onPreviewPayloadChange={onPreviewPayloadChange}
                      onProfileSaved={onCvReviewProfileSaved}
                      onUploadProfileImage={onUploadProfileImage}
                      onClearProfileImage={onClearProfileImage}
                      isUploadingProfileImage={isUploadingProfileImage}
                    />
                  ) : (
                    <div className="panel-card panel-empty panel-disabled">
                      <p className="helper">Generate a draft to unlock CV preview and editing.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          />
        ) : (
          <>
            <section className="card">
              <CvEntry
                cvProfiles={cvProfiles}
                profilesLoading={profilesLoading}
                profilesError={profilesError}
                selectedProfileId={selectedProfileId}
                onSelectedProfileIdChange={onSelectedProfileIdChange}
                onProfileRowSelect={onProfileRowSelect}
                onRefreshProfiles={onRefreshProfiles}
                onDeleteProfiles={onDeleteProfiles}
                onExportProfiles={onExportProfiles}
                onImportProfiles={onImportProfiles}
                onUpdateProfileCvText={onUpdateProfileCvText}
                onRemapProfileCvText={onRemapProfileCvText}
                onCreateNewEntry={onCreateNewEntry}
                onBeginNewEntry={onBeginNewEntry}
                isCreatingProfileEntry={isCreatingProfileEntry}
                isLoadingProfile={isLoadingProfile}
                isUpdatingProfileCvText={isUpdatingProfileCvText}
                isRemappingProfileCvText={isRemappingProfileCvText}
                isProfileBulkActionBusy={isProfileBulkActionBusy}
                remapProgress={remapProgress}
                cvEntryError={cvEntryError}
                cvTemplateId={cvTemplateId}
                onCvTemplateIdChange={onTemplateIdChange}
                cvOutputLanguage={cvOutputLanguage}
                onCvOutputLanguageChange={onCvOutputLanguageChange}
                applicationContext={applicationContext}
                onApplicationContextChange={onApplicationContextChange}
                resumeText={resumeText}
                onResumeTextChange={onResumeTextChange}
                newProfileId={newProfileId}
                onNewProfileIdChange={onNewProfileIdChange}
                draftProfileId={draftProfileId}
                isDraftProfileActive={isDraftProfileActive}
                profileTableCollapsedByDefault
                applicationContextDefaultCollapsed
                collapsible={Boolean(cvReview)}
                defaultCollapsed={Boolean(cvReview)}
                autoCollapseOnScroll={Boolean(cvReview)}
              />
            </section>
            <div
              ref={createReviewLayoutRef}
              className="create-review-layout is-resizable"
              style={createReviewLayoutStyle}
            >
              <div ref={createReviewSectionRef} className="create-review-pane create-review-pane-preview">
                <PdfPreviewCard
                  pdfUrl={pdfPreviewUrl}
                  isGenerating={isPdfGenerating}
                  isDownloading={isPdfDownloading}
                  templateId={cvReview?.templateId || cvTemplateId}
                  onTemplateIdChange={onTemplateIdChange}
                  themeColor={resolveTemplateThemeColor(cvReview?.templateId || cvTemplateId || "awesomecv")}
                  onThemeColorChange={onThemeColorChange}
                  showProfileImage={applicationContext.show_profile_image !== false}
                  onShowProfileImageChange={onShowProfileImageChange}
                  hipsterHeaderAlign={applicationContext.header_text_align || "right"}
                  onHipsterHeaderAlignChange={onHipsterHeaderAlignChange}
                  hipsterHeaderTitleSize={applicationContext.header_title_size || "Huge"}
                  onHipsterHeaderTitleSizeChange={onHipsterHeaderTitleSizeChange}
                  hipsterHeaderSubtitleSize={applicationContext.header_subtitle_size || "Large"}
                  onHipsterHeaderSubtitleSizeChange={onHipsterHeaderSubtitleSizeChange}
                  onUpdate={onUpdatePdfPreview}
                  onDownload={onDownloadPdf}
                  disabled={!cvReview}
                  disabledReason="Tailor the CV first to enable preview."
                />
              </div>
              <div
                className="panel-review-divider"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize preview and editor panels"
                title="Drag to resize preview and editor"
                onMouseDown={onCreateReviewResizeStart}
              />
              <div className="create-review-pane create-review-pane-editor">
                {cvReview ? (
                  <CvReview
                    canonical={cvReview.canonical}
                    job={cvReview.job}
                    templateId={cvReview.templateId}
                    docType={cvReview.docType}
                    outputLanguage={cvReview.outputLanguage}
                    model={selectedModel}
                    lmTimeout={lmTimeout}
                    resumeText={resumeText}
                    applicationContext={applicationContext}
                    initialProfileId={cvReview.initialProfileId}
                    onDraftStateChange={onCvDraftStateChange}
                    onPreviewPayloadChange={onPreviewPayloadChange}
                    onProfileSaved={onCvReviewProfileSaved}
                    onUploadProfileImage={onUploadProfileImage}
                    onClearProfileImage={onClearProfileImage}
                    isUploadingProfileImage={isUploadingProfileImage}
                  />
                ) : (
                  <div className="panel-card panel-empty panel-disabled">
                    <p className="helper">Tailor the CV first to unlock CV preview and editing.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
    </div>
  );
}
