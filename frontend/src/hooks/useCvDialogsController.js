import { useCallback, useEffect, useState } from "react";
import { getCvProfile, saveCvProfile } from "../api/llm";

export function useCvReviewOverwriteDialogController(options = {}) {
  const {
    readOnly = false,
    setIsSaving,
    onProfileSaved,
    buildOverwriteDiff,
    nextProfileSuggestion
  } = options;

  const [overwriteDialog, setOverwriteDialog] = useState({
    isOpen: false,
    diff: null,
    suggestedProfileId: "",
    pendingPayload: null,
    pendingTargetProfileId: "",
    pendingTargetRevision: 0,
    error: ""
  });

  const closeOverwriteDialog = useCallback(() => {
    setOverwriteDialog({
      isOpen: false,
      diff: null,
      suggestedProfileId: "",
      pendingPayload: null,
      pendingTargetProfileId: "",
      pendingTargetRevision: 0,
      error: ""
    });
  }, []);

  const setSuggestedProfileId = useCallback((value) => {
    setOverwriteDialog((prev) => ({ ...prev, suggestedProfileId: value }));
  }, []);

  const resolveSaveConflict = useCallback(async ({ targetProfileId, payload }) => {
    let existingTarget = null;
    let targetRevision = 0;
    try {
      existingTarget = await getCvProfile(targetProfileId);
      targetRevision = existingTarget?.revision ?? 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("status 404")) {
        throw err;
      }
    }

    if (existingTarget) {
      const diff = buildOverwriteDiff({
        existingProfile: existingTarget,
        pendingPayload: payload,
        targetProfileId
      });

      if (diff.hasChanges) {
        setOverwriteDialog({
          isOpen: true,
          diff,
          suggestedProfileId: nextProfileSuggestion(targetProfileId),
          pendingPayload: payload,
          pendingTargetProfileId: targetProfileId,
          pendingTargetRevision: targetRevision,
          error: ""
        });
        return { blockedByDialog: true, targetRevision };
      }
    }

    return { blockedByDialog: false, targetRevision };
  }, [buildOverwriteDiff, nextProfileSuggestion]);

  const handleConfirmOverwrite = useCallback(async ({ onSaved }) => {
    if (readOnly) return;
    if (!overwriteDialog.pendingPayload || !overwriteDialog.pendingTargetProfileId) return;
    setOverwriteDialog((prev) => ({ ...prev, error: "" }));
    setIsSaving(true);
    try {
      const payload = {
        ...overwriteDialog.pendingPayload,
        revision: overwriteDialog.pendingTargetRevision,
        profile_id: overwriteDialog.pendingTargetProfileId
      };
      const saved = await saveCvProfile(overwriteDialog.pendingTargetProfileId, payload);
      onSaved(saved);
      onProfileSaved?.(saved);
      closeOverwriteDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Overwrite failed";
      setOverwriteDialog((prev) => ({ ...prev, error: message }));
    } finally {
      setIsSaving(false);
    }
  }, [closeOverwriteDialog, onProfileSaved, overwriteDialog.pendingPayload, overwriteDialog.pendingTargetProfileId, overwriteDialog.pendingTargetRevision, readOnly, setIsSaving]);

  const handleSaveAsNewFromDialog = useCallback(async ({ onSaved }) => {
    if (readOnly) return;
    const nextId = overwriteDialog.suggestedProfileId.trim();
    if (!nextId || !overwriteDialog.pendingPayload) {
      setOverwriteDialog((prev) => ({ ...prev, error: "Enter a new profile name." }));
      return;
    }

    setIsSaving(true);
    setOverwriteDialog((prev) => ({ ...prev, error: "" }));
    try {
      try {
        await getCvProfile(nextId);
        setOverwriteDialog((prev) => ({
          ...prev,
          error: "That profile name already exists. Choose a different one."
        }));
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("status 404")) {
          throw err;
        }
      }

      const payload = {
        ...overwriteDialog.pendingPayload,
        profile_id: nextId,
        revision: 0,
        parent_profile_id: overwriteDialog.pendingTargetProfileId || overwriteDialog.pendingPayload.profile_id || null,
        lineage_root_profile_id: overwriteDialog.pendingPayload.lineage_root_profile_id || overwriteDialog.pendingTargetProfileId || nextId,
        lineage_depth: (Number.isFinite(overwriteDialog.pendingPayload.lineage_depth)
          ? Number(overwriteDialog.pendingPayload.lineage_depth)
          : 0) + 1,
        branch_reason: "manual-save-as"
      };
      const saved = await saveCvProfile(nextId, payload);
      onSaved(saved);
      onProfileSaved?.(saved);
      closeOverwriteDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save as new profile failed";
      setOverwriteDialog((prev) => ({ ...prev, error: message }));
    } finally {
      setIsSaving(false);
    }
  }, [closeOverwriteDialog, onProfileSaved, overwriteDialog.pendingPayload, overwriteDialog.pendingTargetProfileId, overwriteDialog.suggestedProfileId, readOnly, setIsSaving]);

  return {
    overwriteDialog,
    setSuggestedProfileId,
    resolveSaveConflict,
    closeOverwriteDialog,
    handleConfirmOverwrite,
    handleSaveAsNewFromDialog
  };
}

