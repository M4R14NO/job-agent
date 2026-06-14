import { useEffect, useRef, useState } from "react";
import {
  getCvProfile,
  renderCvFromTemplate,
  uploadCvProfileImage
} from "./api/llm";
import useCvProfilesController from "./hooks/useCvProfilesController";
import { useJobDescription } from "./hooks/useJobDescription";
import useCreateCvWorkflowController from "./hooks/useCreateCvWorkflowController";
import useCvDialogsController from "./hooks/useCvDialogsController";
import useLayoutInteractionsController from "./hooks/useLayoutInteractionsController";
import useProfileWorkflowController from "./hooks/useProfileWorkflowController";
import useSearchWorkflowController from "./hooks/useSearchWorkflowController";
import useW1CvWorkflowStateMachine from "./hooks/useW1CvWorkflowStateMachine";
import {
  buildCompanySuffixProfileId,
  buildCvIdSuggestion,
  sanitizeProfileId
} from "./workflow/profiles/profileIdUtils";
import {
  buildProfileApplicationContextDiff,
  contextFromProfile,
  contextSnapshotFromProfile
} from "./workflow/profiles/profileContextUtils";
import { buildSaveAndSwitchPayload } from "./workflow/profiles/profilePayloadUtils";
import SearchFilters from "./components/SearchFilters";
import CreateCvView from "./components/CreateCvView";
import JobSearchCreateCvWorkflowView from "./components/workflows/JobSearchCreateCvWorkflowView";
import FindJobsView from "./components/FindJobsView";
import CvIdModal from "./components/CvIdModal";
import OverwriteConfirmationModal from "./components/OverwriteConfirmationModal";
import { Box, Grid, GridItem } from "@chakra-ui/react";

const SIDEBAR_WIDTH_KEY = "job-agent:sidebar-width";
const SIDEBAR_MIN_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 720;
const REVIEW_PREVIEW_MIN_WIDTH = 360;
const REVIEW_EDITOR_MIN_WIDTH = 420;
const REVIEW_SPLITTER_WIDTH = 14;
const CANONICAL_SCHEMA_VERSION = "v1";
const DEFAULT_TEMPLATE_THEME_COLORS = {
  awesomecv: "#C0392B",
  hipstercv: "#496E8C"
};

const normalizeHexColor = (value, fallback = null) => {
  const raw = String(value || "").trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return fallback;
  return `#${match[1].toUpperCase()}`;
};

const mergeProfileImageIntoData = (data, profileImage) => {
  const base = data && typeof data === "object" ? data : {};
  return {
    ...base,
    profile_image: (profileImage || "").trim() || null
  };
};

const EMPTY_APPLICATION_CONTEXT = {
  company: "",
  application_status: "",
  application_date: "",
  job_title: "",
  job_description: "",
  job_url: "",
  profile_image: "",
  theme_color: "",
  show_profile_image: true,
  header_text_align: "right",
  header_title_size: "Huge",
  header_subtitle_size: "Large"
};

const createEmptyLoadedProfileSnapshot = () => ({
  profile_id: "",
  revision: 0,
  updated_at: null,
  raw_resume_text: "",
  ...EMPTY_APPLICATION_CONTEXT
});

