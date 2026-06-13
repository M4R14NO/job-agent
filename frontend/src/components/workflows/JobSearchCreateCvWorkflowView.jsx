import { JobActionsCard, JobDetailsCard, PdfPreviewCard } from "../JobModal";
import CvEntry from "../CvEntry";
import CvReview from "../CvReview";
import CvDraftWizard from "../cvNewbie/CvDraftWizard";

export default function JobSearchCreateCvWorkflowView({
  shouldRenderW1StandaloneReview,
  handleBackToResults,
  selectedJob,
  panelEyebrow,
  panelTitle,
  activeJobAction,
  cvReview,
  setActiveJobAction,
  initializeJobCvContext,
  activeReviewNav,
  handleOpenCvReviewSection,
  actionLabel,
  handleOpenJobDetailsPanel,
  handleOpenProfileBrowserPanel,
  showActionSwitcher,
  handleSwitchJobAction,
  switchActionLabel,
  showActionsPanel,
  showJobCvSetupPanel,
  jobDetailsSectionRef,
  descriptionHtml,
  profileBrowserSectionRef,
  cvProfiles,
  profilesLoading,
  profilesError,
  selectedProfileId,
  setSelectedProfileId,
  loadProfileIntoJobCvContext,
  loadProfiles,
  handleDeleteProfiles,
  handleExportProfiles,
  handleImportProfiles,
  handleUpdateApplicationProfileData,
  handleRemapProfileCvText,
  handleCreateNewEntry,
  handleBeginNewEntry,
  isCreatingProfileEntry,
  isLoadingProfile,
  isUpdatingProfileCvText,
  isRemappingProfileCvText,
  cvRemapProgress,
  cvEntryError,
  isProfileBulkActionBusy,
  cvTemplateId,
  handleTemplateIdChange,
  cvOutputLanguage,
  setCvOutputLanguage,
  applicationContext,
  handleApplicationContextChange,
  resumeText,
  setResumeText,
  newProfileId,
  setNewProfileId,
  draftProfileId,
  isDraftProfileActive,
  showW1TailorAction,
  showW1ReviewCards,
  buildCompanySuffixProfileId,
  reviewLayoutRef,
  reviewLayoutStyle,
  reviewSectionRef,
  pdfPreviewUrl,
  isPdfGenerating,
  isPdfDownloading,
  resolveTemplateThemeColor,
  handleThemeColorChange,
  handleShowProfileImageChange,
  handleHipsterHeaderAlignChange,
  handleHipsterHeaderTitleSizeChange,
  handleHipsterHeaderSubtitleSizeChange,
  handleUpdatePdfPreview,
  handleDownloadPdf,
  pendingPreviewSaveCount,
  handleReviewResizeStart,
  selectedModel,
  lmTimeout,
  handleCvDraftStateChange,
  setCvPreviewPayload,
  handleCvReviewProfileSaved,
  isJobReviewReadOnly,
  openJobEditDecisionDialog,
  handleUploadProfileImage,
  handleClearProfileImage,
  isUploadingProfileImage,
  isW1CvWorkflow,
  w1UiState,
  showJobCoverPanel,
  showJobCvEntryPanel,
  isJobCvChoiceStep,
  handleChooseCreateJobCv,
  handleChooseBranchJobCv,
  isJobCvCreateStep,
  isJobCvBranchReviewStep,
  handleNewbieDraftGenerated,
  handleBranchDraftGenerated,
  onBeforeStepLeave,
  isJobCvBranchStep,
  handleStartCvReview,
  jobEditDecisionModal
}) {
  return (
    <div className={`panel-page${shouldRenderW1StandaloneReview ? " is-review-mode" : ""}`}>
      <div className={`panel-topbar-shell${shouldRenderW1StandaloneReview ? " is-hover-reveal" : ""}`}>
        {shouldRenderW1StandaloneReview ? <div className="panel-topbar-hit-area" aria-hidden="true" /> : null}
        <header className="panel-topbar">
          <button className="secondary" onClick={handleBackToResults}>
            {selectedJob ? "Back to results" : "Back to start"}
          </button>
          <div className="panel-heading">
            <p className="eyebrow">{panelEyebrow}</p>
            <h2>{panelTitle}</h2>
            {selectedJob?.company && <p className="subtitle">{selectedJob.company}</p>}
          </div>
          <div className="panel-actions">
            {activeJobAction === "none" && !cvReview ? (
              <>
                <button
                  className="cta cta-cover llm-action-button"
                  onClick={() => setActiveJobAction("cover")}
                  title="Use AI to draft a cover letter for the selected job based on your resume and job details."
                >
                  Generate cover letter
                </button>
                <button
                  className="cta cta-cv llm-action-button"
                  onClick={() => {
                    initializeJobCvContext(selectedJob);
                  }}
                  title="Use AI to turn your resume text and job context into an editable CV draft."
                >
                  Generate CV
                </button>
              </>
            ) : (
              <>
                {shouldRenderW1StandaloneReview ? (
                  <button
                    type="button"
                    className={`secondary panel-nav-toggle${activeReviewNav === "review" ? " is-active" : ""}`}
                    onClick={handleOpenCvReviewSection}
                  >
                    CV review
                  </button>
                ) : (
                  <span className="action-pill">{actionLabel}</span>
                )}
                {shouldRenderW1StandaloneReview ? (
                  <>
                    <button
                      type="button"
                      className={`secondary panel-nav-toggle${activeReviewNav === "details" ? " is-active" : ""}`}
                      onClick={handleOpenJobDetailsPanel}
                    >
                      View job details
                    </button>
                    <button
                      type="button"
                      className={`secondary panel-nav-toggle${activeReviewNav === "profiles" ? " is-active" : ""}`}
                      onClick={handleOpenProfileBrowserPanel}
                    >
                      Browse CV profiles
                    </button>
                  </>
                ) : null}
                {showActionSwitcher && (
                  <button
                    className="cta cta-switch"
                    onClick={handleSwitchJobAction}
                  >
                    {switchActionLabel}
                  </button>
                )}
              </>
            )}
          </div>
        </header>
      </div>
      <div className={`panel-body ${showActionsPanel || cvReview ? "" : "is-single"} ${shouldRenderW1StandaloneReview ? "is-review-layout" : ""} ${showJobCvSetupPanel ? "is-single" : ""}`}>
        {shouldRenderW1StandaloneReview ? (
          <div className="panel-review-stack">
            <div ref={jobDetailsSectionRef} className="panel-inline-section">
              <JobDetailsCard
                job={selectedJob}
                descriptionHtml={descriptionHtml}
                collapsible={false}
                defaultCollapsed={false}
              />
            </div>
            <div ref={profileBrowserSectionRef} className="panel-inline-section">
              <CvEntry
                cvProfiles={cvProfiles}
                profilesLoading={profilesLoading}
                profilesError={profilesError}
                selectedProfileId={selectedProfileId}
                onSelectedProfileIdChange={setSelectedProfileId}
                onProfileRowSelect={(profile) => loadProfileIntoJobCvContext(profile?.profile_id || "")}
                onRefreshProfiles={loadProfiles}
                onDeleteProfiles={handleDeleteProfiles}
                onExportProfiles={handleExportProfiles}
                onImportProfiles={handleImportProfiles}
                onUpdateProfileCvText={handleUpdateApplicationProfileData}
                onRemapProfileCvText={handleRemapProfileCvText}
                onCreateNewEntry={handleCreateNewEntry}
                onBeginNewEntry={handleBeginNewEntry}
                isCreatingProfileEntry={isCreatingProfileEntry}
                isLoadingProfile={isLoadingProfile}
                isUpdatingProfileCvText={isUpdatingProfileCvText}
                isRemappingProfileCvText={isRemappingProfileCvText}
                remapProgress={cvRemapProgress}
                cvEntryError={cvEntryError}
                isProfileBulkActionBusy={isProfileBulkActionBusy}
                cvTemplateId={cvTemplateId}
                onCvTemplateIdChange={handleTemplateIdChange}
                cvOutputLanguage={cvOutputLanguage}
                onCvOutputLanguageChange={setCvOutputLanguage}
                applicationContext={applicationContext}
                onApplicationContextChange={handleApplicationContextChange}
                resumeText={resumeText}
                onResumeTextChange={setResumeText}
                newProfileId={newProfileId}
                onNewProfileIdChange={setNewProfileId}
                draftProfileId={draftProfileId}
                isDraftProfileActive={isDraftProfileActive}
                contextMode="job"
                hideCreateProfileButton
                hideUpdateAction
                hideTailorAction={!showW1TailorAction || Boolean(cvReview)}
                hideTailorProgress={Boolean(cvReview)}
                profileTableCollapsedByDefault={false}
                applicationContextDefaultCollapsed={false}
                collapsible={false}
                defaultCollapsed={false}
                autoCollapseOnScroll={false}
                tailorActionDisabled={isRemappingProfileCvText || isLoadingProfile || !resumeText.trim()}
                remapSuggestionBuilder={({ defaultSuggested, selectedProfile: profile }) => {
                  const baseId = profile?.profile_id || selectedProfileId || newProfileId || defaultSuggested || "profile";
                  return buildCompanySuffixProfileId({
                    baseId,
                    company: selectedJob?.company || applicationContext.company || "company"
                  });
                }}
                tailorContext={{
                  jobTitle: selectedJob?.title || applicationContext.job_title || "",
                  company: selectedJob?.company || applicationContext.company || "",
                  sourceProfileId: selectedProfileId || "",
                  targetProfileId: newProfileId || "",
                  templateId: cvTemplateId,
                  outputLanguage: cvOutputLanguage
                }}
              />
            </div>
            {showW1ReviewCards ? (
              <div
                ref={reviewLayoutRef}
                className="panel-review-layout is-resizable"
                style={reviewLayoutStyle}
              >
                <div ref={reviewSectionRef} className="panel-review-pane panel-review-pane-preview">
                  <PdfPreviewCard
                    pdfUrl={pdfPreviewUrl}
                    isGenerating={isPdfGenerating}
                    isDownloading={isPdfDownloading}
                    templateId={cvReview.templateId}
                    onTemplateIdChange={handleTemplateIdChange}
                    themeColor={resolveTemplateThemeColor(cvReview.templateId || "awesomecv")}
                    onThemeColorChange={handleThemeColorChange}
                    showProfileImage={applicationContext.show_profile_image !== false}
                    onShowProfileImageChange={handleShowProfileImageChange}
                    hipsterHeaderAlign={applicationContext.header_text_align || "right"}
                    onHipsterHeaderAlignChange={handleHipsterHeaderAlignChange}
                    hipsterHeaderTitleSize={applicationContext.header_title_size || "Huge"}
                    onHipsterHeaderTitleSizeChange={handleHipsterHeaderTitleSizeChange}
                    hipsterHeaderSubtitleSize={applicationContext.header_subtitle_size || "Large"}
                    onHipsterHeaderSubtitleSizeChange={handleHipsterHeaderSubtitleSizeChange}
                    onUpdate={handleUpdatePdfPreview}
                    onDownload={handleDownloadPdf}
                    unsyncedSaveCount={pendingPreviewSaveCount}
                    disabled={false}
                    disabledReason=""
                  />
                </div>
                <div
                  className="panel-review-divider"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize preview and editor panels"
                  title="Drag to resize preview and editor"
                  onMouseDown={handleReviewResizeStart}
                />
                <div className="panel-review-pane panel-review-pane-editor">
                  <CvReview
                    canonical={cvReview.canonical}
                    job={cvReview.job}
                    templateId={cvReview.templateId}
                    docType={cvReview.docType}
                    outputLanguage={cvReview.outputLanguage}
                    model={selectedModel}
                    lmTimeout={lmTimeout}
                    applicationContext={applicationContext}
                    onDraftStateChange={handleCvDraftStateChange}
                    onPreviewPayloadChange={setCvPreviewPayload}
                    onProfileSaved={handleCvReviewProfileSaved}
                    onTailor={() => handleRemapProfileCvText({ targetProfileId: newProfileId || undefined, allowOverwrite: false })}
                    isTailoring={isRemappingProfileCvText}
                    tailorProgress={cvRemapProgress}
                    readOnly={isJobReviewReadOnly}
                    showTailorAction={showW1TailorAction}
                    onEditProfile={isJobReviewReadOnly ? openJobEditDecisionDialog : undefined}
                    onUploadProfileImage={handleUploadProfileImage}
                    onClearProfileImage={handleClearProfileImage}
                    isUploadingProfileImage={isUploadingProfileImage}
                  />
                </div>
              </div>
            ) : (isW1CvWorkflow && (w1UiState === "S1" || w1UiState === "S2")) ? (
              <div className="panel-card panel-empty panel-disabled">
                <p className="helper">
                  {w1UiState === "S1"
                    ? "Choose a profile to browse in read-only mode or paste CV text to enable tailoring for this job."
                    : "CV text is ready. Use Tailor to create a job-tailored profile copy, or browse a profile for read-only preview."}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {showJobCoverPanel || !showActionsPanel ? (
              <div className="panel-column">
                <JobDetailsCard
                  job={selectedJob}
                  descriptionHtml={descriptionHtml}
                  collapsible={showActionsPanel || Boolean(cvReview)}
                  defaultCollapsed={showActionsPanel || Boolean(cvReview)}
                />
              </div>
            ) : null}
            {showJobCvEntryPanel ? (
              <div className="panel-column">
                {isJobCvChoiceStep ? (
                  <div className="panel-card cv-flow-choice-card">
                    <div className="panel-header">
                      <div>
                        <p className="eyebrow">CV generation</p>
                        <h2>How do you want to start?</h2>
                      </div>
                    </div>
                    <p className="helper">Select one path to continue for this job.</p>
                    <div className="inline-actions">
                      <button type="button" className="cta cta-cv" onClick={handleChooseCreateJobCv}>
                        Create new CV
                      </button>
                      <button type="button" className="secondary" onClick={handleChooseBranchJobCv}>
                        Branch from existing CV
                      </button>
                    </div>
                  </div>
                ) : (isJobCvCreateStep || isJobCvBranchReviewStep) ? (
                  <div className="panel-card cv-flow-choice-card">
                    <CvDraftWizard
                      cvTemplateId={cvTemplateId}
                      onTemplateIdChange={handleTemplateIdChange}
                      cvOutputLanguage={cvOutputLanguage}
                      onCvOutputLanguageChange={setCvOutputLanguage}
                      resumeText={resumeText}
                      onResumeTextChange={setResumeText}
                      applicationContext={applicationContext}
                      onApplicationContextChange={handleApplicationContextChange}
                      newProfileId={newProfileId}
                      onDraftGenerated={isJobCvBranchReviewStep ? handleBranchDraftGenerated : handleNewbieDraftGenerated}
                      cvReview={cvReview}
                      selectedModel={selectedModel}
                      lmTimeout={lmTimeout}
                      onBeforeStepLeave={onBeforeStepLeave}
                      branchReviewMode={isJobCvBranchReviewStep}
                      reviewContent={(
                        <div
                          ref={reviewLayoutRef}
                          className="panel-review-layout is-resizable"
                          style={reviewLayoutStyle}
                        >
                          <div ref={reviewSectionRef} className="panel-review-pane panel-review-pane-preview">
                            <PdfPreviewCard
                              pdfUrl={pdfPreviewUrl}
                              isGenerating={isPdfGenerating}
                              isDownloading={isPdfDownloading}
                              templateId={cvReview?.templateId || cvTemplateId}
                              onTemplateIdChange={handleTemplateIdChange}
                              themeColor={resolveTemplateThemeColor(cvReview?.templateId || cvTemplateId || "awesomecv")}
                              onThemeColorChange={handleThemeColorChange}
                              showProfileImage={applicationContext.show_profile_image !== false}
                              onShowProfileImageChange={handleShowProfileImageChange}
                              hipsterHeaderAlign={applicationContext.header_text_align || "right"}
                              onHipsterHeaderAlignChange={handleHipsterHeaderAlignChange}
                              hipsterHeaderTitleSize={applicationContext.header_title_size || "Huge"}
                              onHipsterHeaderTitleSizeChange={handleHipsterHeaderTitleSizeChange}
                              hipsterHeaderSubtitleSize={applicationContext.header_subtitle_size || "Large"}
                              onHipsterHeaderSubtitleSizeChange={handleHipsterHeaderSubtitleSizeChange}
                              onUpdate={handleUpdatePdfPreview}
                              onDownload={handleDownloadPdf}
                              unsyncedSaveCount={pendingPreviewSaveCount}
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
                            onMouseDown={handleReviewResizeStart}
                          />
                          <div className="panel-review-pane panel-review-pane-editor">
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
                                onDraftStateChange={handleCvDraftStateChange}
                                onPreviewPayloadChange={setCvPreviewPayload}
                                onProfileSaved={handleCvReviewProfileSaved}
                                onUploadProfileImage={handleUploadProfileImage}
                                onClearProfileImage={handleClearProfileImage}
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
                      initialStep={isJobCvBranchReviewStep ? "review" : "template"}
                    />
                  </div>
                ) : (
                  <CvEntry
                    cvProfiles={cvProfiles}
                    profilesLoading={profilesLoading}
                    profilesError={profilesError}
                    selectedProfileId={selectedProfileId}
                    onSelectedProfileIdChange={setSelectedProfileId}
                    onProfileRowSelect={(profile) => loadProfileIntoJobCvContext(profile?.profile_id || "")}
                    onRefreshProfiles={loadProfiles}
                    onDeleteProfiles={handleDeleteProfiles}
                    onExportProfiles={handleExportProfiles}
                    onImportProfiles={handleImportProfiles}
                    onUpdateProfileCvText={handleUpdateApplicationProfileData}
                    onRemapProfileCvText={handleRemapProfileCvText}
                    onCreateNewEntry={handleCreateNewEntry}
                    onBeginNewEntry={handleBeginNewEntry}
                    isCreatingProfileEntry={isCreatingProfileEntry}
                    isLoadingProfile={isLoadingProfile}
                    isUpdatingProfileCvText={isUpdatingProfileCvText}
                    isRemappingProfileCvText={isRemappingProfileCvText}
                    remapProgress={cvRemapProgress}
                    cvEntryError={cvEntryError}
                    isProfileBulkActionBusy={isProfileBulkActionBusy}
                    cvTemplateId={cvTemplateId}
                    onCvTemplateIdChange={handleTemplateIdChange}
                    cvOutputLanguage={cvOutputLanguage}
                    onCvOutputLanguageChange={setCvOutputLanguage}
                    applicationContext={applicationContext}
                    onApplicationContextChange={handleApplicationContextChange}
                    resumeText={resumeText}
                    onResumeTextChange={setResumeText}
                    newProfileId={newProfileId}
                    onNewProfileIdChange={setNewProfileId}
                    draftProfileId={draftProfileId}
                    isDraftProfileActive={isDraftProfileActive}
                    contextMode="job"
                    hideCreateProfileButton={isJobCvBranchStep}
                    hideUpdateAction={isJobCvBranchStep}
                    hideTailorAction={isJobCvBranchStep || !showW1TailorAction || Boolean(cvReview)}
                    hideTailorProgress={Boolean(cvReview)}
                    autoOpenProfileIdDialog={isJobCvCreateStep}
                    profileTableCollapsedByDefault={isJobCvCreateStep}
                    applicationContextDefaultCollapsed={isJobCvBranchStep || Boolean(cvReview)}
                    collapsible={Boolean(cvReview)}
                    defaultCollapsed={Boolean(cvReview)}
                    autoCollapseOnScroll={Boolean(cvReview)}
                    tailorActionDisabled={isRemappingProfileCvText || isLoadingProfile || !resumeText.trim()}
                    remapSuggestionBuilder={({ defaultSuggested, selectedProfile: profile }) => {
                      const baseId = profile?.profile_id || selectedProfileId || newProfileId || defaultSuggested || "profile";
                      return buildCompanySuffixProfileId({
                        baseId,
                        company: selectedJob?.company || applicationContext.company || "company"
                      });
                    }}
                    tailorContext={{
                      jobTitle: selectedJob?.title || applicationContext.job_title || "",
                      company: selectedJob?.company || applicationContext.company || "",
                      sourceProfileId: selectedProfileId || "",
                      targetProfileId: newProfileId || "",
                      templateId: cvTemplateId,
                      outputLanguage: cvOutputLanguage
                    }}
                  />
                )}
              </div>
            ) : null}
            {showJobCoverPanel ? (
              <div className="panel-column">
                <JobActionsCard
                  mode={activeJobAction}
                  job={selectedJob}
                  resumeText={resumeText}
                  onResumeTextChange={setResumeText}
                  selectedModel={selectedModel}
                  lmTimeout={lmTimeout}
                  onStartCvReview={handleStartCvReview}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
      {jobEditDecisionModal}
    </div>
  );
}