export default function useCvDialogsController(options = {}) {
  const {
    // CV ID modal domain
    cvProfiles,
    sanitizeProfileId,
    buildCvIdSuggestion,
    buildNewbieDraftPayload,
    upsertCvProfileInList,
    setSelectedProfileId,
    setNewProfileId,
    setApplicationContext,
    setLoadedProfileSnapshot,
    setAutosaveSnapshotFromPayloadRef,
    setPendingPreviewSaveCount,
    contextFromProfile,
    contextSnapshotFromProfile,
    handleNewbieDraftReadyRef,
    // Profile switch dialog domain
    cvDraftState,
    selectedProfileId,
    resumeText,
    applicationContext,
    normalizeHexColor,
    mergeProfileImageIntoData,
    buildSaveAndSwitchPayload,
    loadProfileIntoEditor
  } = options;

  const [pendingNewbieDraft, setPendingNewbieDraft] = useState(null);
  const [isCvIdModalOpen, setIsCvIdModalOpen] = useState(false);
  const [cvIdInput, setCvIdInput] = useState("");
  const [cvIdError, setCvIdError] = useState("");
  const [isSavingCvId, setIsSavingCvId] = useState(false);

  const [profileSwitchDialog, setProfileSwitchDialog] = useState({
    isOpen: false,
    pendingProfileId: "",
    isBusy: false,
    error: "",
    diff: null
  });

  useEffect(() => {
    if (isCvIdModalOpen) {
      document.body.classList.add("modal-open");
      return () => document.body.classList.remove("modal-open");
    }
    document.body.classList.remove("modal-open");
    return undefined;
  }, [isCvIdModalOpen]);

  const openCvIdModal = useCallback(({ canonical, templateId, outputLanguage, jobContext }) => {
    const existingIds = cvProfiles.map((profile) => profile.profile_id);
    const suggestion = buildCvIdSuggestion({
      jobTitle: jobContext?.job_title,
      existingIds
    });
    setPendingNewbieDraft({ canonical, templateId, outputLanguage, jobContext });
    setCvIdInput(suggestion);
    setCvIdError("");
    setIsSavingCvId(false);
    setIsCvIdModalOpen(true);
  }, [buildCvIdSuggestion, cvProfiles]);

  const closeCvIdModal = useCallback(() => {
    setIsCvIdModalOpen(false);
    setCvIdError("");
    setPendingNewbieDraft(null);
  }, []);

  const handleCvIdInputChange = useCallback((value) => {
    setCvIdInput(value);
    setCvIdError("");
  }, []);

  const handleConfirmCvId = useCallback(async () => {
    if (!pendingNewbieDraft) return;
    const normalized = sanitizeProfileId(cvIdInput || "");
    if (!normalized) {
      setCvIdError("CV id is required.");
      return;
    }
    const exists = cvProfiles.some((profile) => profile.profile_id === normalized);
    if (exists) {
      const suggestion = buildCvIdSuggestion({
        jobTitle: pendingNewbieDraft.jobContext?.job_title,
        existingIds: cvProfiles.map((profile) => profile.profile_id)
      });
      setCvIdInput(suggestion);
      setCvIdError(`CV id '${normalized}' already exists. Try '${suggestion}'.`);
      return;
    }

    setIsSavingCvId(true);
    setCvIdError("");
    try {
      const payload = buildNewbieDraftPayload(pendingNewbieDraft, normalized);
      const saved = await saveCvProfile(normalized, payload);
      upsertCvProfileInList(saved);
      setSelectedProfileId(saved.profile_id);
      setNewProfileId(saved.profile_id);
      setApplicationContext(contextFromProfile(saved));
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      setAutosaveSnapshotFromPayloadRef.current?.(payload);
      setPendingPreviewSaveCount(0);
      handleNewbieDraftReadyRef.current?.({
        canonical: saved,
        templateId: saved.template_id || pendingNewbieDraft.templateId,
        outputLanguage: pendingNewbieDraft.outputLanguage,
        jobContext: pendingNewbieDraft.jobContext
      });
      setPendingNewbieDraft(null);
      closeCvIdModal();
    } catch (err) {
      setCvIdError(err instanceof Error ? err.message : "Failed to save CV id.");
    } finally {
      setIsSavingCvId(false);
    }
  }, [
    buildCvIdSuggestion,
    buildNewbieDraftPayload,
    closeCvIdModal,
    contextFromProfile,
    contextSnapshotFromProfile,
    cvIdInput,
    cvProfiles,
    handleNewbieDraftReadyRef,
    pendingNewbieDraft,
    sanitizeProfileId,
    setApplicationContext,
    setAutosaveSnapshotFromPayloadRef,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setPendingPreviewSaveCount,
    setSelectedProfileId,
    upsertCvProfileInList
  ]);

  const openProfileSwitchDialog = useCallback(({ pendingProfileId, diff }) => {
    setProfileSwitchDialog({
      isOpen: true,
      pendingProfileId: pendingProfileId || "",
      isBusy: false,
      error: "",
      diff: diff || null
    });
  }, []);

  const closeProfileSwitchDialog = useCallback(() => {
    setProfileSwitchDialog({
      isOpen: false,
      pendingProfileId: "",
      isBusy: false,
      error: "",
      diff: null
    });
  }, []);

  const handleSwitchWithoutSaving = useCallback(async () => {
    if (!profileSwitchDialog.pendingProfileId) return;
    setProfileSwitchDialog((prev) => ({ ...prev, isBusy: true, error: "" }));
    await loadProfileIntoEditor(profileSwitchDialog.pendingProfileId);
    closeProfileSwitchDialog();
  }, [closeProfileSwitchDialog, loadProfileIntoEditor, profileSwitchDialog.pendingProfileId]);

  const handleSaveAndSwitchProfile = useCallback(async () => {
    if (!profileSwitchDialog.pendingProfileId) return;
    const effectiveCurrentProfileId = cvDraftState.targetProfileId || selectedProfileId;
    if (!effectiveCurrentProfileId) {
      setProfileSwitchDialog((prev) => ({ ...prev, error: "No selected profile to save." }));
      return;
    }

    setProfileSwitchDialog((prev) => ({ ...prev, isBusy: true, error: "" }));
    try {
      let existing = null;
      try {
        existing = await getCvProfile(effectiveCurrentProfileId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("status 404")) throw err;
      }

      if (!existing) {
        throw new Error("Current profile could not be loaded for saving.");
      }

      const basePayload = cvDraftState.payload || {
        schema_version: existing.schema_version,
        profile_id: effectiveCurrentProfileId,
        revision: existing.revision,
        template_id: existing.template_id,
        data: mergeProfileImageIntoData(existing.data, applicationContext.profile_image),
        section_order: existing.section_order,
        sidebar_section_order: existing.sidebar_section_order,
        main_section_order: existing.main_section_order
      };

      const payload = buildSaveAndSwitchPayload({
        existing,
        basePayload,
        currentProfileId: effectiveCurrentProfileId,
        applicationContext,
        resumeText,
        normalizeHexColorFn: normalizeHexColor,
        mergeProfileImageIntoDataFn: mergeProfileImageIntoData
      });

      const saved = await saveCvProfile(payload.profile_id, payload);
      upsertCvProfileInList(saved);
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      await loadProfileIntoEditor(profileSwitchDialog.pendingProfileId);
      closeProfileSwitchDialog();
    } catch (err) {
      setProfileSwitchDialog((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to save draft before switching.",
        isBusy: false
      }));
    }
  }, [
    applicationContext,
    buildSaveAndSwitchPayload,
    closeProfileSwitchDialog,
    contextSnapshotFromProfile,
    cvDraftState.payload,
    cvDraftState.targetProfileId,
    loadProfileIntoEditor,
    mergeProfileImageIntoData,
    normalizeHexColor,
    selectedProfileId,
    profileSwitchDialog.pendingProfileId,
    resumeText,
    setLoadedProfileSnapshot,
    upsertCvProfileInList
  ]);

  return {
    isCvIdModalOpen,
    cvIdInput,
    cvIdError,
    isSavingCvId,
    openCvIdModal,
    closeCvIdModal,
    handleCvIdInputChange,
    handleConfirmCvId,
    profileSwitchDialog,
    openProfileSwitchDialog,
    closeProfileSwitchDialog,
    handleSwitchWithoutSaving,
    handleSaveAndSwitchProfile
  };
}
