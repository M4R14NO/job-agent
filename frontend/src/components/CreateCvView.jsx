import CvDraftWizard from "./cvNewbie/CvDraftWizard";
import CvEntry from "./CvEntry";
import CvReview from "./CvReview";
import { PdfPreviewCard } from "./JobModal";

export default function CreateCvView({ viewModel }) {
  const {
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
  } = viewModel;
  return (
    <div className="create-layout">
        {isNewbieCreateMode ? (
          <CvDraftWizard
            cvTemplateId={cvTemplateId}
            onTemplateIdChange={onTemplateIdChange}
            cvOutputLanguage={cvOutputLanguage}
            onCvOutputLanguageChange={onCvOutputLanguageChange}
            resumeText={resumeText}
            onResumeTextChange={onResumeTextChange}
            applicationContext={applicationContext}
            onApplicationContextChange={onApplicationContextChange}
            newProfileId={newProfileId}
            onDraftGenerated={onNewbieDraftGenerated}
            cvReview={cvReview}
            selectedModel={selectedModel}
            lmTimeout={lmTimeout}
            onBeforeStepLeave={onBeforeStepLeave}
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
                    hasProfileImage={Boolean(applicationContext.profile_image)}
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
                  hasProfileImage={Boolean(applicationContext.profile_image)}
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
