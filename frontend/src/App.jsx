import { useEffect, useRef, useState } from "react";
import {
  getCvProfile,
  parseCvCanonical,
  renderCvFromTemplate,
  saveCvProfile,
  uploadCvProfileImage
} from "./api/llm";
import useCvProfilesController from "./hooks/useCvProfilesController";
import { useJobDescription } from "./hooks/useJobDescription";
import useCreateCvWorkflowController from "./hooks/useCreateCvWorkflowController";
import useSearchWorkflowController from "./hooks/useSearchWorkflowController";
import useW1CvWorkflowStateMachine from "./hooks/useW1CvWorkflowStateMachine";
import {
  buildCompanySuffixProfileId,
  buildCvIdSuggestion,
  buildJobDraftProfileId,
  buildNextAvailableDraftProfileId,
  buildNextVersionedProfileId,
  sanitizeProfileId
} from "./workflow/profiles/profileIdUtils";
import {
  buildProfileApplicationContextDiff,
  contextFromProfile,
  contextSnapshotFromProfile,
  doesProfileMatchJobContext
} from "./workflow/profiles/profileContextUtils";
import {
  buildCreateNewEntryPayload,
  buildJobEditDraftPayload,
  buildRemapProfilePayload,
  buildSaveAndSwitchPayload,
  buildUpdateApplicationProfilePayload,
  buildLineageFields,
  resolveRemapLineageFields
} from "./workflow/profiles/profilePayloadUtils";
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
  const [isJobReviewReadOnly, setIsJobReviewReadOnly] = useState(false);
  const [pendingNewbieDraft, setPendingNewbieDraft] = useState(null);
  const [isCvIdModalOpen, setIsCvIdModalOpen] = useState(false);
  const [cvIdInput, setCvIdInput] = useState("");
  const [cvIdError, setCvIdError] = useState("");
  const [isSavingCvId, setIsSavingCvId] = useState(false);
  const [cvProfiles, setCvProfiles] = useState([]);
  const [isCreatingProfileEntry, setIsCreatingProfileEntry] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draftProfileId, setDraftProfileId] = useState("");
  const [isDraftProfileActive, setIsDraftProfileActive] = useState(false);
  const [newProfileId, setNewProfileId] = useState("default");
  const [cvTemplateId, setCvTemplateId] = useState("awesomecv");
  const [cvOutputLanguage, setCvOutputLanguage] = useState("english");
  const [cvEntryError, setCvEntryError] = useState("");
  const [applicationContext, setApplicationContext] = useState(EMPTY_APPLICATION_CONTEXT);
  const [loadedProfileSnapshot, setLoadedProfileSnapshot] = useState(createEmptyLoadedProfileSnapshot);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isUpdatingProfileCvText, setIsUpdatingProfileCvText] = useState(false);
  const [isRemappingProfileCvText, setIsRemappingProfileCvText] = useState(false);
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [cvRemapElapsedMs, setCvRemapElapsedMs] = useState(0);
  const [cvDraftState, setCvDraftState] = useState({
    isDirty: false,
    diff: null,
    payload: null,
    sourceProfileId: "",
    targetProfileId: "",
    revision: 0,
    updatedAt: null
  });
  const [profileSwitchDialog, setProfileSwitchDialog] = useState({
    isOpen: false,
    pendingProfileId: "",
    isBusy: false,
    error: "",
    diff: null
  });
  const [jobEditDecisionDialog, setJobEditDecisionDialog] = useState({
    isOpen: false,
    isBusy: false,
    error: "",
    draftProfileName: ""
  });
  const [activeView, setActiveView] = useState("find");
  const [createMode, setCreateMode] = useState("newbie");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [reviewPreviewWidth, setReviewPreviewWidth] = useState(null);
  const [createReviewPreviewWidth, setCreateReviewPreviewWidth] = useState(null);
  const [cvPreviewPayload, setCvPreviewPayload] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [pendingPreviewSaveCount, setPendingPreviewSaveCount] = useState(0);
  const [cvThemeColors, setCvThemeColors] = useState(DEFAULT_TEMPLATE_THEME_COLORS);
  const [isJobDetailsPanelVisible, setIsJobDetailsPanelVisible] = useState(false);
  const [isProfileBrowserPanelVisible, setIsProfileBrowserPanelVisible] = useState(false);

  const cvRemapTimerRef = useRef(null);
  const pdfPreviewRequestVersionRef = useRef(0);
  const clearPreviewTrackingRef = useRef(null);
  const clearCreatePreviewStateRef = useRef(null);
  const cvDraftHashRef = useRef("");
  const isResizingSidebarRef = useRef(false);
  const isResizingReviewRef = useRef(false);
  const isResizingCreateReviewRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(SIDEBAR_MIN_WIDTH);
  const reviewResizeStartXRef = useRef(0);
  const reviewResizeStartWidthRef = useRef(0);
  const createReviewResizeStartXRef = useRef(0);
  const createReviewResizeStartWidthRef = useRef(0);
  const sidebarWidthRef = useRef(SIDEBAR_MIN_WIDTH);
  const reviewLayoutRef = useRef(null);
  const createReviewLayoutRef = useRef(null);
  const jobDetailsSectionRef = useRef(null);
  const profileBrowserSectionRef = useRef(null);
  const reviewSectionRef = useRef(null);
  const createReviewSectionRef = useRef(null);
  const shouldFocusReviewAfterProfileLoadRef = useRef(false);

  const {
    activeJobAction,
    jobCvEntryStep,
    activeReviewNav,
    setActiveJobAction,
    initializeJobCvContext,
    handleSelectJob,
    handleChooseCreateJobCv,
    handleChooseBranchJobCv,
    handleBackToResults,
    handleSetView,
    handleSwitchJobAction,
    handleOpenJobDetailsPanel,
    handleOpenProfileBrowserPanel,
    handleOpenCvReviewSection,
    selectReviewNav,
    selectDetailsNav,
    selectProfilesNav,
    activateCvReviewStep,
    activateCvReview,
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
    setIsJobReviewReadOnly,
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
    setIsSidebarOpen,
    scrollToJobDetails: () => {
      requestAnimationFrame(() => {
        jobDetailsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    scrollToProfiles: () => {
      requestAnimationFrame(() => {
        profileBrowserSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    scrollToReview: () => {
      requestAnimationFrame(() => {
        reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
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
  const shouldRenderW1StandaloneReview = Boolean(cvReview) && !isJobCvCreateStep && !isJobCvBranchReviewStep;
  const w1HasFormData = isW1CvWorkflow && Boolean(cvReview?.canonical);
  const w1HasCvText = isW1CvWorkflow && Boolean(resumeText.trim());
  const w1UiState = !w1HasFormData && !w1HasCvText
    ? "S1"
    : (!w1HasFormData && w1HasCvText)
      ? "S2"
      : (w1HasFormData && !w1HasCvText)
        ? "S3"
        : "S4";
  const showW1ReviewCards = !isW1CvWorkflow || w1HasFormData;
  const showW1TailorAction = !isW1CvWorkflow || w1HasCvText;

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

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(Math.max(parsed, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
      setSidebarWidth(clamped);
    }
  }, []);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

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

  useEffect(() => {
    if (isCvIdModalOpen) {
      document.body.classList.add("modal-open");
      return () => document.body.classList.remove("modal-open");
    }
    document.body.classList.remove("modal-open");
    return undefined;
  }, [isCvIdModalOpen]);

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

  useEffect(() => {
    const stopResizeInteractions = () => {
      let released = false;
      if (isResizingSidebarRef.current) {
        isResizingSidebarRef.current = false;
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current));
        released = true;
      }
      if (isResizingReviewRef.current) {
        isResizingReviewRef.current = false;
        released = true;
      }
      if (isResizingCreateReviewRef.current) {
        isResizingCreateReviewRef.current = false;
        released = true;
      }
      if (released) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    const handleMouseMove = (event) => {
      if (event.buttons === 0) {
        stopResizeInteractions();
        return;
      }

      if (isResizingSidebarRef.current) {
        const delta = event.clientX - resizeStartXRef.current;
        const nextWidth = Math.min(
          Math.max(resizeStartWidthRef.current + delta, SIDEBAR_MIN_WIDTH),
          SIDEBAR_MAX_WIDTH
        );
        setSidebarWidth(nextWidth);
        return;
      }

      if (isResizingReviewRef.current) {
        const layoutRect = reviewLayoutRef.current?.getBoundingClientRect();
        if (!layoutRect) return;
        const delta = event.clientX - reviewResizeStartXRef.current;
        const maxPreviewWidth = Math.max(
          REVIEW_PREVIEW_MIN_WIDTH,
          layoutRect.width - REVIEW_EDITOR_MIN_WIDTH - REVIEW_SPLITTER_WIDTH
        );
        const nextPreviewWidth = Math.min(
          Math.max(reviewResizeStartWidthRef.current + delta, REVIEW_PREVIEW_MIN_WIDTH),
          maxPreviewWidth
        );
        setReviewPreviewWidth(nextPreviewWidth);
        return;
      }

      if (!isResizingCreateReviewRef.current) return;
      const createLayoutRect = createReviewLayoutRef.current?.getBoundingClientRect();
      if (!createLayoutRect) return;
      const createDelta = event.clientX - createReviewResizeStartXRef.current;
      const createMaxPreviewWidth = Math.max(
        REVIEW_PREVIEW_MIN_WIDTH,
        createLayoutRect.width - REVIEW_EDITOR_MIN_WIDTH - REVIEW_SPLITTER_WIDTH
      );
      const nextCreatePreviewWidth = Math.min(
        Math.max(createReviewResizeStartWidthRef.current + createDelta, REVIEW_PREVIEW_MIN_WIDTH),
        createMaxPreviewWidth
      );
      setCreateReviewPreviewWidth(nextCreatePreviewWidth);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizeInteractions);
    window.addEventListener("pointerup", stopResizeInteractions);
    window.addEventListener("pointercancel", stopResizeInteractions);
    window.addEventListener("blur", stopResizeInteractions);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizeInteractions);
      window.removeEventListener("pointerup", stopResizeInteractions);
      window.removeEventListener("pointercancel", stopResizeInteractions);
      window.removeEventListener("blur", stopResizeInteractions);
    };
  }, []);


  const handleStartCvReview = ({ canonical, job, templateId, docType, outputLanguage }) => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview({ canonical, job, templateId, docType, outputLanguage });
    activateCvReview();
    setIsJobReviewReadOnly(false);
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
    setIsJobReviewReadOnly(false);
    setSelectedJob(null);
    setActiveView("create");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    preparePreviewForReview(templateId || cvTemplateId || "awesomecv");
  };

  const clearCreatePreviewState = () => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview(null);
    setIsJobReviewReadOnly(false);
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
    setIsJobReviewReadOnly(false);
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
    setIsJobReviewReadOnly(false);
  };

  const doesLoadedProfileMatchCurrentJob = () => doesProfileMatchJobContext({
    selectedJob,
    selectedProfileId,
    loadedProfileSnapshot,
    applicationContext
  });

  const openCvIdModal = ({ canonical, templateId, outputLanguage, jobContext }) => {
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
  };

  const closeCvIdModal = () => {
    setIsCvIdModalOpen(false);
    setCvIdError("");
    setPendingNewbieDraft(null);
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

  const handleConfirmCvId = async () => {
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
      setAutosaveSnapshotFromPayload(payload);
      setPendingPreviewSaveCount(0);
      handleNewbieDraftReady({
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
  };

  const handleCreateNewEntry = async ({ profileName } = {}) => {
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
        canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
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
  };

  const handleBeginNewEntry = () => {
    clearCreatePreviewState();
    setSelectedProfileId("");
    setDraftProfileId("");
    setIsDraftProfileActive(false);
    setApplicationContext({ ...EMPTY_APPLICATION_CONTEXT });
    setResumeText("");
    setLoadedProfileSnapshot({
      profile_id: "",
      revision: 0,
      updated_at: null,
      raw_resume_text: "",
      ...EMPTY_APPLICATION_CONTEXT
    });
    setCvTemplateId("awesomecv");
    setCvOutputLanguage("english");
    setNewProfileId("");
    setCvEntryError("");
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

  const loadProfileIntoEditor = async (profileId) => {
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
  };

  const handleProfileRowSelect = async (profile) => {
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
      setProfileSwitchDialog({
        isOpen: true,
        pendingProfileId: nextProfileId,
        isBusy: false,
        error: "",
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
  };

  const closeProfileSwitchDialog = () => {
    setProfileSwitchDialog({
      isOpen: false,
      pendingProfileId: "",
      isBusy: false,
      error: "",
      diff: null
    });
  };

  const handleSwitchWithoutSaving = async () => {
    if (!profileSwitchDialog.pendingProfileId) return;
    setProfileSwitchDialog((prev) => ({ ...prev, isBusy: true, error: "" }));
    await loadProfileIntoEditor(profileSwitchDialog.pendingProfileId);
    closeProfileSwitchDialog();
  };

  const handleSaveAndSwitchProfile = async () => {
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
      return;
    }
  };

  const handleUpdateApplicationProfileData = async () => {
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
        canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
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
  };

  const handleRemapProfileCvText = async ({ targetProfileId, allowOverwrite } = {}) => {
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
        activateCvReviewStep(isJobCvBranchReviewStep ? "branch-review" : "review");
        setIsJobReviewReadOnly(false);
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
  };

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

  const loadProfileIntoJobCvContext = async (profileId) => {
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
      setIsJobReviewReadOnly(false);
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const openJobEditDecisionDialog = () => {
    const suggestedDraftId = buildNextAvailableDraftProfileId(
      {
        draftBaseId: buildJobDraftProfileId({
          baseId: selectedProfileId || newProfileId || "profile",
          company: selectedJob?.company || applicationContext.company || "company"
        }),
        existingIds: cvProfiles.map((profile) => profile.profile_id)
      }
    );
    setJobEditDecisionDialog({
      isOpen: true,
      isBusy: false,
      error: "",
      draftProfileName: suggestedDraftId
    });
  };

  const closeJobEditDecisionDialog = () => {
    setJobEditDecisionDialog({
      isOpen: false,
      isBusy: false,
      error: "",
      draftProfileName: ""
    });
  };

  const handleEditContinueWithLoadedProfile = () => {
    if (!doesLoadedProfileMatchCurrentJob()) {
      setJobEditDecisionDialog((prev) => ({
        ...prev,
        error: "Current job differs from the loaded profile context. Create a new draft for this job to continue safely."
      }));
      return;
    }
    setIsJobReviewReadOnly(false);
    closeJobEditDecisionDialog();
  };

  const handleEditCreateDraftForJob = async () => {
    if (!selectedProfileId || !selectedJob) {
      setJobEditDecisionDialog((prev) => ({
        ...prev,
        error: "Select a source profile and job before creating a draft."
      }));
      return;
    }

    const requestedDraftName = String(jobEditDecisionDialog.draftProfileName || "").trim();
    if (!requestedDraftName) {
      setJobEditDecisionDialog((prev) => ({
        ...prev,
        error: "Draft profile name is required."
      }));
      return;
    }

    const nextDraftId = sanitizeProfileId(requestedDraftName);
    const draftExists = cvProfiles.some((profile) => profile.profile_id === nextDraftId);
    if (draftExists) {
      setJobEditDecisionDialog((prev) => ({
        ...prev,
        error: "Draft profile name already exists. Choose another name."
      }));
      return;
    }

    setJobEditDecisionDialog((prev) => ({ ...prev, isBusy: true, error: "" }));
    setCvEntryError("");
    try {
      const sourceProfile = await getCvProfile(selectedProfileId);

      const payload = buildJobEditDraftPayload({
        sourceProfile,
        nextDraftId,
        selectedJob,
        applicationContext,
        resumeText,
        normalizeHexColorFn: normalizeHexColor,
        lineageFields: buildLineageFields({
          sourceProfile,
          nextProfileId: nextDraftId,
          branchReason: "job-edit-draft",
          sanitizeProfileIdFn: sanitizeProfileId
        })
      });

      const saved = await saveCvProfile(nextDraftId, payload);
      upsertCvProfileInList(saved);
      setSelectedProfileId(saved.profile_id);
      setNewProfileId(saved.profile_id);
      setCvTemplateId(saved.template_id || "awesomecv");
      setApplicationContext(contextFromProfile(saved));
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      setCvReview({
        canonical: saved,
        job: selectedJob,
        templateId: saved.template_id || "awesomecv",
        docType: "resume",
        outputLanguage: cvOutputLanguage
      });
      setIsJobReviewReadOnly(false);
      setCvPreviewPayload(null);
      setPdfPreviewUrl(null);
      preparePreviewForReview(saved.template_id || "awesomecv");
      closeJobEditDecisionDialog();
      setCvEntryError(`Created draft '${saved.profile_id}' for editing in this job context.`);
    } catch (err) {
      setJobEditDecisionDialog((prev) => ({
        ...prev,
        isBusy: false,
        error: err instanceof Error ? err.message : "Failed to create job draft profile."
      }));
    }
  };

  const handleSidebarResizeStart = (event) => {
    if (!isFindView) return;
    isResizingSidebarRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleReviewResizeStart = (event) => {
    if (!isW1ReviewLayout || window.matchMedia("(max-width: 960px)").matches) return;
    const layoutRect = reviewLayoutRef.current?.getBoundingClientRect();
    if (!layoutRect) return;

    const currentPreviewWidth = reviewSectionRef.current?.getBoundingClientRect().width
      || reviewPreviewWidth
      || (layoutRect.width * 0.5);

    isResizingReviewRef.current = true;
    reviewResizeStartXRef.current = event.clientX;
    reviewResizeStartWidthRef.current = currentPreviewWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
  };

  const handleCreateReviewResizeStart = (event) => {
    if (activeView !== "create" || window.matchMedia("(max-width: 960px)").matches) return;
    const layoutRect = createReviewLayoutRef.current?.getBoundingClientRect();
    if (!layoutRect) return;

    const currentPreviewWidth = createReviewSectionRef.current?.getBoundingClientRect().width
      || createReviewPreviewWidth
      || (layoutRect.width * 0.5);

    isResizingCreateReviewRef.current = true;
    createReviewResizeStartXRef.current = event.clientX;
    createReviewResizeStartWidthRef.current = currentPreviewWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
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
  const showJobCvSetupPanel = showJobCvEntryPanel && !shouldRenderW1StandaloneReview;
  const isW1ReviewLayout = Boolean(cvReview) && showW1ReviewCards;
  const showActionSwitcher = activeJobAction !== "none";
  const reviewLayoutStyle = reviewPreviewWidth
    ? { "--review-preview-width": `${Math.round(reviewPreviewWidth)}px` }
    : undefined;
  const createReviewLayoutStyle = createReviewPreviewWidth
    ? { "--create-review-preview-width": `${Math.round(createReviewPreviewWidth)}px` }
    : undefined;
  const actionLabel = cvReview
    ? "CV review"
    : (activeJobAction === "cover" ? "Cover letter" : "CV generation");
  const switchActionLabel = activeJobAction === "cover" ? "Switch to CV generation" : "Switch to Cover letter";

  useEffect(() => {
    if (!cvReview) {
      setIsJobDetailsPanelVisible(false);
      setIsProfileBrowserPanelVisible(false);
      selectReviewNav();
    }
  }, [cvReview, selectReviewNav]);

  useEffect(() => {
    if (!cvReview) return;

    const updateActiveNavFromScroll = () => {
      const stickyOffset = 140;
      const reviewRect = reviewSectionRef.current?.getBoundingClientRect();
      const reviewTop = reviewRect?.top ?? Number.POSITIVE_INFINITY;
      const profileTop = profileBrowserSectionRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      const detailTop = jobDetailsSectionRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      if (reviewTop <= stickyOffset + 80) {
        selectReviewNav();
        return;
      }

      if (profileTop <= stickyOffset + 80) {
        selectProfilesNav();
        return;
      }

      if (detailTop <= stickyOffset + 80) {
        selectDetailsNav();
        return;
      }

      selectDetailsNav();
    };

    updateActiveNavFromScroll();
    window.addEventListener("scroll", updateActiveNavFromScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateActiveNavFromScroll);
  }, [cvReview, selectDetailsNav, selectProfilesNav, selectReviewNav]);

  useEffect(() => {
    if (!cvReview || jobCvEntryStep !== "review") return;
    if (!shouldFocusReviewAfterProfileLoadRef.current) return;
    shouldFocusReviewAfterProfileLoadRef.current = false;

    requestAnimationFrame(() => {
      reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      selectReviewNav();
    });
  }, [cvReview, jobCvEntryStep, selectReviewNav]);

  const jobEditDecisionModal = jobEditDecisionDialog.isOpen ? (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="job-edit-decision-title">
      <div className="modal-backdrop" onClick={closeJobEditDecisionDialog} />
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="job-edit-decision-title">Choose how to edit this profile</h2>
        </div>
        <p className="helper">
          Recommended: create a draft for this job. This protects your loaded profile from accidental overwrite.
        </p>
        {(() => {
          const jobMatchesLoadedProfile = doesLoadedProfileMatchCurrentJob();
          return !jobMatchesLoadedProfile ? (
            <div className="sub-card" style={{ margin: 0 }}>
              <p className="helper" style={{ margin: 0 }}>
                Job context mismatch detected.
              </p>
              <p className="helper" style={{ margin: 0 }}>
                You cannot edit the loaded profile directly here. Create a new draft branch for this job.
              </p>
            </div>
          ) : (
            <div className="sub-card" style={{ margin: 0 }}>
              <p className="helper" style={{ margin: 0 }}>
                Context matches this job.
              </p>
              <p className="helper" style={{ margin: 0 }}>
                You may edit the loaded profile directly. Saving can overwrite that profile.
              </p>
            </div>
          );
        })()}
        <div>
          <label htmlFor="jobDraftProfileName" className="label">Draft profile name</label>
          <input
            id="jobDraftProfileName"
            type="text"
            value={jobEditDecisionDialog.draftProfileName}
            onChange={(event) => {
              const nextValue = event.target.value;
              setJobEditDecisionDialog((prev) => ({
                ...prev,
                draftProfileName: nextValue,
                error: ""
              }));
            }}
            disabled={jobEditDecisionDialog.isBusy}
          />
          {(() => {
            const requestedName = String(jobEditDecisionDialog.draftProfileName || "").trim();
            if (!requestedName) return null;
            const normalizedName = sanitizeProfileId(requestedName);
            const conflict = cvProfiles.some((profile) => profile.profile_id === normalizedName);
            if (!conflict) return null;
            return (
              <p className="error" style={{ marginTop: 8 }}>
                Profile name '{normalizedName}' already exists.
              </p>
            );
          })()}
        </div>
        {jobEditDecisionDialog.error ? <p className="error">{jobEditDecisionDialog.error}</p> : null}
        <div className="inline-actions">
          <button
            type="button"
            className="secondary cv-action-remap"
            onClick={handleEditCreateDraftForJob}
            disabled={jobEditDecisionDialog.isBusy}
          >
            {jobEditDecisionDialog.isBusy ? "Creating draft..." : "Create new draft for this job (recommended)"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleEditContinueWithLoadedProfile}
            disabled={jobEditDecisionDialog.isBusy || !doesLoadedProfileMatchCurrentJob()}
          >
            Edit loaded profile (overwrite path)
          </button>
          <button
            type="button"
            className="ghost"
            onClick={closeJobEditDecisionDialog}
            disabled={jobEditDecisionDialog.isBusy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (showPanel) {
    return (
      <>
        <JobSearchCreateCvWorkflowView
          shouldRenderW1StandaloneReview={shouldRenderW1StandaloneReview}
          handleBackToResults={handleBackToResults}
          selectedJob={selectedJob}
          panelEyebrow={panelEyebrow}
          panelTitle={panelTitle}
          activeJobAction={activeJobAction}
          cvReview={cvReview}
          setActiveJobAction={setActiveJobAction}
          initializeJobCvContext={initializeJobCvContext}
          activeReviewNav={activeReviewNav}
          handleOpenCvReviewSection={handleOpenCvReviewSection}
          actionLabel={actionLabel}
          handleOpenJobDetailsPanel={handleOpenJobDetailsPanel}
          handleOpenProfileBrowserPanel={handleOpenProfileBrowserPanel}
          showActionSwitcher={showActionSwitcher}
          handleSwitchJobAction={handleSwitchJobAction}
          switchActionLabel={switchActionLabel}
          showActionsPanel={showActionsPanel}
          showJobCvSetupPanel={showJobCvSetupPanel}
          jobDetailsSectionRef={jobDetailsSectionRef}
          descriptionHtml={descriptionHtml}
          profileBrowserSectionRef={profileBrowserSectionRef}
          cvProfiles={cvProfiles}
          profilesLoading={profilesLoading}
          profilesError={profilesError}
          selectedProfileId={selectedProfileId}
          setSelectedProfileId={setSelectedProfileId}
          loadProfileIntoJobCvContext={loadProfileIntoJobCvContext}
          loadProfiles={loadProfiles}
          handleDeleteProfiles={handleDeleteProfiles}
          handleExportProfiles={handleExportProfiles}
          handleImportProfiles={handleImportProfiles}
          handleUpdateApplicationProfileData={handleUpdateApplicationProfileData}
          handleRemapProfileCvText={handleRemapProfileCvText}
          handleCreateNewEntry={handleCreateNewEntry}
          handleBeginNewEntry={handleBeginNewEntry}
          isCreatingProfileEntry={isCreatingProfileEntry}
          isLoadingProfile={isLoadingProfile}
          isUpdatingProfileCvText={isUpdatingProfileCvText}
          isRemappingProfileCvText={isRemappingProfileCvText}
          cvRemapProgress={cvRemapProgress}
          cvEntryError={cvEntryError}
          isProfileBulkActionBusy={isProfileBulkActionBusy}
          cvTemplateId={cvTemplateId}
          handleTemplateIdChange={handleTemplateIdChange}
          cvOutputLanguage={cvOutputLanguage}
          setCvOutputLanguage={setCvOutputLanguage}
          applicationContext={applicationContext}
          handleApplicationContextChange={handleApplicationContextChange}
          resumeText={resumeText}
          setResumeText={setResumeText}
          newProfileId={newProfileId}
          setNewProfileId={setNewProfileId}
          draftProfileId={draftProfileId}
          isDraftProfileActive={isDraftProfileActive}
          showW1TailorAction={showW1TailorAction}
          showW1ReviewCards={showW1ReviewCards}
          buildCompanySuffixProfileId={buildCompanySuffixProfileId}
          reviewLayoutRef={reviewLayoutRef}
          reviewLayoutStyle={reviewLayoutStyle}
          reviewSectionRef={reviewSectionRef}
          pdfPreviewUrl={pdfPreviewUrl}
          isPdfGenerating={isPdfGenerating}
          isPdfDownloading={isPdfDownloading}
          resolveTemplateThemeColor={resolveTemplateThemeColor}
          handleThemeColorChange={handleThemeColorChange}
          handleShowProfileImageChange={handleShowProfileImageChange}
          handleHipsterHeaderAlignChange={handleHipsterHeaderAlignChange}
          handleHipsterHeaderTitleSizeChange={handleHipsterHeaderTitleSizeChange}
          handleHipsterHeaderSubtitleSizeChange={handleHipsterHeaderSubtitleSizeChange}
          handleUpdatePdfPreview={handleUpdatePdfPreview}
          handleDownloadPdf={handleDownloadPdf}
          pendingPreviewSaveCount={pendingPreviewSaveCount}
          handleReviewResizeStart={handleReviewResizeStart}
          selectedModel={selectedModel}
          lmTimeout={lmTimeout}
          handleCvDraftStateChange={handleCvDraftStateChange}
          setCvPreviewPayload={setCvPreviewPayload}
          handleCvReviewProfileSaved={handleCvReviewProfileSaved}
          isJobReviewReadOnly={isJobReviewReadOnly}
          openJobEditDecisionDialog={openJobEditDecisionDialog}
          handleUploadProfileImage={handleUploadProfileImage}
          handleClearProfileImage={handleClearProfileImage}
          isUploadingProfileImage={isUploadingProfileImage}
          isW1CvWorkflow={isW1CvWorkflow}
          w1UiState={w1UiState}
          showJobCoverPanel={showJobCoverPanel}
          showJobCvEntryPanel={showJobCvEntryPanel}
          isJobCvChoiceStep={isJobCvChoiceStep}
          handleChooseCreateJobCv={handleChooseCreateJobCv}
          handleChooseBranchJobCv={handleChooseBranchJobCv}
          isJobCvCreateStep={isJobCvCreateStep}
          isJobCvBranchReviewStep={isJobCvBranchReviewStep}
          handleNewbieDraftGenerated={handleNewbieDraftGenerated}
          handleBranchDraftGenerated={handleBranchDraftGenerated}
          onBeforeStepLeave={handleCreateStepLeave}
          isJobCvBranchStep={isJobCvBranchStep}
          handleStartCvReview={handleStartCvReview}
          jobEditDecisionModal={jobEditDecisionModal}
        />
        <CvIdModal
          isOpen={isCvIdModalOpen}
          title="Choose CV id"
          helperText="Pick a CV id to save this draft and continue editing."
          inputLabel="CV id"
          inputId="newbieCvId"
          value={cvIdInput}
          onChange={(value) => {
            setCvIdInput(value);
            if (cvIdError) setCvIdError("");
          }}
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
            <CreateCvView
              isNewbieCreateMode={isNewbieCreateMode}
              cvTemplateId={cvTemplateId}
              onTemplateIdChange={handleTemplateIdChange}
              cvOutputLanguage={cvOutputLanguage}
              onCvOutputLanguageChange={setCvOutputLanguage}
              resumeText={resumeText}
              onResumeTextChange={setResumeText}
              applicationContext={applicationContext}
              onApplicationContextChange={handleApplicationContextChange}
              onNewbieDraftGenerated={handleNewbieDraftGenerated}
              cvReview={cvReview}
              createReviewLayoutRef={createReviewLayoutRef}
              createReviewLayoutStyle={createReviewLayoutStyle}
              createReviewSectionRef={createReviewSectionRef}
              pdfPreviewUrl={pdfPreviewUrl}
              isPdfGenerating={isPdfGenerating}
              isPdfDownloading={isPdfDownloading}
              resolveTemplateThemeColor={resolveTemplateThemeColor}
              onThemeColorChange={handleThemeColorChange}
              onShowProfileImageChange={handleShowProfileImageChange}
              onHipsterHeaderAlignChange={handleHipsterHeaderAlignChange}
              onHipsterHeaderTitleSizeChange={handleHipsterHeaderTitleSizeChange}
              onHipsterHeaderSubtitleSizeChange={handleHipsterHeaderSubtitleSizeChange}
              onUpdatePdfPreview={handleUpdatePdfPreview}
              onDownloadPdf={handleDownloadPdf}
              unsyncedSaveCount={pendingPreviewSaveCount}
              onCreateReviewResizeStart={handleCreateReviewResizeStart}
              selectedModel={selectedModel}
              lmTimeout={lmTimeout}
              onCvDraftStateChange={handleCvDraftStateChange}
              onPreviewPayloadChange={setCvPreviewPayload}
              onCvReviewProfileSaved={handleCvReviewProfileSaved}
              onUploadProfileImage={handleUploadProfileImage}
              onClearProfileImage={handleClearProfileImage}
              isUploadingProfileImage={isUploadingProfileImage}
              cvProfiles={cvProfiles}
              profilesLoading={profilesLoading}
              profilesError={profilesError}
              selectedProfileId={selectedProfileId}
              onSelectedProfileIdChange={setSelectedProfileId}
              onProfileRowSelect={handleProfileRowSelect}
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
              isProfileBulkActionBusy={isProfileBulkActionBusy}
              remapProgress={cvRemapProgress}
              cvEntryError={cvEntryError}
              newProfileId={newProfileId}
              onNewProfileIdChange={setNewProfileId}
              draftProfileId={draftProfileId}
              isDraftProfileActive={isDraftProfileActive}
              onBeforeStepLeave={handleCreateStepLeave}
            />
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
        onChange={(value) => {
          setCvIdInput(value);
          if (cvIdError) setCvIdError("");
        }}
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

      {jobEditDecisionModal}
    </Box>
  );
}
