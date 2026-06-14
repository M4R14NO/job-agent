import { useCallback, useEffect, useRef, useState } from "react";
import { getCvProfile, parseCvCanonical, saveCvProfile } from "../api/llm";
import {
  buildCompanySuffixProfileId,
  buildNextVersionedProfileId,
  sanitizeProfileId
} from "../workflow/profiles/profileIdUtils";
import {
  contextFromProfile,
  contextSnapshotFromProfile
} from "../workflow/profiles/profileContextUtils";
import {
  buildCreateNewEntryPayload,
  buildRemapProfilePayload,
  buildUpdateApplicationProfilePayload,
  resolveRemapLineageFields
} from "../workflow/profiles/profilePayloadUtils";

export default function useProfileWorkflowController(options = {}) {
  const {
    identifiers = {},
    profileState = {},
    profileSetters = {},
    helpers = {},
    actions = {},
    refs = {}
  } = options;

  const {
    canonicalSchemaVersion,
    emptyApplicationContext
  } = identifiers;

  const {
    selectedProfileId,
    newProfileId,
    isDraftProfileActive,
    cvProfiles,
    cvTemplateId,
    cvOutputLanguage,
    resumeText,
    applicationContext,
    loadedProfileSnapshot,
    selectedModel,
    lmTimeout,
    activeView,
    activeJobAction,
    selectedJob,
    cvDraftState
  } = profileState;

  const {
    setSelectedProfileId,
    setNewProfileId,
    setIsDraftProfileActive,
    setDraftProfileId,
    setCvTemplateId,
    setResumeText,
    setApplicationContext,
    setLoadedProfileSnapshot,
    setCvEntryError,
    setCvReview,
    setCvPreviewPayload,
    setPdfPreviewUrl
  } = profileSetters;

  const {
    buildApplicationContextDiff,
    normalizeHexColor,
    mergeProfileImageIntoData
  } = helpers;

  const {
    clearCreatePreviewState,
    upsertCvProfileInList,
    handleStartCvEditor,
    preparePreviewForReview,
    activateCvReviewStep,
    activateCvBranchReview,
    openProfileSwitchDialog
  } = actions;

  const {
    pdfPreviewRequestVersionRef
  } = refs;

  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isUpdatingProfileCvText, setIsUpdatingProfileCvText] = useState(false);
  const [isRemappingProfileCvText, setIsRemappingProfileCvText] = useState(false);
  const [isCreatingProfileEntry, setIsCreatingProfileEntry] = useState(false);
  const [cvRemapElapsedMs, setCvRemapElapsedMs] = useState(0);
  const cvRemapTimerRef = useRef(null);

  useEffect(() => {
    if (!isRemappingProfileCvText) {
      setCvRemapElapsedMs(0);
      if (cvRemapTimerRef.current) {
        clearInterval(cvRemapTimerRef.current);
        cvRemapTimerRef.current = null;
      }
      return undefined;
    }
    const start = Date.now();
    setCvRemapElapsedMs(0);
    cvRemapTimerRef.current = setInterval(() => {
      setCvRemapElapsedMs(Date.now() - start);
    }, 500);
    return () => {
      if (cvRemapTimerRef.current) {
        clearInterval(cvRemapTimerRef.current);
        cvRemapTimerRef.current = null;
      }
    };
  }, [isRemappingProfileCvText]);

  const loadProfileIntoEditor = useCallback(async (profileId) => {
    if (!profileId) return;
    pdfPreviewRequestVersionRef.current += 1;
    setCvEntryError("");
    setIsLoadingProfile(true);
    try {
      const canonical = await getCvProfile(profileId);
      const nextTemplateId = canonical.template_id || "awesomecv";
      setIsDraftProfileActive(false);
      setDraftProfileId("");
      setSelectedProfileId(canonical.profile_id || profileId);
      setNewProfileId(canonical.profile_id || profileId);
      setCvTemplateId(nextTemplateId);
      setResumeText(canonical.audit?.raw_resume_text || "");
      setApplicationContext(contextFromProfile(canonical));
      setLoadedProfileSnapshot(contextSnapshotFromProfile(canonical));
      upsertCvProfileInList(canonical);
      handleStartCvEditor({
        canonical,
        templateId: nextTemplateId,
        initialProfileId: canonical.profile_id || profileId
      });
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setIsLoadingProfile(false);
    }
  }, [
    handleStartCvEditor,
    pdfPreviewRequestVersionRef,
    setApplicationContext,
    setCvEntryError,
    setCvTemplateId,
    setDraftProfileId,
    setIsDraftProfileActive,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setResumeText,
    setSelectedProfileId,
    upsertCvProfileInList
  ]);

  const handleProfileRowSelect = useCallback(async (profile) => {
    if (!profile?.profile_id) return;
    const nextProfileId = profile.profile_id;

    if (profile.__isDraftEntry) {
      setIsDraftProfileActive(true);
      setDraftProfileId(nextProfileId);
      setSelectedProfileId(nextProfileId);
      setCvEntryError("");
      clearCreatePreviewState();
      return;
    }

    if (nextProfileId === selectedProfileId) {
      await loadProfileIntoEditor(nextProfileId);
      return;
    }

    const contextDiff = buildApplicationContextDiff();
    const hasUnsavedChanges = cvDraftState.isDirty || contextDiff.hasChanges;

    if (hasUnsavedChanges) {
      const contextKeys = new Set([
        "raw_resume_text",
        "company",
        "application_status",
        "application_date",
        "job_title",
        "job_description",
        "job_url",
        "profile_image",
        "theme_color",
        "show_profile_image"
      ]);
      const combinedTopLevelChanges = [
        ...(cvDraftState.diff?.topLevelChanges || []).filter((change) => !contextKeys.has(change.key)),
        ...contextDiff.topLevelChanges
      ];
      const combinedSectionChanges = cvDraftState.diff?.sectionChanges || [];
      const combinedTotals = {
        added: (cvDraftState.diff?.totals?.added || 0),
        removed: (cvDraftState.diff?.totals?.removed || 0),
        updated: (cvDraftState.diff?.totals?.updated || 0) + contextDiff.totals.updated
      };
      openProfileSwitchDialog({
        pendingProfileId: nextProfileId,
        diff: {
          targetProfileId: cvDraftState.targetProfileId || selectedProfileId,
          existingRevision: loadedProfileSnapshot.revision || cvDraftState.revision || 0,
          existingUpdatedAt: loadedProfileSnapshot.updated_at || cvDraftState.updatedAt || null,
          topLevelChanges: combinedTopLevelChanges,
          sectionChanges: combinedSectionChanges,
          totals: combinedTotals
        }
      });
      return;
    }

    await loadProfileIntoEditor(nextProfileId);
  }, [
    buildApplicationContextDiff,
    clearCreatePreviewState,
    cvDraftState.diff,
    cvDraftState.isDirty,
    cvDraftState.revision,
    cvDraftState.targetProfileId,
    loadProfileIntoEditor,
    loadedProfileSnapshot.revision,
    loadedProfileSnapshot.updated_at,
    openProfileSwitchDialog,
    selectedProfileId,
    setCvEntryError,
    setDraftProfileId,
    setIsDraftProfileActive,
    setSelectedProfileId
  ]);

  const handleUpdateApplicationProfileData = useCallback(async () => {
    const hasPersistedSelectedProfile = cvProfiles.some((profile) => profile.profile_id === selectedProfileId);
    const targetProfileId = hasPersistedSelectedProfile
      ? selectedProfileId
      : sanitizeProfileId(newProfileId || "");
    if (!targetProfileId) {
      setCvEntryError("Choose a profile ID before saving profile data.");
      return;
    }

    setCvEntryError("");
    setIsUpdatingProfileCvText(true);
    try {
      let existing = null;
      try {
        existing = await getCvProfile(targetProfileId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("status 404")) throw err;
      }

      const isCreate = !existing;
      const payload = buildUpdateApplicationProfilePayload({
        existing,
        targetProfileId,
        cvTemplateId,
        canonicalSchemaVersion: canonicalSchemaVersion,
        applicationContext,
        resumeText,
        normalizeHexColorFn: normalizeHexColor,
        mergeProfileImageIntoDataFn: mergeProfileImageIntoData
      });
      const saved = await saveCvProfile(targetProfileId, payload);
      upsertCvProfileInList(saved);
      setResumeText(saved.audit?.raw_resume_text || "");
      setApplicationContext(contextFromProfile(saved));
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      setSelectedProfileId(saved.profile_id);
      setNewProfileId(saved.profile_id);
      setCvEntryError(isCreate
        ? `Profile '${saved.profile_id}' saved.`
        : `Profile '${saved.profile_id}' saved (revision ${saved.revision}).`);
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to update application profile data");
    } finally {
      setIsUpdatingProfileCvText(false);
    }
  }, [
    applicationContext,
    canonicalSchemaVersion,
    cvProfiles,
    cvTemplateId,
    mergeProfileImageIntoData,
    newProfileId,
    normalizeHexColor,
    resumeText,
    selectedProfileId,
    setApplicationContext,
    setCvEntryError,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setResumeText,
    setSelectedProfileId,
    upsertCvProfileInList
  ]);

  const handleRemapProfileCvText = useCallback(async ({ targetProfileId, allowOverwrite } = {}) => {
    if (!selectedProfileId && !isDraftProfileActive) {
      setCvEntryError("Select a profile or create a new entry before tailoring.");
      return;
    }
    if (!selectedModel) {
      setCvEntryError("Select a model before remapping.");
      return;
    }
    if (!resumeText.trim()) {
      setCvEntryError("CV text is required to remap.");
      return;
    }

    setCvEntryError("");
    setIsRemappingProfileCvText(true);
    try {
      const hasPersistedSelectedProfile = cvProfiles.some((profile) => profile.profile_id === selectedProfileId);
      let existing = null;
      if (hasPersistedSelectedProfile) {
        existing = await getCvProfile(selectedProfileId);
      }

      const requestedProfileId = String(targetProfileId || "").trim();
      const isJobWorkflow = activeView === "find" && activeJobAction === "cv" && Boolean(selectedJob);
      const fallbackProfileId = hasPersistedSelectedProfile
        ? (isJobWorkflow
          ? buildCompanySuffixProfileId({
            baseId: selectedProfileId,
            company: selectedJob?.company || applicationContext.company || "company"
          })
          : buildNextVersionedProfileId({
            profileId: selectedProfileId,
            existingIds: cvProfiles.map((profile) => profile.profile_id)
          }))
        : newProfileId.trim();
      const nextProfileId = sanitizeProfileId(requestedProfileId || fallbackProfileId);

      if (!hasPersistedSelectedProfile && !(requestedProfileId || fallbackProfileId)) {
        throw new Error("Profile name is required for a new entry.");
      }

      let existingTarget = null;
      try {
        existingTarget = await getCvProfile(nextProfileId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("status 404")) throw err;
      }

      if (existingTarget && !allowOverwrite) {
        throw new Error("Target profile already exists. Choose a different name or confirm overwrite.");
      }

      const lineageFields = resolveRemapLineageFields({
        existingTarget,
        existing,
        nextProfileId,
        isJobWorkflow,
        sanitizeProfileIdFn: sanitizeProfileId
      });

      const effectiveJobTitle = applicationContext.job_title || existing?.job_title || existing?.audit?.final_template_payload?.job_title || "";
      const effectiveCompany = applicationContext.company || existing?.company || "";
      const effectiveJobDescription = applicationContext.job_description || existing?.job_description || "";
      const effectiveJobUrl = applicationContext.job_url || existing?.job_url || "";

      const parsed = await parseCvCanonical({
        resume_text: resumeText,
        model: selectedModel,
        lm_timeout: lmTimeout,
        output_language: cvOutputLanguage,
        job_title: effectiveJobTitle || undefined,
        company: effectiveCompany || undefined,
        job_description: effectiveJobDescription || undefined,
        job_url: effectiveJobUrl || undefined
      });
      const payload = buildRemapProfilePayload({
        parsed,
        existing,
        existingTarget,
        nextProfileId,
        cvTemplateId,
        applicationContext,
        resumeText,
        effectiveJobTitle,
        effectiveCompany,
        effectiveJobDescription,
        effectiveJobUrl,
        lineageFields,
        normalizeHexColorFn: normalizeHexColor,
        mergeProfileImageIntoDataFn: mergeProfileImageIntoData
      });
      const saved = await saveCvProfile(nextProfileId, payload);
      upsertCvProfileInList(saved);
      setSelectedProfileId(saved.profile_id);
      setIsDraftProfileActive(false);
      setDraftProfileId("");
      setNewProfileId(saved.profile_id);
      setCvTemplateId(saved.template_id || "awesomecv");
      setApplicationContext(contextFromProfile(saved));
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      if (isJobWorkflow && selectedJob) {
        pdfPreviewRequestVersionRef.current += 1;
        setCvReview({
          canonical: saved,
          job: selectedJob,
          templateId: saved.template_id || "awesomecv",
          docType: "resume",
          outputLanguage: cvOutputLanguage
        });
        activateCvReviewStep("branch-review");
        setCvPreviewPayload(null);
        setPdfPreviewUrl(null);
        preparePreviewForReview(saved.template_id || "awesomecv");
      } else {
        handleStartCvEditor({
          canonical: saved,
          templateId: saved.template_id || "awesomecv",
          initialProfileId: saved.profile_id
        });
      }
      setCvEntryError(existingTarget
        ? `Updated '${saved.profile_id}' with a newly tailored profile mapping.`
        : `Created '${saved.profile_id}' from remapped CV text.`);
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to remap CV text");
    } finally {
      setIsRemappingProfileCvText(false);
    }
  }, [
    activeJobAction,
    activeView,
    applicationContext,
    cvOutputLanguage,
    cvProfiles,
    cvTemplateId,
    handleStartCvEditor,
    isDraftProfileActive,
    lmTimeout,
    mergeProfileImageIntoData,
    newProfileId,
    normalizeHexColor,
    pdfPreviewRequestVersionRef,
    preparePreviewForReview,
    resumeText,
    selectedJob,
    selectedModel,
    selectedProfileId,
    setApplicationContext,
    setCvEntryError,
    setCvPreviewPayload,
    setCvReview,
    setCvTemplateId,
    setDraftProfileId,
    setIsDraftProfileActive,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setPdfPreviewUrl,
    setSelectedProfileId,
    upsertCvProfileInList,
    activateCvReviewStep
  ]);

  const handleCreateNewEntry = useCallback(async ({ profileName } = {}) => {
    const nextProfileId = sanitizeProfileId(profileName || "");
    if (!nextProfileId) {
      throw new Error("Profile name is required.");
    }
    const duplicate = cvProfiles.some((profile) => profile.profile_id === nextProfileId);
    if (duplicate) {
      throw new Error("Profile name already exists. Please choose another one.");
    }

    setIsCreatingProfileEntry(true);
    setCvEntryError("");
    clearCreatePreviewState();
    try {
      const payload = buildCreateNewEntryPayload({
        nextProfileId,
        cvTemplateId,
        canonicalSchemaVersion: canonicalSchemaVersion,
        applicationContext,
        resumeText,
        normalizeHexColorFn: normalizeHexColor,
        mergeProfileImageIntoDataFn: mergeProfileImageIntoData
      });
      const saved = await saveCvProfile(nextProfileId, payload);
      upsertCvProfileInList(saved);
      setSelectedProfileId(saved.profile_id);
      setIsDraftProfileActive(false);
      setDraftProfileId("");
      setNewProfileId(saved.profile_id);
      setCvTemplateId(saved.template_id || "awesomecv");
      setApplicationContext(contextFromProfile(saved));
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      setCvEntryError(`Created profile '${saved.profile_id}'.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create profile";
      setCvEntryError(message);
      throw new Error(message);
    } finally {
      setIsCreatingProfileEntry(false);
    }
  }, [
    applicationContext,
    canonicalSchemaVersion,
    clearCreatePreviewState,
    cvProfiles,
    cvTemplateId,
    mergeProfileImageIntoData,
    normalizeHexColor,
    resumeText,
    setApplicationContext,
    setCvEntryError,
    setCvTemplateId,
    setDraftProfileId,
    setIsDraftProfileActive,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setSelectedProfileId,
    upsertCvProfileInList
  ]);

  const handleBeginNewEntry = useCallback(() => {
    clearCreatePreviewState();
    setSelectedProfileId("");
    setDraftProfileId("");
    setIsDraftProfileActive(false);
    setApplicationContext({ ...emptyApplicationContext });
    setResumeText("");
    setLoadedProfileSnapshot({
      profile_id: "",
      revision: 0,
      updated_at: null,
      raw_resume_text: "",
      ...emptyApplicationContext
    });
    setCvTemplateId("awesomecv");
    setNewProfileId("");
    setCvEntryError("");
  }, [
    clearCreatePreviewState,
    emptyApplicationContext,
    setApplicationContext,
    setCvEntryError,
    setCvTemplateId,
    setDraftProfileId,
    setIsDraftProfileActive,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setResumeText,
    setSelectedProfileId
  ]);

  const loadProfileIntoJobCvContext = useCallback(async (profileId) => {
    if (!profileId || !selectedJob) return;
    setCvEntryError("");
    setIsLoadingProfile(true);
    try {
      const canonical = await getCvProfile(profileId);
      const nextTemplateId = canonical.template_id || "awesomecv";
      const nextSuggestedId = buildCompanySuffixProfileId({
        baseId: canonical.profile_id || profileId,
        company: selectedJob.company || applicationContext.company || "company"
      });
      setSelectedProfileId(canonical.profile_id || profileId);
      setCvTemplateId(nextTemplateId);
      setResumeText(canonical.audit?.raw_resume_text || "");
      setApplicationContext({
        ...contextFromProfile(canonical),
        company: selectedJob.company || "",
        application_status: "",
        application_date: "",
        job_title: selectedJob.title || "",
        job_description: selectedJob.description || "",
        job_url: selectedJob.job_url || ""
      });
      setLoadedProfileSnapshot(contextSnapshotFromProfile(canonical));
      setNewProfileId(nextSuggestedId);
      upsertCvProfileInList(canonical);
      setCvReview({
        canonical,
        job: selectedJob,
        templateId: nextTemplateId,
        docType: "resume",
        outputLanguage: cvOutputLanguage
      });
      activateCvBranchReview();
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setIsLoadingProfile(false);
    }
  }, [
    activateCvBranchReview,
    applicationContext.company,
    cvOutputLanguage,
    selectedJob,
    setApplicationContext,
    setCvEntryError,
    setCvReview,
    setCvTemplateId,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setResumeText,
    setSelectedProfileId,
    upsertCvProfileInList
  ]);

  return {
    isLoadingProfile,
    isUpdatingProfileCvText,
    isRemappingProfileCvText,
    isCreatingProfileEntry,
    cvRemapElapsedMs,
    loadProfileIntoEditor,
    handleProfileRowSelect,
    handleUpdateApplicationProfileData,
    handleRemapProfileCvText,
    handleCreateNewEntry,
    handleBeginNewEntry,
    loadProfileIntoJobCvContext
  };
}
