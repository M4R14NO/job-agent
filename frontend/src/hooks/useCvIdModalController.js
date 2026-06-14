import { useCallback, useEffect, useState } from "react";

export default function useCvIdModalController(options = {}) {
  const {
    cvProfiles,
    saveCvProfile,
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
    handleNewbieDraftReadyRef
  } = options;

  const [pendingNewbieDraft, setPendingNewbieDraft] = useState(null);
  const [isCvIdModalOpen, setIsCvIdModalOpen] = useState(false);
  const [cvIdInput, setCvIdInput] = useState("");
  const [cvIdError, setCvIdError] = useState("");
  const [isSavingCvId, setIsSavingCvId] = useState(false);

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
    saveCvProfile,
    setApplicationContext,
    setAutosaveSnapshotFromPayloadRef,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setPendingPreviewSaveCount,
    setSelectedProfileId,
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
    handleConfirmCvId
  };
}