export default function App() {
  const [resumeText, setResumeText] = useState("");
  const [wishes, setWishes] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [cvReview, setCvReview] = useState(null);
  const [cvProfiles, setCvProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draftProfileId, setDraftProfileId] = useState("");
  const [isDraftProfileActive, setIsDraftProfileActive] = useState(false);
  const [newProfileId, setNewProfileId] = useState("default");
  const [cvTemplateId, setCvTemplateId] = useState("awesomecv");
  const [cvOutputLanguage, setCvOutputLanguage] = useState("english");
  const [cvEntryError, setCvEntryError] = useState("");
  const [applicationContext, setApplicationContext] = useState(EMPTY_APPLICATION_CONTEXT);
  const [loadedProfileSnapshot, setLoadedProfileSnapshot] = useState(createEmptyLoadedProfileSnapshot);
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [cvDraftState, setCvDraftState] = useState({
    isDirty: false,
    diff: null,
    payload: null,
    sourceProfileId: "",
    targetProfileId: "",
    revision: 0,
    updatedAt: null
  });
  const [activeView, setActiveView] = useState("find");
  const [createMode, setCreateMode] = useState("newbie");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [cvPreviewPayload, setCvPreviewPayload] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [pendingPreviewSaveCount, setPendingPreviewSaveCount] = useState(0);
  const [cvThemeColors, setCvThemeColors] = useState(DEFAULT_TEMPLATE_THEME_COLORS);

  const pdfPreviewRequestVersionRef = useRef(0);
  const clearPreviewTrackingRef = useRef(null);
  const clearCreatePreviewStateRef = useRef(null);
  const cvDraftHashRef = useRef("");
  const handleNewbieDraftReadyRef = useRef(null);
  const loadProfileIntoEditorRef = useRef(async () => {});
  const setAutosaveSnapshotFromPayloadRef = useRef(() => {});

  const {
    activeJobAction,
    jobCvEntryStep,
    setActiveJobAction,
    initializeJobCvContext,
    handleSelectJob,
    handleChooseCreateJobCv,
    handleChooseBranchJobCv,
    handleBackToResults,
    handleSetView,
    handleSwitchJobAction,
    activateCvReviewStep,
    activateCvBranchReview
  } = useW1CvWorkflowStateMachine({
    selectedJob,
    emptyApplicationContext: EMPTY_APPLICATION_CONTEXT,
    createEmptyLoadedProfileSnapshot,
    pdfPreviewRequestVersionRef,
    clearPreviewTrackingRef,
    clearCreatePreviewStateRef,
    setSelectedJob,
    setCvReview,
    setActiveView,
    setCvPreviewPayload,
    setPdfPreviewUrl,
    setCvEntryError,
    setNewProfileId,
    setApplicationContext,
    setSelectedProfileId,
    setLoadedProfileSnapshot,
    setResumeText,
    setIsDraftProfileActive,
    setDraftProfileId,
    setIsSidebarOpen
  });

  const {
    models,
    modelError,
    selectedModel,
    setSelectedModel,
    lmTimeout,
    setLmTimeout,
    response,
    error,
    isLoading,
    searchElapsedMs,
    searchPhaseMessage,
    isReranking,
    cachedResponse,
    cachedAt,
    rerankProfileError,
    searchTerm,
    setSearchTerm,
    location,
    setLocation,
    searchRadiusKm,
    setSearchRadiusKm,
    resultsWanted,
    setResultsWanted,
    hoursOld,
    setHoursOld,
    isRemote,
    setIsRemote,
    enableRerank,
    setEnableRerank,
    rerankTopN,
    setRerankTopN,
    weightEmbedding,
    setWeightEmbedding,
    weightKeyword,
    setWeightKeyword,
    selectedRerankProfileId,
    syncRerankProfileSelection,
    handleProfilesDeletedFromSearch,
    handleSearch,
    handleRunRerank,
    handleSelectRerankProfile,
    handleLoadCache,
    handleClearCache
  } = useSearchWorkflowController({
    resumeText,
    wishes,
    setResumeText,
    setWishes,
    loadRerankProfile: async (profileId) => {
      const listedProfile = cvProfiles.find((profile) => profile.profile_id === profileId);
      return listedProfile || getCvProfile(profileId);
    },
    onLoadCacheApplied: () => setSelectedJob(null)
  });

  const jobs = response?.jobs ?? [];
  const descriptionHtml = useJobDescription(selectedJob);
  const isFindView = activeView === "find";
  const isNewbieCreateMode = activeView === "create" && createMode === "newbie";
  const isW1CvWorkflow = Boolean(selectedJob) && activeJobAction === "cv";
  const isJobCvChoiceStep = isW1CvWorkflow && jobCvEntryStep === "choice";
  const isJobCvCreateStep = isW1CvWorkflow && jobCvEntryStep === "create";
  const isJobCvBranchReviewStep = isW1CvWorkflow && jobCvEntryStep === "branch-review";
  const isCreateWorkflowMode = isNewbieCreateMode || isJobCvCreateStep || isJobCvBranchReviewStep;
  const isJobCvBranchStep = isW1CvWorkflow && jobCvEntryStep === "branch";
  const w1HasCvText = isW1CvWorkflow && Boolean(resumeText.trim());
  const isW1WizardReviewLayout = Boolean(selectedJob) && (isJobCvCreateStep || isJobCvBranchReviewStep);
  const showW1TailorAction = !isW1CvWorkflow || w1HasCvText;

  const {
    sidebarWidth,
    reviewLayoutRef,
    reviewSectionRef,
    createReviewLayoutRef,
    createReviewSectionRef,
    reviewLayoutStyle,
    createReviewLayoutStyle,
    handleSidebarResizeStart,
    handleReviewResizeStart,
    handleCreateReviewResizeStart
  } = useLayoutInteractionsController({
    isFindView,
    activeView,
    isW1WizardReviewLayout,
    sidebarWidthKey: SIDEBAR_WIDTH_KEY,
    sidebarMinWidth: SIDEBAR_MIN_WIDTH,
    sidebarMaxWidth: SIDEBAR_MAX_WIDTH,
    reviewPreviewMinWidth: REVIEW_PREVIEW_MIN_WIDTH,
    reviewEditorMinWidth: REVIEW_EDITOR_MIN_WIDTH,
    reviewSplitterWidth: REVIEW_SPLITTER_WIDTH
  });

  const resolveTemplateThemeColor = (templateId) => {
    const key = templateId || "awesomecv";
    const fallback = DEFAULT_TEMPLATE_THEME_COLORS[key] || DEFAULT_TEMPLATE_THEME_COLORS.awesomecv;
    const fromProfile = normalizeHexColor(applicationContext?.theme_color, null);
    return fromProfile || normalizeHexColor(cvThemeColors[key], fallback);
  };

  const applyTemplateThemeToPayload = (payload, templateId) => {
    const key = templateId || "awesomecv";
    const color = resolveTemplateThemeColor(key);
    if (!payload || !color) return payload;
    const hex = color.replace("#", "");
    if (key === "hipstercv") {
      return {
        ...payload,
        accent_color_hex: hex,
        show_profile_image: applicationContext?.show_profile_image !== false,
        header_text_align: applicationContext?.header_text_align || "right",
        header_title_size: applicationContext?.header_title_size || "Huge",
        header_subtitle_size: applicationContext?.header_subtitle_size || "Large"
      };
    }
    if (key === "awesomecv") {
      return {
        ...payload,
        awesome_color_hex: hex,
        show_profile_image: applicationContext?.show_profile_image !== false
      };
    }
    return {
      ...payload,
      show_profile_image: applicationContext?.show_profile_image !== false
    };
  };

  const defaultRerankTopN = (() => {
    const total = response?.jobs?.length ?? resultsWanted;
    if (!total) return null;
    const cap = Math.min(total, resultsWanted);
    return Math.max(3, Math.ceil(0.4 * cap));
  })();

  const lmTimeoutMinutes = Math.max(0.5, Math.round((lmTimeout / 60) * 10) / 10);
  const rerankTarget = rerankTopN ?? defaultRerankTopN ?? 0;
  const refinementIsActive = isReranking;
  const baseTokenEstimate = (() => {
    const text = `${resumeText} ${wishes}`.trim();
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  })();
  const estimatedRefinementTokens = baseTokenEstimate + (rerankTarget * 280);
  const refinementProgress = (() => {
    if (!refinementIsActive || !lmTimeout || estimatedRefinementTokens <= 0) return null;
    const timeoutMs = Math.max(1, lmTimeout * 1000);
    const ratio = Math.min(searchElapsedMs / timeoutMs, 1);
    return {
      percent: Math.round(ratio * 100),
      currentTokens: Math.min(estimatedRefinementTokens, Math.round(estimatedRefinementTokens * ratio)),
      totalTokens: estimatedRefinementTokens,
      elapsedSeconds: Math.round(searchElapsedMs / 1000),
      timeoutSeconds: lmTimeout
    };
  })();

  const remapTokenEstimate = (() => {
    const text = `${resumeText}`.trim();
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4)) + 280;
  })();

  const {
    profilesError,
    profilesLoading,
    isProfileBulkActionBusy,
    loadProfiles,
    handleDeleteProfiles,
    handleExportProfiles,
    handleImportProfiles
  } = useCvProfilesController({
    setCvProfiles,
    selectedProfileId,
    setSelectedProfileId,
    syncRerankProfileSelection,
    handleProfilesDeletedFromSearch,
    setCvEntryError,
    canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
    onDeletedActiveProfile: () => {
      clearCreatePreviewState();
      setSelectedProfileId("");
      setDraftProfileId("");
      setIsDraftProfileActive(false);
      setNewProfileId("");
      setResumeText("");
      setApplicationContext({ ...EMPTY_APPLICATION_CONTEXT });
      setLoadedProfileSnapshot(createEmptyLoadedProfileSnapshot());
    }
  });

  const handleCvReviewProfileSaved = async (savedProfile) => {
    const savedProfileId = savedProfile?.profile_id || "";
    if (!savedProfileId) return;
    setSelectedProfileId(savedProfileId);
    setNewProfileId(savedProfileId);
    setCvReview((prev) => (prev ? { ...prev, canonical: savedProfile, templateId: savedProfile.template_id || prev.templateId } : prev));
    setLoadedProfileSnapshot(contextSnapshotFromProfile(savedProfile));
    upsertCvProfileInList(savedProfile);
    syncAutosaveSnapshotFromCurrentPayload();
    await loadProfiles(savedProfileId);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const buildApplicationContextDiff = () => buildProfileApplicationContextDiff({
    resumeText,
    applicationContext,
    loadedProfileSnapshot
  });

  useEffect(() => {
    if (activeView === "create") {
      loadProfiles();
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView === "find" && cvProfiles.length === 0 && !profilesLoading) {
      loadProfiles();
    }
  }, [activeView, cvProfiles.length, profilesLoading]);

  const handleStartCvReview = ({ canonical, job, templateId, docType, outputLanguage }) => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview({ canonical, job, templateId, docType, outputLanguage });
    activateCvBranchReview();
    setApplicationContext({
      company: job?.company || "",
      application_status: "",
      application_date: "",
      job_title: job?.title || "",
      job_description: job?.description || "",
      job_url: job?.job_url || "",
      profile_image: "",
      theme_color: "",
      show_profile_image: true,
      header_text_align: "right",
      header_title_size: "Huge",
      header_subtitle_size: "Large"
    });
    setSelectedJob(job);
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    preparePreviewForReview(templateId);
  };

  const handleUpdatePdfPreview = async () => {
    if (!cvPreviewPayload || !cvReview) return;
    const requestVersion = ++pdfPreviewRequestVersionRef.current;
    const activeProfileId = cvReview?.canonical?.profile_id || cvReview?.initialProfileId || "default";
    if (cvPreviewPayload.__source_profile_id && cvPreviewPayload.__source_profile_id !== activeProfileId) {
      return;
    }
    const { __source_profile_id, ...templatePayload } = cvPreviewPayload;
    const themedPayload = applyTemplateThemeToPayload(templatePayload, cvReview.templateId || "awesomecv");
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    setIsPdfGenerating(true);
    try {
      const { blob } = await renderCvFromTemplate({
        payload: themedPayload,
        template_id: cvReview.templateId || "awesomecv",
        doc_type: cvReview.docType || "resume"
      });
      const url = URL.createObjectURL(blob);
      if (requestVersion !== pdfPreviewRequestVersionRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setPdfPreviewUrl(url);
      setPendingPreviewSaveCount(0);
    } catch (err) {
      // silently fail — error is visible in CvReview
    } finally {
      if (requestVersion === pdfPreviewRequestVersionRef.current) {
        setIsPdfGenerating(false);
      }
    }
  };

  const handleDownloadPdf = async () => {
    if (!cvPreviewPayload || !cvReview) return;
    const activeProfileId = cvReview?.canonical?.profile_id || cvReview?.initialProfileId || "default";
    if (cvPreviewPayload.__source_profile_id && cvPreviewPayload.__source_profile_id !== activeProfileId) {
      return;
    }
    const { __source_profile_id, ...templatePayload } = cvPreviewPayload;
    const themedPayload = applyTemplateThemeToPayload(templatePayload, cvReview.templateId || "awesomecv");
    setIsPdfDownloading(true);
    try {
      const { blob, filename } = await renderCvFromTemplate({
        payload: themedPayload,
        template_id: cvReview.templateId || "awesomecv",
        doc_type: cvReview.docType || "resume"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (_err) {
      // intentional no-op; errors visible in CvReview
    } finally {
      setIsPdfDownloading(false);
    }
  };

  const handleStartCvEditor = ({ canonical, templateId, initialProfileId }) => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview({
      canonical,
      job: { title: "", company: "", description: "", job_url: "" },
      templateId: templateId || cvTemplateId,
      docType: "cv",
      outputLanguage: cvOutputLanguage,
      initialProfileId: initialProfileId || canonical?.profile_id || "default"
    });
    setSelectedJob(null);
    setActiveView("create");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    preparePreviewForReview(templateId || cvTemplateId || "awesomecv");
  };

  const clearCreatePreviewState = () => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview(null);
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    setPendingPreviewSaveCount(0);
    clearPreviewTracking();
  };
  clearCreatePreviewStateRef.current = clearCreatePreviewState;

  const handleNewbieDraftReady = ({ canonical, templateId, outputLanguage, jobContext }) => {
    pdfPreviewRequestVersionRef.current += 1;
    requestOneTimeCreatePreviewRender();
    setCvReview({
      canonical,
      job: {
        title: jobContext?.job_title || "",
        company: jobContext?.company || "",
        description: jobContext?.job_description || "",
        job_url: jobContext?.job_url || ""
      },
      templateId: templateId || "awesomecv",
      docType: "resume",
      outputLanguage: outputLanguage || "english",
      initialProfileId: canonical?.profile_id || "default"
    });
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    preparePreviewForReview(templateId);
  };

  const handleNewbieDraftGenerated = ({ canonical, templateId, outputLanguage, jobContext }) => {
    handleNewbieDraftReady({ canonical, templateId, outputLanguage, jobContext });
    openCvIdModal({ canonical, templateId, outputLanguage, jobContext });
  };

  const handleBranchDraftGenerated = ({ canonical, templateId, outputLanguage, jobContext }) => {
    handleNewbieDraftReady({ canonical, templateId, outputLanguage, jobContext });
    activateCvBranchReview();
  };

  const buildNewbieDraftPayload = ({ canonical, templateId, outputLanguage, jobContext }, profileId) => {
    const nextTemplateId = templateId || canonical?.template_id || "awesomecv";
    return {
      ...canonical,
      profile_id: profileId,
      revision: canonical?.revision ?? 0,
      template_id: nextTemplateId,
      company: jobContext?.company || canonical?.company || null,
      application_status: canonical?.application_status || null,
      application_date: canonical?.application_date || null,
      job_title: jobContext?.job_title || canonical?.job_title || null,
      job_description: jobContext?.job_description || canonical?.job_description || null,
      job_url: jobContext?.job_url || canonical?.job_url || null,
      theme_color: normalizeHexColor(applicationContext.theme_color, null),
      show_profile_image: applicationContext.show_profile_image !== false,
      header_text_align: applicationContext.header_text_align || "right",
      header_title_size: applicationContext.header_title_size || "Huge",
      header_subtitle_size: applicationContext.header_subtitle_size || "Large",
      audit: {
        ...(canonical?.audit || {}),
        raw_resume_text: resumeText,
        output_language: outputLanguage || "english"
      },
      data: mergeProfileImageIntoData(canonical?.data || {}, applicationContext.profile_image)
    };
  };

  const upsertCvProfileInList = (profile) => {
    setCvProfiles((prev) => {
      const index = prev.findIndex((item) => item.profile_id === profile.profile_id);
      if (index === -1) return [profile, ...prev];
      const next = [...prev];
      next[index] = profile;
      return next;
    });
  };

  handleNewbieDraftReadyRef.current = handleNewbieDraftReady;

  const {
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
  } = useCvDialogsController({
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
    selectedProfileId,
    cvDraftState,
    resumeText,
    applicationContext,
    normalizeHexColor,
    mergeProfileImageIntoData,
    buildSaveAndSwitchPayload,
    loadProfileIntoEditor: async (profileId) => {
      await loadProfileIntoEditorRef.current(profileId);
    }
  });

  const {
    clearPreviewTracking,
    handleCreateStepLeave,
    preparePreviewForReview,
    requestOneTimeCreatePreviewRender,
    setAutosaveSnapshotFromPayload,
    syncAutosaveSnapshotFromCurrentPayload
  } = useCreateCvWorkflowController({
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
    setCvDraftState
  });
  clearPreviewTrackingRef.current = clearPreviewTracking;
  setAutosaveSnapshotFromPayloadRef.current = setAutosaveSnapshotFromPayload;

  const {
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
  } = useProfileWorkflowController({
    identifiers: {
      canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
      emptyApplicationContext: EMPTY_APPLICATION_CONTEXT
    },
    profileState: {
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
    },
    profileSetters: {
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
    },
    helpers: {
      buildApplicationContextDiff,
      normalizeHexColor,
      mergeProfileImageIntoData
    },
    actions: {
      clearCreatePreviewState,
      upsertCvProfileInList,
      handleStartCvEditor,
      preparePreviewForReview,
      activateCvReviewStep,
      activateCvBranchReview,
      openProfileSwitchDialog
    },
    refs: {
      pdfPreviewRequestVersionRef
    }
  });

  loadProfileIntoEditorRef.current = loadProfileIntoEditor;

  const cvRemapProgress = (() => {
    if (!isRemappingProfileCvText || !lmTimeout || remapTokenEstimate <= 0) return null;
    const timeoutMs = Math.max(1, lmTimeout * 1000);
    const ratio = Math.min(cvRemapElapsedMs / timeoutMs, 1);
    return {
      percent: Math.round(ratio * 100),
      currentTokens: Math.min(remapTokenEstimate, Math.round(remapTokenEstimate * ratio)),
      totalTokens: remapTokenEstimate,
      elapsedSeconds: Math.round(cvRemapElapsedMs / 1000),
      timeoutSeconds: lmTimeout
    };
  })();

  const handleTemplateIdChange = (nextTemplateId) => {
    setCvTemplateId(nextTemplateId);
    setCvReview((prev) => (prev ? { ...prev, templateId: nextTemplateId } : prev));
  };

  const handleThemeColorChange = (nextColor) => {
    const activeTemplateId = cvReview?.templateId || cvTemplateId || "awesomecv";
    const fallback = resolveTemplateThemeColor(activeTemplateId);
    const normalized = normalizeHexColor(nextColor, fallback);
    if (!normalized) return;
    setCvThemeColors((prev) => ({
      ...prev,
      [activeTemplateId]: normalized
    }));
    setApplicationContext((prev) => ({
      ...prev,
      theme_color: normalized
    }));
  };

  const handleShowProfileImageChange = (nextValue) => {
    setApplicationContext((prev) => ({
      ...prev,
      show_profile_image: Boolean(nextValue)
    }));
  };

  const handleHipsterHeaderAlignChange = (nextValue) => {
    setApplicationContext((prev) => ({
      ...prev,
      header_text_align: nextValue || "right"
    }));
  };

  const handleHipsterHeaderTitleSizeChange = (nextValue) => {
    setApplicationContext((prev) => ({
      ...prev,
      header_title_size: nextValue || "Huge"
    }));
  };

  const handleHipsterHeaderSubtitleSizeChange = (nextValue) => {
    setApplicationContext((prev) => ({
      ...prev,
      header_subtitle_size: nextValue || "Large"
    }));
  };

  const handleApplicationContextChange = (updater) => {
    setApplicationContext((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next?.profile_image !== prev?.profile_image) {
        setCvReview((prevReview) => {
          if (!prevReview) return prevReview;
          return {
            ...prevReview,
            canonical: {
              ...(prevReview.canonical || {}),
              data: mergeProfileImageIntoData(prevReview.canonical?.data, next?.profile_image || "")
            }
          };
        });
        setCvPreviewPayload((prevPayload) => {
          if (!prevPayload) return prevPayload;
          return {
            ...prevPayload,
            photo: (next?.profile_image || "").trim() || null
          };
        });
      }
      return next;
    });
  };

  const handleUploadProfileImage = async (file) => {
    if (!file) return;
    setIsUploadingProfileImage(true);
    setCvEntryError("");
    try {
      const result = await uploadCvProfileImage(file);
      const imagePath = String(result?.image_path || "").trim();
      if (!imagePath) {
        throw new Error("Image upload succeeded but no image path was returned.");
      }

      setApplicationContext((prev) => ({ ...prev, profile_image: imagePath }));
      setCvReview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          canonical: {
            ...(prev.canonical || {}),
            data: mergeProfileImageIntoData(prev.canonical?.data, imagePath)
          }
        };
      });
      setCvPreviewPayload((prev) => (prev ? { ...prev, photo: imagePath } : prev));
      setCvEntryError("Profile image uploaded. Save the profile to persist this image selection.");
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to upload profile image");
    } finally {
      setIsUploadingProfileImage(false);
    }
  };

  const handleClearProfileImage = () => {
    handleApplicationContextChange((prev) => ({ ...prev, profile_image: "" }));
  };

  const handleCvDraftStateChange = (nextDraftState) => {
    if (!nextDraftState) return;
    const nextHash = JSON.stringify({
      isDirty: Boolean(nextDraftState.isDirty),
      sourceProfileId: nextDraftState.sourceProfileId || "",
      targetProfileId: nextDraftState.targetProfileId || "",
      revision: nextDraftState.revision || 0,
      payload: nextDraftState.payload || null,
      totals: nextDraftState.diff?.totals || null
    });
    if (nextHash === cvDraftHashRef.current) return;
    cvDraftHashRef.current = nextHash;
    setCvDraftState(nextDraftState);
  };

  useEffect(() => {
    if (!isFindView) setIsSidebarOpen(false);
  }, [isFindView]);

  const showPanel = Boolean(selectedJob);
  const panelTitle = selectedJob?.title || (cvReview ? "CV editor" : "Job detail");
  const panelEyebrow = selectedJob ? "Job detail" : "CV editor";
  const showActionsPanel = activeJobAction !== "none";
  const showJobCvEntryPanel = activeJobAction === "cv";
  const showJobCoverPanel = activeJobAction === "cover";
  const showActionSwitcher = activeJobAction !== "none";
  const actionLabel = cvReview
    ? "CV review"
    : (activeJobAction === "cover" ? "Cover letter" : "CV generation");
  const switchActionLabel = activeJobAction === "cover" ? "Switch to CV generation" : "Switch to Cover letter";

  const jobSearchCreateCvWorkflowViewModel = {
    handleBackToResults,
    selectedJob,
    panelEyebrow,
    panelTitle,
    activeJobAction,
    cvReview,
    setActiveJobAction,
    initializeJobCvContext,
    actionLabel,
    showActionSwitcher,
    handleSwitchJobAction,
    switchActionLabel,
    showActionsPanel,
    descriptionHtml,
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
    handleUploadProfileImage,
    handleClearProfileImage,
    isUploadingProfileImage,
    showJobCoverPanel,
    showJobCvEntryPanel,
    isJobCvChoiceStep,
    handleChooseCreateJobCv,
    handleChooseBranchJobCv,
    isJobCvCreateStep,
    isJobCvBranchReviewStep,
    handleNewbieDraftGenerated,
    handleBranchDraftGenerated,
    onBeforeStepLeave: handleCreateStepLeave,
    isJobCvBranchStep,
    handleStartCvReview
  };

  const createCvViewModel = {
    isNewbieCreateMode,
    cvTemplateId,
    onTemplateIdChange: handleTemplateIdChange,
    cvOutputLanguage,
    onCvOutputLanguageChange: setCvOutputLanguage,
    resumeText,
    onResumeTextChange: setResumeText,
    applicationContext,
    onApplicationContextChange: handleApplicationContextChange,
    onNewbieDraftGenerated: handleNewbieDraftGenerated,
    cvReview,
    createReviewLayoutRef,
    createReviewLayoutStyle,
    createReviewSectionRef,
    pdfPreviewUrl,
    isPdfGenerating,
    isPdfDownloading,
    resolveTemplateThemeColor,
    onThemeColorChange: handleThemeColorChange,
    onShowProfileImageChange: handleShowProfileImageChange,
    onHipsterHeaderAlignChange: handleHipsterHeaderAlignChange,
    onHipsterHeaderTitleSizeChange: handleHipsterHeaderTitleSizeChange,
    onHipsterHeaderSubtitleSizeChange: handleHipsterHeaderSubtitleSizeChange,
    onUpdatePdfPreview: handleUpdatePdfPreview,
    onDownloadPdf: handleDownloadPdf,
    unsyncedSaveCount: pendingPreviewSaveCount,
    onCreateReviewResizeStart: handleCreateReviewResizeStart,
    selectedModel,
    lmTimeout,
    onCvDraftStateChange: handleCvDraftStateChange,
    onPreviewPayloadChange: setCvPreviewPayload,
    onCvReviewProfileSaved: handleCvReviewProfileSaved,
    onUploadProfileImage: handleUploadProfileImage,
    onClearProfileImage: handleClearProfileImage,
    isUploadingProfileImage,
    cvProfiles,
    profilesLoading,
    profilesError,
    selectedProfileId,
    onSelectedProfileIdChange: setSelectedProfileId,
    onProfileRowSelect: handleProfileRowSelect,
    onRefreshProfiles: loadProfiles,
    onDeleteProfiles: handleDeleteProfiles,
    onExportProfiles: handleExportProfiles,
    onImportProfiles: handleImportProfiles,
    onUpdateProfileCvText: handleUpdateApplicationProfileData,
    onRemapProfileCvText: handleRemapProfileCvText,
    onCreateNewEntry: handleCreateNewEntry,
    onBeginNewEntry: handleBeginNewEntry,
    isCreatingProfileEntry,
    isLoadingProfile,
    isUpdatingProfileCvText,
    isRemappingProfileCvText,
    isProfileBulkActionBusy,
    remapProgress: cvRemapProgress,
    cvEntryError,
    newProfileId,
    onNewProfileIdChange: setNewProfileId,
    draftProfileId,
    isDraftProfileActive,
    onBeforeStepLeave: handleCreateStepLeave
  };

  if (showPanel) {
    return (
      <>
        <JobSearchCreateCvWorkflowView viewModel={jobSearchCreateCvWorkflowViewModel} />
        <CvIdModal
          isOpen={isCvIdModalOpen}
          title="Choose CV id"
          helperText="Pick a CV id to save this draft and continue editing."
          inputLabel="CV id"
          inputId="newbieCvId"
          value={cvIdInput}
          onChange={handleCvIdInputChange}
          onCancel={closeCvIdModal}
          onConfirm={handleConfirmCvId}
          error={cvIdError}
          isBusy={isSavingCvId}
          confirmLabel={isSavingCvId ? "Saving..." : "Save CV id"}
        />
      </>
    );
  }

  return (
    <Box className={`app-shell ${isSidebarOpen ? "is-sidebar-open" : ""}`}>
      <Grid
        templateColumns={isFindView ? `72px ${sidebarWidth}px 1fr` : "72px 1fr"}
        minHeight="100vh"
      >
        <GridItem className="app-rail">
          <button
            type="button"
            className={`rail-button ${isFindView ? "is-active" : ""}`}
            onClick={() => handleSetView("find")}
          >
            <span className="rail-icon">🔎</span>
            <span>Find a job</span>
          </button>
          <button
            type="button"
            className={`rail-button ${!isFindView && createMode === "newbie" ? "is-active" : ""}`}
            onClick={() => {
              handleSetView("create");
              setCreateMode("newbie");
            }}
          >
            <span className="rail-icon">📝</span>
            <span>Create CV</span>
          </button>
          <button
            type="button"
            className={`rail-button ${!isFindView && createMode === "advanced" ? "is-active" : ""}`}
            onClick={() => {
              handleSetView("create");
              setCreateMode("advanced");
            }}
          >
            <span className="rail-icon">🗂️</span>
            <span>Manage profiles</span>
          </button>
          {isFindView && (
            <button
              type="button"
              className="rail-button rail-toggle"
              onClick={() => setIsSidebarOpen(true)}
            >
              <span className="rail-icon">⚙️</span>
              <span>Filters</span>
            </button>
          )}
        </GridItem>

        {isFindView && (
          <GridItem className="app-sidebar-wrap" style={{ width: sidebarWidth }}>
            <div className="app-sidebar">
              <SearchFilters
                searchTerm={searchTerm} onSearchTermChange={setSearchTerm}
                location={location} onLocationChange={setLocation}
                searchRadiusKm={searchRadiusKm} onSearchRadiusKmChange={setSearchRadiusKm}
                resultsWanted={resultsWanted} onResultsWantedChange={setResultsWanted}
                hoursOld={hoursOld} onHoursOldChange={setHoursOld}
                isRemote={isRemote} onIsRemoteChange={setIsRemote}
                resumeText={resumeText} onResumeTextChange={setResumeText}
                wishes={wishes} onWishesChange={setWishes}
                models={models}
                selectedModel={selectedModel}
                onSelectedModelChange={setSelectedModel}
                lmTimeout={lmTimeout}
                lmTimeoutMinutes={lmTimeoutMinutes}
                onLmTimeoutChange={setLmTimeout}
                modelError={modelError}
                enableRerank={enableRerank}
                onEnableRerankChange={setEnableRerank}
                rerankTopN={rerankTopN}
                onRerankTopNChange={setRerankTopN}
                defaultRerankTopN={defaultRerankTopN}
                cvProfiles={cvProfiles}
                selectedRerankProfileId={selectedRerankProfileId}
                onSelectedRerankProfileIdChange={handleSelectRerankProfile}
                rerankProfileError={rerankProfileError}
                cachedAvailable={Boolean(cachedResponse)}
                cachedAt={cachedAt}
                onLoadCache={handleLoadCache}
                onClearCache={handleClearCache}
                isLoading={isLoading}
                error={error}
                onSearch={handleSearch}
                onRunRerank={handleRunRerank}
              />
            </div>
            <div
              className="sidebar-resizer"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={handleSidebarResizeStart}
            />
          </GridItem>
        )}

        <GridItem className="app-main">
          {isFindView ? (
            <FindJobsView
              jobs={jobs}
              response={response}
              searchPhaseMessage={searchPhaseMessage}
              onSelectJob={handleSelectJob}
              isLoading={isLoading}
              hasResponse={Boolean(response)}
              refinementProgress={refinementProgress}
            />
          ) : (
            <CreateCvView viewModel={createCvViewModel} />
          )}
        </GridItem>
      </Grid>
      {isFindView && (
        <div
          className={`sidebar-backdrop ${isSidebarOpen ? "is-open" : ""}`}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <CvIdModal
        isOpen={isCvIdModalOpen}
        title="Choose CV id"
        helperText="Pick a CV id to save this draft and continue editing."
        inputLabel="CV id"
        inputId="newbieCvId"
        value={cvIdInput}
        onChange={handleCvIdInputChange}
        onCancel={closeCvIdModal}
        onConfirm={handleConfirmCvId}
        error={cvIdError}
        isBusy={isSavingCvId}
        confirmLabel={isSavingCvId ? "Saving..." : "Save CV id"}
      />

      <OverwriteConfirmationModal
        isOpen={profileSwitchDialog.isOpen}
        mode="switch"
        targetProfileId={profileSwitchDialog.diff?.targetProfileId || cvDraftState.targetProfileId || selectedProfileId}
        pendingTargetProfileId={profileSwitchDialog.pendingProfileId}
        existingRevision={profileSwitchDialog.diff?.existingRevision || cvDraftState.revision || 0}
        existingUpdatedAt={profileSwitchDialog.diff?.existingUpdatedAt || cvDraftState.updatedAt}
        totals={profileSwitchDialog.diff?.totals || { added: 0, removed: 0, updated: 0 }}
        topLevelChanges={profileSwitchDialog.diff?.topLevelChanges || []}
        sectionChanges={profileSwitchDialog.diff?.sectionChanges || []}
        suggestedProfileId=""
        onSuggestedProfileIdChange={() => {}}
        onConfirmOverwrite={handleSaveAndSwitchProfile}
        onSwitchWithoutSaving={handleSwitchWithoutSaving}
        onSaveAsNew={() => {}}
        onCancel={closeProfileSwitchDialog}
        isBusy={profileSwitchDialog.isBusy}
        error={profileSwitchDialog.error}
      />
    </Box>
  );
}
