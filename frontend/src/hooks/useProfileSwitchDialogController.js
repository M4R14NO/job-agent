import { useCallback, useState } from "react";

export default function useProfileSwitchDialogController(options = {}) {
  const {
    selectedProfileId,
    cvDraftState,
    resumeText,
    applicationContext,
    normalizeHexColor,
    mergeProfileImageIntoData,
    getCvProfile,
    saveCvProfile,
    buildSaveAndSwitchPayload,
    contextSnapshotFromProfile,
    setLoadedProfileSnapshot,
    upsertCvProfileInList,
    loadProfileIntoEditor
  } = options;

  const [profileSwitchDialog, setProfileSwitchDialog] = useState({
    isOpen: false,
    pendingProfileId: "",
    isBusy: false,
    error: "",
    diff: null
  });

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
    const currentProfileId = cvDraftState.targetProfileId || selectedProfileId;
    if (!currentProfileId) {
      setProfileSwitchDialog((prev) => ({ ...prev, error: "No selected profile to save." }));
      return;
    }

    setProfileSwitchDialog((prev) => ({ ...prev, isBusy: true, error: "" }));
    try {
      let existing = null;
      try {
        existing = await getCvProfile(currentProfileId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("status 404")) throw err;
      }

      if (!existing) {
        throw new Error("Current profile could not be loaded for saving.");
      }

      const basePayload = cvDraftState.payload || {
        schema_version: existing.schema_version,
        profile_id: currentProfileId,
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
        currentProfileId,
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
    getCvProfile,
    loadProfileIntoEditor,
    mergeProfileImageIntoData,
    normalizeHexColor,
    profileSwitchDialog.pendingProfileId,
    resumeText,
    saveCvProfile,
    setLoadedProfileSnapshot,
    selectedProfileId,
    upsertCvProfileInList
  ]);

  return {
    profileSwitchDialog,
    openProfileSwitchDialog,
    closeProfileSwitchDialog,
    handleSwitchWithoutSaving,
    handleSaveAndSwitchProfile
  };
}
