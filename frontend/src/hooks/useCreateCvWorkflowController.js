import { useCallback, useEffect, useRef } from "react";
import { saveCvProfile } from "../api/llm";

export default function useCreateCvWorkflowController({
  isCreateWorkflowMode,
  isCvIdModalOpen,
  isSavingCvId,
  cvReview,
  cvPreviewPayload,
  cvThemeColors,
  applicationContext,
  resolveTemplateThemeColor,
  handleUpdatePdfPreview,
  cvDraftState,
  cvTemplateId,
  loadedProfileSnapshot,
  resumeText,
  normalizeHexColor,
  mergeProfileImageIntoData,
  buildApplicationContextDiff,
  setPendingPreviewSaveCount,
  upsertCvProfileInList,
  setLoadedProfileSnapshot,
  contextSnapshotFromProfile,
  setCvDraftState,
  previewDebounceMs = 5000,
  autosaveIntervalMs = 30000
}) {
  const pdfPreviewTimerRef = useRef(null);
  const pdfPreviewTemplateRef = useRef("");
  const hasRenderedPdfPreviewRef = useRef(false);
  const shouldAutoRenderCreatePreviewRef = useRef(false);
  const pdfPreviewStructureRef = useRef("");

  const autosaveTimerRef = useRef(null);
  const autosaveInFlightRef = useRef(false);
  const lastAutosaveSnapshotRef = useRef("");

  const shouldAutoRenderPdfPreview = !isCreateWorkflowMode;

  const clearPreviewTracking = useCallback(() => {
    if (pdfPreviewTimerRef.current) {
      clearTimeout(pdfPreviewTimerRef.current);
      pdfPreviewTimerRef.current = null;
    }
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
    shouldAutoRenderCreatePreviewRef.current = false;
  }, []);

  const preparePreviewForReview = useCallback((templateId) => {
    if (pdfPreviewTimerRef.current) {
      clearTimeout(pdfPreviewTimerRef.current);
      pdfPreviewTimerRef.current = null;
    }
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = templateId || "awesomecv";
    pdfPreviewStructureRef.current = "";
  }, []);

  const requestOneTimeCreatePreviewRender = useCallback(() => {
    shouldAutoRenderCreatePreviewRef.current = true;
  }, []);

  const setAutosaveSnapshotFromPayload = useCallback((payload) => {
    if (!payload) return;
    lastAutosaveSnapshotRef.current = JSON.stringify(payload);
  }, []);

  const buildAutosavePayload = useCallback(() => {
    if (!cvDraftState?.payload) return null;

    const templateId = cvReview?.templateId || cvTemplateId || cvDraftState.payload.template_id || "awesomecv";
    const profileId = cvDraftState.payload.profile_id
      || cvDraftState.targetProfileId
      || cvReview?.canonical?.profile_id
      || "";
    if (!profileId) return null;

    const currentRevision = loadedProfileSnapshot.revision
      || cvDraftState.revision
      || cvDraftState.payload.revision
      || 0;

    return {
      ...cvDraftState.payload,
      profile_id: profileId,
      revision: currentRevision,
      template_id: templateId,
      company: applicationContext.company || null,
      application_status: applicationContext.application_status || null,
      application_date: applicationContext.application_date || null,
      job_title: applicationContext.job_title || null,
      job_description: applicationContext.job_description || null,
      job_url: applicationContext.job_url || null,
      theme_color: normalizeHexColor(applicationContext.theme_color, null),
      show_profile_image: applicationContext.show_profile_image !== false,
      header_text_align: applicationContext.header_text_align || "right",
      header_title_size: applicationContext.header_title_size || "Huge",
      header_subtitle_size: applicationContext.header_subtitle_size || "Large",
      audit: {
        ...(cvDraftState.payload.audit || {}),
        raw_resume_text: resumeText
      },
      data: mergeProfileImageIntoData(cvDraftState.payload.data || {}, applicationContext.profile_image)
    };
  }, [
    applicationContext,
    cvDraftState,
    cvReview,
    cvTemplateId,
    loadedProfileSnapshot.revision,
    mergeProfileImageIntoData,
    normalizeHexColor,
    resumeText
  ]);

  const syncAutosaveSnapshotFromCurrentPayload = useCallback(() => {
    const payload = buildAutosavePayload();
    if (!payload) return;
    setAutosaveSnapshotFromPayload(payload);
  }, [buildAutosavePayload, setAutosaveSnapshotFromPayload]);

  const autosaveProfile = useCallback(async () => {
    if (!isCreateWorkflowMode || isCvIdModalOpen || isSavingCvId) return false;
    if (!cvDraftState?.isDirty && !buildApplicationContextDiff().hasChanges) return false;

    const payload = buildAutosavePayload();
    if (!payload || !payload.profile_id) return false;

    const snapshot = JSON.stringify(payload);
    if (snapshot === lastAutosaveSnapshotRef.current) return false;
    if (autosaveInFlightRef.current) return false;

    autosaveInFlightRef.current = true;
    try {
      const saved = await saveCvProfile(payload.profile_id, payload);
      lastAutosaveSnapshotRef.current = JSON.stringify({ ...payload, revision: saved.revision });
      setPendingPreviewSaveCount((prev) => prev + 1);
      upsertCvProfileInList(saved);
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      setCvDraftState((prev) => (prev ? {
        ...prev,
        revision: saved.revision,
        payload: prev.payload ? { ...prev.payload, revision: saved.revision } : prev.payload,
        isDirty: false
      } : prev));
      return true;
    } catch (_err) {
      return false;
    } finally {
      autosaveInFlightRef.current = false;
    }
  }, [
    buildApplicationContextDiff,
    buildAutosavePayload,
    contextSnapshotFromProfile,
    cvDraftState?.isDirty,
    isCreateWorkflowMode,
    isCvIdModalOpen,
    isSavingCvId,
    setCvDraftState,
    setLoadedProfileSnapshot,
    setPendingPreviewSaveCount,
    upsertCvProfileInList
  ]);

  const handleCreateStepLeave = useCallback(({ from, to }) => {
    if (!cvReview?.canonical?.profile_id) return;
    if (from === to) return;
    autosaveProfile();
  }, [autosaveProfile, cvReview?.canonical?.profile_id]);

  useEffect(() => {
    if (!cvPreviewPayload || !cvReview) return undefined;
    if (!shouldAutoRenderPdfPreview) return undefined;

    const activeTemplateId = cvReview.templateId || "awesomecv";
    const activeThemeColor = resolveTemplateThemeColor(activeTemplateId);
    const templateChanged = Boolean(pdfPreviewTemplateRef.current) && pdfPreviewTemplateRef.current !== activeTemplateId;

    const structureSignature = JSON.stringify({
      sections: cvPreviewPayload.sections || {},
      photo: cvPreviewPayload.photo || null,
      show_profile_image: applicationContext?.show_profile_image !== false,
      theme_color: activeThemeColor,
      header_text_align: applicationContext?.header_text_align || "right",
      header_title_size: applicationContext?.header_title_size || "Huge",
      header_subtitle_size: applicationContext?.header_subtitle_size || "Large",
      section_order: cvPreviewPayload.section_order || [],
      sidebar_section_order: cvPreviewPayload.sidebar_section_order || [],
      main_section_order: cvPreviewPayload.main_section_order || [],
      experience_len: (cvPreviewPayload.experience || []).length,
      education_len: (cvPreviewPayload.education || []).length,
      skills_len: (cvPreviewPayload.skills || []).length,
      volunteer_len: (cvPreviewPayload.volunteer || []).length,
      honors_len: (cvPreviewPayload.honors || []).length,
      certificates_len: (cvPreviewPayload.certificates || []).length,
      writings_len: (cvPreviewPayload.writings || []).length,
      languages_len: (cvPreviewPayload.languages || []).length,
      interests_len: (cvPreviewPayload.interests || []).length
    });
    const structureChanged = Boolean(pdfPreviewStructureRef.current) && pdfPreviewStructureRef.current !== structureSignature;

    const shouldRenderImmediately = !hasRenderedPdfPreviewRef.current || templateChanged || structureChanged;
    pdfPreviewTemplateRef.current = activeTemplateId;
    pdfPreviewStructureRef.current = structureSignature;

    if (pdfPreviewTimerRef.current) {
      clearTimeout(pdfPreviewTimerRef.current);
      pdfPreviewTimerRef.current = null;
    }

    if (shouldRenderImmediately) {
      hasRenderedPdfPreviewRef.current = true;
      handleUpdatePdfPreview();
      return undefined;
    }

    pdfPreviewTimerRef.current = setTimeout(() => {
      hasRenderedPdfPreviewRef.current = true;
      handleUpdatePdfPreview();
    }, previewDebounceMs);

    return () => {
      if (pdfPreviewTimerRef.current) {
        clearTimeout(pdfPreviewTimerRef.current);
        pdfPreviewTimerRef.current = null;
      }
    };
  }, [
    applicationContext?.header_subtitle_size,
    applicationContext?.header_text_align,
    applicationContext?.header_title_size,
    applicationContext?.show_profile_image,
    applicationContext?.theme_color,
    cvPreviewPayload,
    cvReview,
    cvThemeColors,
    handleUpdatePdfPreview,
    previewDebounceMs,
    resolveTemplateThemeColor,
    shouldAutoRenderPdfPreview
  ]);

  useEffect(() => {
    if (!isCreateWorkflowMode) return;
    if (!shouldAutoRenderCreatePreviewRef.current) return;
    if (!cvReview || !cvPreviewPayload) return;
    shouldAutoRenderCreatePreviewRef.current = false;
    handleUpdatePdfPreview();
  }, [cvPreviewPayload, cvReview, handleUpdatePdfPreview, isCreateWorkflowMode]);

  useEffect(() => {
    if (!cvDraftState?.payload) return;
    if (cvDraftState.isDirty || buildApplicationContextDiff().hasChanges) return;

    const snapshotPayload = buildAutosavePayload();
    if (!snapshotPayload) return;

    const snapshot = JSON.stringify(snapshotPayload);
    if (snapshot && snapshot !== lastAutosaveSnapshotRef.current) {
      lastAutosaveSnapshotRef.current = snapshot;
    }
  }, [applicationContext, buildApplicationContextDiff, buildAutosavePayload, cvDraftState, resumeText]);

  useEffect(() => {
    if (!isCreateWorkflowMode || !cvReview?.canonical?.profile_id) {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      return undefined;
    }

    if (autosaveTimerRef.current) {
      clearInterval(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setInterval(() => {
      autosaveProfile();
    }, autosaveIntervalMs);

    return () => {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [autosaveIntervalMs, autosaveProfile, cvReview?.canonical?.profile_id, isCreateWorkflowMode]);

  useEffect(() => () => {
    if (pdfPreviewTimerRef.current) {
      clearTimeout(pdfPreviewTimerRef.current);
      pdfPreviewTimerRef.current = null;
    }
    if (autosaveTimerRef.current) {
      clearInterval(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  return {
    autosaveProfile,
    clearPreviewTracking,
    handleCreateStepLeave,
    preparePreviewForReview,
    requestOneTimeCreatePreviewRender,
    setAutosaveSnapshotFromPayload,
    syncAutosaveSnapshotFromCurrentPayload
  };
}
