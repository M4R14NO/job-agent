import { useEffect, useRef, useState } from "react";
import {
  enrichLinkedInJobs,
  fetchQueryDebug,
  rerankJobs,
  searchJobs
} from "./api/search";
import {
  deleteCvProfile,
  fetchModels,
  getCvProfile,
  listCvProfiles,
  parseCvCanonical,
  renderCvFromTemplate,
  saveCvProfile,
  uploadCvProfileImage
} from "./api/llm";
import { useJobDescription } from "./hooks/useJobDescription";
import SearchFilters from "./components/SearchFilters";
import { JobActionsCard, JobDetailsCard, PdfPreviewCard } from "./components/JobModal";
import CvEntry from "./components/CvEntry";
import CvReview from "./components/CvReview";
import CreateCvView from "./components/CreateCvView";
import CvDraftWizard from "./components/cvNewbie/CvDraftWizard";
import FindJobsView from "./components/FindJobsView";
import CvIdModal from "./components/CvIdModal";
import OverwriteConfirmationModal from "./components/OverwriteConfirmationModal";
import { Box, Grid, GridItem } from "@chakra-ui/react";

const CACHE_KEY = "job-agent:search-response";
const SIDEBAR_WIDTH_KEY = "job-agent:sidebar-width";
const SIDEBAR_MIN_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 720;
const REVIEW_PREVIEW_MIN_WIDTH = 360;
const REVIEW_EDITOR_MIN_WIDTH = 420;
const REVIEW_SPLITTER_WIDTH = 14;
const SEARCH_BATCH_SIZE = 4;
const PDF_PREVIEW_DEBOUNCE_MS = 5000;
const CANONICAL_SCHEMA_VERSION = "v1";
const DEFAULT_TEMPLATE_THEME_COLORS = {
  awesomecv: "#C0392B",
  hipstercv: "#496E8C"
};

const getJobStableId = (job, fallbackIndex = 0) => {
  if (!job || typeof job !== "object") return `job-${fallbackIndex}`;
  const jobUrl = String(job.job_url || "").trim();
  if (jobUrl) return `url:${jobUrl}`;
  const title = String(job.title || "").trim().toLowerCase();
  const company = String(job.company || job.company_name || "").trim().toLowerCase();
  const location = String(job.location || "").trim().toLowerCase();
  const site = String(job.site || "").trim().toLowerCase();
  return `sig:${title}|${company}|${location}|${site}|${fallbackIndex}`;
};

const mergeResponseStable = (previous, incoming, options = {}) => {
  const preserveRichDetails = Boolean(options.preserveRichDetails);
  if (!incoming || !Array.isArray(incoming.jobs)) {
    return incoming;
  }

  const prevJobs = Array.isArray(previous?.jobs) ? previous.jobs : [];
  const prevKeys = new Set(prevJobs.map((job, index) => getJobStableId(job, index)));
  const incomingByKey = new Map(
    incoming.jobs.map((job, index) => [getJobStableId(job, index), job])
  );

  const mergedJobs = [];
  prevJobs.forEach((job, index) => {
    const key = getJobStableId(job, index);
    const next = incomingByKey.get(key);
    if (!next) {
      mergedJobs.push(job);
      return;
    }

    const merged = { ...job, ...next };

    // mark rows that just received their description for the first time (detailed pass)
    if (!preserveRichDetails) {
      const hadDescription = (job.description || "").trim().length > 0;
      const nowHasDescription = (next.description || "").trim().length > 0;
      if (!hadDescription && nowHasDescription) {
        merged._enrichedAt = Date.now();
      } else {
        merged._enrichedAt = job._enrichedAt ?? null;
      }
    }

    if (preserveRichDetails) {
      const prevDescription = String(job.description || "");
      const nextDescription = String(next.description || "");
      if (prevDescription.length > nextDescription.length) {
        merged.description = job.description;
      }

      const prevJobDescription = String(job.job_description || "");
      const nextJobDescription = String(next.job_description || "");
      if (prevJobDescription.length > nextJobDescription.length) {
        merged.job_description = job.job_description;
      }

      const prevSnippet = String(job.snippet || "");
      const nextSnippet = String(next.snippet || "");
      if (prevSnippet.length > nextSnippet.length) {
        merged.snippet = job.snippet;
      }

      if (job.rerank_score != null && next.rerank_score == null) {
        merged.rerank_score = job.rerank_score;
      }

      const nextReasons = Array.isArray(next.match_reasons) ? next.match_reasons : [];
      const prevReasons = Array.isArray(job.match_reasons) ? job.match_reasons : [];
      if (prevReasons.length > nextReasons.length) {
        merged.match_reasons = prevReasons;
      }
    }

    mergedJobs.push(merged);
  });

  incoming.jobs.forEach((job, index) => {
    const key = getJobStableId(job, index);
    if (!prevKeys.has(key)) {
      mergedJobs.push(job);
    }
  });

  return {
    ...incoming,
    jobs: mergedJobs,
  };
};

const mergeLinkedInEnrichedJobs = (previous, enrichItems) => {
  if (!previous || !Array.isArray(previous.jobs) || !Array.isArray(enrichItems)) {
    return previous;
  }

  const enrichByUrl = new Map(
    enrichItems
      .filter((item) => item)
      .map((item) => [String(item.job_url || "").trim(), item])
      .filter(([jobUrl]) => jobUrl)
  );

  if (!enrichByUrl.size) {
    return previous;
  }

  const jobs = previous.jobs.map((job) => {
    const jobUrl = String(job?.job_url || "").trim();
    const item = enrichByUrl.get(jobUrl);
    if (!item) {
      return job;
    }

    const hadDescription = String(job.description || job.job_description || "").trim().length > 0;
    const nextDescription = String(item.description || "").trim();

    if (item.status === "ok" && (nextDescription || item.description_html)) {
      return {
        ...job,
        description: nextDescription,
        job_description: nextDescription,
        description_html: item.description_html || null,
        _detailsFetched: true,
        _detailsStatus: "ok",
        _detailsError: null,
        _enrichedAt: hadDescription ? (job._enrichedAt ?? null) : Date.now(),
      };
    }

    return {
      ...job,
      _detailsFetched: false,
      _detailsStatus: item.status || "error",
      _detailsError: item.error || null,
    };
  });

  return {
    ...previous,
    jobs,
  };
};

const isTransientDetailsFailure = (item) => {
  if (!item) return false;
  if (item.status === "timeout") return true;
  if (item.status !== "http_error") return false;
  const msg = String(item.error || "");
  return /HTTP\s(429|502|503|504)/i.test(msg);
};

const normalizeHexColor = (value, fallback = null) => {
  const raw = String(value || "").trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return fallback;
  return `#${match[1].toUpperCase()}`;
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

export default function App() {
  const [resumeText, setResumeText] = useState("");
  const [wishes, setWishes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [location, setLocation] = useState("");
  const [searchRadiusKm, setSearchRadiusKm] = useState(null);
  const [resultsWanted, setResultsWanted] = useState(10);
  const [hoursOld, setHoursOld] = useState(72);
  const [isRemote, setIsRemote] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [cvReview, setCvReview] = useState(null);
  const [isJobReviewReadOnly, setIsJobReviewReadOnly] = useState(false);
  const [pendingNewbieDraft, setPendingNewbieDraft] = useState(null);
  const [isCvIdModalOpen, setIsCvIdModalOpen] = useState(false);
  const [cvIdInput, setCvIdInput] = useState("");
  const [cvIdError, setCvIdError] = useState("");
  const [isSavingCvId, setIsSavingCvId] = useState(false);
  const [models, setModels] = useState([]);
  const [modelError, setModelError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [lmTimeout, setLmTimeout] = useState(120);
  const [enableRerank, setEnableRerank] = useState(false);
  const [rerankTopN, setRerankTopN] = useState(null);
  const [weightEmbedding, setWeightEmbedding] = useState(0.8);
  const [weightKeyword, setWeightKeyword] = useState(0.2);
  const [cachedResponse, setCachedResponse] = useState(null);
  const [cachedAt, setCachedAt] = useState("");
  const [cvProfiles, setCvProfiles] = useState([]);
  const [profilesError, setProfilesError] = useState("");
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [isProfileBulkActionBusy, setIsProfileBulkActionBusy] = useState(false);
  const [isCreatingProfileEntry, setIsCreatingProfileEntry] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draftProfileId, setDraftProfileId] = useState("");
  const [isDraftProfileActive, setIsDraftProfileActive] = useState(false);
  const [newProfileId, setNewProfileId] = useState("default");
  const [cvTemplateId, setCvTemplateId] = useState("awesomecv");
  const [cvOutputLanguage, setCvOutputLanguage] = useState("english");
  const [cvEntryError, setCvEntryError] = useState("");
  const [applicationContext, setApplicationContext] = useState(EMPTY_APPLICATION_CONTEXT);
  const [loadedProfileSnapshot, setLoadedProfileSnapshot] = useState({
    profile_id: "",
    revision: 0,
    updated_at: null,
    raw_resume_text: "",
    ...EMPTY_APPLICATION_CONTEXT
  });
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
  const [activeJobAction, setActiveJobAction] = useState("none");
  const [jobCvEntryStep, setJobCvEntryStep] = useState("choice");
  const [selectedRerankProfileId, setSelectedRerankProfileId] = useState("");
  const [rerankProfileError, setRerankProfileError] = useState("");
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);
  const [searchPhaseMessage, setSearchPhaseMessage] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [reviewPreviewWidth, setReviewPreviewWidth] = useState(null);
  const [createReviewPreviewWidth, setCreateReviewPreviewWidth] = useState(null);
  const [cvPreviewPayload, setCvPreviewPayload] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [pendingPreviewSaveCount, setPendingPreviewSaveCount] = useState(0);
  const [cvThemeColors, setCvThemeColors] = useState(DEFAULT_TEMPLATE_THEME_COLORS);
  const [isReranking, setIsReranking] = useState(false);
  const [isJobDetailsPanelVisible, setIsJobDetailsPanelVisible] = useState(false);
  const [isProfileBrowserPanelVisible, setIsProfileBrowserPanelVisible] = useState(false);
  const [activeReviewNav, setActiveReviewNav] = useState("review");

  const searchTimerRef = useRef(null);
  const cvRemapTimerRef = useRef(null);
  const pdfPreviewTimerRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveHandlerRef = useRef(null);
  const lastAutosaveSnapshotRef = useRef("");
  const pdfPreviewTemplateRef = useRef("");
  const hasRenderedPdfPreviewRef = useRef(false);
  const shouldAutoRenderNewbiePreviewRef = useRef(false);
  const pdfPreviewStructureRef = useRef("");
  const pdfPreviewRequestVersionRef = useRef(0);
  const cvDraftHashRef = useRef("");
  const searchRequestIdRef = useRef(0);
  const searchAbortControllerRef = useRef(null);
  const queryDebugDataRef = useRef(null);
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

  const jobs = response?.jobs ?? [];
  const descriptionHtml = useJobDescription(selectedJob);
  const isFindView = activeView === "find";
  const isNewbieCreateMode = activeView === "create" && createMode === "newbie";
  const isW1CvWorkflow = Boolean(selectedJob) && activeJobAction === "cv";
  const isJobCvChoiceStep = isW1CvWorkflow && jobCvEntryStep === "choice";
  const isJobCvCreateStep = isW1CvWorkflow && jobCvEntryStep === "create";
  const isJobCvBranchStep = isW1CvWorkflow && jobCvEntryStep === "branch";
  const shouldRenderW1StandaloneReview = Boolean(cvReview) && !isJobCvCreateStep;
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

  const persistSearchCache = (nextResponse) => {
    if (!nextResponse) return;
    const savedAt = new Date().toISOString();
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        savedAt,
        response: nextResponse,
        resumeText,
        wishes,
        searchTerm,
        location,
        searchRadiusKm,
        resultsWanted,
        hoursOld,
        isRemote,
        sites: ["linkedin"],
        selectedModel,
        lmTimeout,
        enableRerank,
        rerankTopN,
        weightEmbedding,
        weightKeyword
      })
    );
    setCachedResponse(nextResponse);
    setCachedAt(savedAt);
  };

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
    let isMounted = true;
    fetchModels()
      .then((available) => {
        if (!isMounted) return;
        setModels(available);
        if (!selectedModel && available.length > 0) {
          setSelectedModel(available[0]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setModelError(err instanceof Error ? err.message : "Failed to load models");
      });
    return () => {
      isMounted = false;
    };
  }, []);

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

  const loadProfiles = async (preferredProfileId = "") => {
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const data = await listCvProfiles();
      const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
      setCvProfiles(profiles);
      setSelectedRerankProfileId((prev) => {
        if (prev && profiles.some((profile) => profile.profile_id === prev)) {
          return prev;
        }
        return profiles[0]?.profile_id || "";
      });
      if (!profiles.length) {
        setSelectedProfileId("");
      } else if (preferredProfileId && profiles.some((profile) => profile.profile_id === preferredProfileId)) {
        setSelectedProfileId(preferredProfileId);
      } else if (!selectedProfileId) {
        setSelectedProfileId(profiles[0].profile_id || "");
      }
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setProfilesLoading(false);
    }
  };

  const handleCvReviewProfileSaved = async (savedProfile) => {
    const savedProfileId = savedProfile?.profile_id || "";
    if (!savedProfileId) return;
    setSelectedProfileId(savedProfileId);
    setNewProfileId(savedProfileId);
    setCvReview((prev) => (prev ? { ...prev, canonical: savedProfile, templateId: savedProfile.template_id || prev.templateId } : prev));
    setLoadedProfileSnapshot(contextSnapshotFromProfile(savedProfile));
    upsertCvProfileInList(savedProfile);
    const nextSnapshot = buildAutosavePayload();
    if (nextSnapshot) {
      lastAutosaveSnapshotRef.current = JSON.stringify(nextSnapshot);
    }
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

  const buildExportFilename = () => {
    const datePart = new Date().toISOString().slice(0, 10);
    return `cv-profiles-${datePart}.json`;
  };

  const downloadJson = (payload, filename) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteProfiles = async (profileIds = []) => {
    const ids = Array.from(new Set((profileIds || []).filter(Boolean)));
    if (!ids.length) return;

    setIsProfileBulkActionBusy(true);
    setCvEntryError("");
    try {
      const failedIds = [];
      for (const id of ids) {
        try {
          await deleteCvProfile(id);
        } catch (_err) {
          failedIds.push(id);
        }
      }

      const deletedIds = ids.filter((id) => !failedIds.includes(id));
      if (deletedIds.length) {
        setCvProfiles((prev) => prev.filter((profile) => !deletedIds.includes(profile.profile_id)));
      }

      if (deletedIds.includes(selectedProfileId)) {
        clearCreatePreviewState();
        setSelectedProfileId("");
        setDraftProfileId("");
        setIsDraftProfileActive(false);
        setNewProfileId("");
        setResumeText("");
        setApplicationContext({ ...EMPTY_APPLICATION_CONTEXT });
        setLoadedProfileSnapshot({
          profile_id: "",
          revision: 0,
          updated_at: null,
          raw_resume_text: "",
          ...EMPTY_APPLICATION_CONTEXT
        });
      }

      if (deletedIds.includes(selectedRerankProfileId)) {
        setSelectedRerankProfileId("");
      }

      await loadProfiles();

      if (!failedIds.length) {
        setCvEntryError(`Deleted ${deletedIds.length} profile(s).`);
      } else {
        setCvEntryError(
          `Deleted ${deletedIds.length} profile(s). Failed to delete ${failedIds.length}: ${failedIds.join(", ")}`
        );
      }
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to delete selected profiles.");
    } finally {
      setIsProfileBulkActionBusy(false);
    }
  };

  const handleExportProfiles = async (profileIds = []) => {
    const ids = Array.from(new Set((profileIds || []).filter(Boolean)));
    if (!ids.length) return;

    setIsProfileBulkActionBusy(true);
    setCvEntryError("");
    try {
      // Use one list call instead of many profile calls to avoid partial exports when requests fail.
      const listed = await listCvProfiles();
      const allProfiles = Array.isArray(listed?.profiles) ? listed.profiles : [];
      const profileById = new Map(
        allProfiles
          .filter((profile) => profile?.profile_id)
          .map((profile) => [profile.profile_id, profile])
      );
      const exported = ids
        .map((id) => profileById.get(id))
        .filter(Boolean);
      const failedIds = ids.filter((id) => !profileById.has(id));

      if (!exported.length) {
        throw new Error("No profiles could be exported.");
      }

      downloadJson(
        {
          // Keep export format storage-compatible so imports can consume it reliably.
          profiles: exported
        },
        buildExportFilename()
      );

      if (!failedIds.length) {
        setCvEntryError(`Exported ${exported.length} profile(s).`);
      } else {
        setCvEntryError(
          `Exported ${exported.length} profile(s). Failed to export ${failedIds.length}: ${failedIds.join(", ")}`
        );
      }
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to export profiles.");
    } finally {
      setIsProfileBulkActionBusy(false);
    }
  };

  const handleImportProfiles = async ({ profiles = [], overwriteExisting = true } = {}) => {
    const incomingProfiles = Array.isArray(profiles) ? profiles : [];
    if (!incomingProfiles.length) return;

    const resolveImportedProfileId = (profile) =>
      String(
        profile?.profile_id
        || profile?.profileId
        || profile?.id
        || profile?.name
        || ""
      ).trim();

    const normalizeImportedProfile = ({ profilePayload, profileId, existing }) => {
      const candidate = profilePayload?.profile && typeof profilePayload.profile === "object"
        ? profilePayload.profile
        : profilePayload;

      const normalizedData = candidate?.data && typeof candidate.data === "object" && !Array.isArray(candidate.data)
        ? candidate.data
        : (existing?.data || {});

      const normalizedAudit = candidate?.audit && typeof candidate.audit === "object" && !Array.isArray(candidate.audit)
        ? candidate.audit
        : (existing?.audit || {});

      return {
        schema_version: candidate?.schema_version || existing?.schema_version || CANONICAL_SCHEMA_VERSION,
        profile_id: profileId,
        revision: existing ? (existing.revision ?? 0) : 0,
        template_id: candidate?.template_id || existing?.template_id || "awesomecv",
        data: normalizedData,
        company: candidate?.company ?? existing?.company ?? null,
        application_status: candidate?.application_status ?? existing?.application_status ?? null,
        application_date: candidate?.application_date ?? existing?.application_date ?? null,
        job_title: candidate?.job_title ?? existing?.job_title ?? null,
        job_description: candidate?.job_description ?? existing?.job_description ?? null,
        job_url: candidate?.job_url ?? existing?.job_url ?? null,
        theme_color: candidate?.theme_color ?? existing?.theme_color ?? null,
        show_profile_image: typeof candidate?.show_profile_image === "boolean"
          ? candidate.show_profile_image
          : (existing?.show_profile_image ?? true),
        header_text_align: candidate?.header_text_align ?? existing?.header_text_align ?? "right",
        header_title_size: candidate?.header_title_size ?? existing?.header_title_size ?? "Huge",
        header_subtitle_size: candidate?.header_subtitle_size ?? existing?.header_subtitle_size ?? "Large",
        parent_profile_id: candidate?.parent_profile_id ?? existing?.parent_profile_id ?? null,
        lineage_root_profile_id: candidate?.lineage_root_profile_id ?? existing?.lineage_root_profile_id ?? profileId,
        lineage_depth: Number.isFinite(candidate?.lineage_depth)
          ? Number(candidate.lineage_depth)
          : (existing?.lineage_depth ?? 0),
        branch_reason: candidate?.branch_reason ?? existing?.branch_reason ?? null,
        section_order: Array.isArray(candidate?.section_order)
          ? candidate.section_order
          : (existing?.section_order || []),
        sidebar_section_order: Array.isArray(candidate?.sidebar_section_order)
          ? candidate.sidebar_section_order
          : (existing?.sidebar_section_order || []),
        main_section_order: Array.isArray(candidate?.main_section_order)
          ? candidate.main_section_order
          : (existing?.main_section_order || []),
        section_labels: candidate?.section_labels && typeof candidate.section_labels === "object" && !Array.isArray(candidate.section_labels)
          ? candidate.section_labels
          : (existing?.section_labels || undefined),
        audit: normalizedAudit
      };
    };

    setIsProfileBulkActionBusy(true);
    setCvEntryError("");
    try {
      const uniqueById = new Map();
      incomingProfiles.forEach((profile) => {
        const id = resolveImportedProfileId(profile);
        if (!id) return;
        uniqueById.set(id, { ...profile, profile_id: id });
      });

      const stats = {
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0
      };

      for (const [profileId, profilePayload] of uniqueById.entries()) {
        let existing = null;
        try {
          existing = await getCvProfile(profileId);
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          if (!message.includes("status 404")) {
            throw err;
          }
        }

        if (existing && !overwriteExisting) {
          stats.skipped += 1;
          continue;
        }

        const savePayload = normalizeImportedProfile({
          profilePayload,
          profileId,
          existing
        });

        try {
          await saveCvProfile(profileId, savePayload);
          if (existing) {
            stats.updated += 1;
          } else {
            stats.created += 1;
          }
        } catch (_err) {
          stats.failed += 1;
        }
      }

      await loadProfiles();
      setCvEntryError(
        `Import done. Created: ${stats.created}, updated: ${stats.updated}, skipped: ${stats.skipped}, failed: ${stats.failed}.`
      );
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to import profiles.");
    } finally {
      setIsProfileBulkActionBusy(false);
    }
  };

  const contextFromProfile = (profile) => ({
    company: profile?.company || "",
    application_status: profile?.application_status || "",
    application_date: profile?.application_date || "",
    job_title: profile?.job_title || "",
    job_description: profile?.job_description || "",
    job_url: profile?.job_url || "",
    profile_image: profile?.data?.profile_image || "",
    theme_color: profile?.theme_color || "",
    show_profile_image: profile?.show_profile_image !== false,
    header_text_align: profile?.header_text_align || "right",
    header_title_size: profile?.header_title_size || "Huge",
    header_subtitle_size: profile?.header_subtitle_size || "Large"
  });

  const contextSnapshotFromProfile = (profile) => ({
    profile_id: profile?.profile_id || "",
    revision: profile?.revision ?? 0,
    updated_at: profile?.updated_at || null,
    raw_resume_text: profile?.audit?.raw_resume_text || "",
    ...contextFromProfile(profile)
  });

  const buildApplicationContextDiff = () => {
    const current = {
      raw_resume_text: resumeText,
      ...applicationContext
    };
    const previous = {
      raw_resume_text: loadedProfileSnapshot.raw_resume_text || "",
      company: loadedProfileSnapshot.company || "",
      application_status: loadedProfileSnapshot.application_status || "",
      application_date: loadedProfileSnapshot.application_date || "",
      job_title: loadedProfileSnapshot.job_title || "",
      job_description: loadedProfileSnapshot.job_description || "",
      job_url: loadedProfileSnapshot.job_url || "",
      profile_image: loadedProfileSnapshot.profile_image || "",
      theme_color: loadedProfileSnapshot.theme_color || "",
      show_profile_image: loadedProfileSnapshot.show_profile_image !== false,
      header_text_align: loadedProfileSnapshot.header_text_align || "right",
      header_title_size: loadedProfileSnapshot.header_title_size || "Huge",
      header_subtitle_size: loadedProfileSnapshot.header_subtitle_size || "Large"
    };

    const config = [
      ["raw_resume_text", "CV text"],
      ["company", "Company"],
      ["application_status", "Application status"],
      ["application_date", "Application date"],
      ["job_title", "Job title"],
      ["job_description", "Job description"],
      ["job_url", "Job URL"],
      ["profile_image", "Profile image"],
      ["theme_color", "Theme color"],
      ["show_profile_image", "Show profile image"],
      ["header_text_align", "Header text align"],
      ["header_title_size", "Header title size"],
      ["header_subtitle_size", "Header subtitle size"]
    ];

    const topLevelChanges = config
      .filter(([key]) => JSON.stringify(previous[key] || "") !== JSON.stringify(current[key] || ""))
      .map(([key, label]) => ({
        key,
        label,
        oldValue: String(previous[key] || "(empty)"),
        newValue: String(current[key] || "(empty)")
      }));

    return {
      topLevelChanges,
      totals: { added: 0, removed: 0, updated: topLevelChanges.length },
      hasChanges: topLevelChanges.length > 0
    };
  };

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

  const shouldAutoRenderPdfPreview = !isNewbieCreateMode;

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
    }

    if (shouldRenderImmediately) {
      hasRenderedPdfPreviewRef.current = true;
      handleUpdatePdfPreview();
      return undefined;
    }

    pdfPreviewTimerRef.current = setTimeout(() => {
      hasRenderedPdfPreviewRef.current = true;
      handleUpdatePdfPreview();
    }, PDF_PREVIEW_DEBOUNCE_MS);

    return () => {
      if (pdfPreviewTimerRef.current) {
        clearTimeout(pdfPreviewTimerRef.current);
        pdfPreviewTimerRef.current = null;
      }
    };
  }, [cvPreviewPayload, cvReview?.templateId, cvThemeColors, applicationContext?.show_profile_image, applicationContext?.theme_color, applicationContext?.header_text_align, applicationContext?.header_title_size, applicationContext?.header_subtitle_size, shouldAutoRenderPdfPreview]);

  useEffect(() => {
    if (!isNewbieCreateMode) return;
    if (!shouldAutoRenderNewbiePreviewRef.current) return;
    if (!cvReview || !cvPreviewPayload) return;
    shouldAutoRenderNewbiePreviewRef.current = false;
    handleUpdatePdfPreview();
  }, [isNewbieCreateMode, cvReview, cvPreviewPayload]);

  useEffect(() => {
    if (!isLoading) {
      setSearchElapsedMs(0);
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      return undefined;
    }
    const start = Date.now();
    setSearchElapsedMs(0);
    searchTimerRef.current = setInterval(() => {
      setSearchElapsedMs(Date.now() - start);
    }, 500);
    return () => {
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [isLoading]);

  useEffect(() => () => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
  }, []);

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

  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached);
      if (parsed?.response) {
        setCachedResponse(parsed.response);
        setCachedAt(parsed.savedAt || "");
        if (typeof parsed.resumeText === "string") setResumeText(parsed.resumeText);
        if (typeof parsed.wishes === "string") setWishes(parsed.wishes);
        if (typeof parsed.searchTerm === "string") setSearchTerm(parsed.searchTerm);
        if (typeof parsed.location === "string") setLocation(parsed.location);
        if (typeof parsed.searchRadiusKm === "number" || parsed.searchRadiusKm === null) {
          setSearchRadiusKm(parsed.searchRadiusKm ?? null);
        }
        if (typeof parsed.resultsWanted === "number") setResultsWanted(parsed.resultsWanted);
        if (typeof parsed.hoursOld === "number") setHoursOld(parsed.hoursOld);
        if (typeof parsed.isRemote === "boolean") setIsRemote(parsed.isRemote);
        if (typeof parsed.selectedModel === "string") setSelectedModel(parsed.selectedModel);
        if (typeof parsed.lmTimeout === "number") setLmTimeout(parsed.lmTimeout);
        if (typeof parsed.enableRerank === "boolean") setEnableRerank(parsed.enableRerank);
        if (typeof parsed.rerankTopN === "number" || parsed.rerankTopN === null) setRerankTopN(parsed.rerankTopN ?? null);
        if (typeof parsed.weightEmbedding === "number") setWeightEmbedding(parsed.weightEmbedding);
        if (typeof parsed.weightKeyword === "number") setWeightKeyword(parsed.weightKeyword);
      }
    } catch (err) {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }, []);

  const handleSearch = async () => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    searchAbortControllerRef.current = abortController;

    const baseInput = {
      resumeText,
      wishes,
      selectedRerankProfileId,
      searchTerm,
      location,
      searchRadiusKm,
      resultsWanted,
      hoursOld,
      isRemote,
      sites: ["linkedin"],
      model: selectedModel,
      lmTimeout,
      rerankTopN,
      weightEmbedding,
      weightKeyword
    };

    setIsLoading(true);
    setError("");
    setResponse(null);
    setSearchPhaseMessage("Loading LinkedIn results...");
    queryDebugDataRef.current = null;

    try {
      let finalData = null;

      const quickData = await searchJobs({
        ...baseInput,
        enableRerank: false
      }, { signal: abortController.signal });
      if (requestId !== searchRequestIdRef.current) return;

      finalData = mergeResponseStable(null, quickData);
      setResponse(finalData);

      const jobsNeedingDetails = (finalData.jobs || [])
        .filter((job) => String(job.site || "").toLowerCase() === "linkedin")
        .filter((job) => (job.description || job.job_description || "").trim().length === 0)
        .filter((job) => String(job.job_url || "").trim().length > 0);

      const totalNeedingDetails = jobsNeedingDetails.length;
      const totalBatches = Math.ceil(totalNeedingDetails / SEARCH_BATCH_SIZE);
      const retriedUrls = new Set();

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const start = batchIndex * SEARCH_BATCH_SIZE;
        const end = Math.min(start + SEARCH_BATCH_SIZE, totalNeedingDetails);
        const batch = jobsNeedingDetails.slice(start, end);
        const batchLabel = `${batchIndex + 1}/${totalBatches}`;

        setSearchPhaseMessage(
          `Batch ${batchLabel}: enriching ${end}/${totalNeedingDetails} LinkedIn jobs...`
        );

        const enrichedItems = await enrichLinkedInJobs(
          batch.map((job) => ({ job_url: job.job_url })),
          { signal: abortController.signal }
        );
        if (requestId !== searchRequestIdRef.current) return;

        const retryCandidates = enrichedItems.filter((item) => {
          const jobUrl = String(item?.job_url || "").trim();
          if (!jobUrl || retriedUrls.has(jobUrl)) return false;
          return isTransientDetailsFailure(item);
        });

        let finalEnrichedItems = enrichedItems;
        if (retryCandidates.length > 0) {
          retryCandidates.forEach((item) => {
            retriedUrls.add(String(item.job_url || "").trim());
          });

          setSearchPhaseMessage(
            `Batch ${batchLabel}: retrying ${retryCandidates.length} transient detail fetches...`
          );

          const retriedItems = await enrichLinkedInJobs(
            retryCandidates.map((item) => ({ job_url: item.job_url })),
            { signal: abortController.signal }
          );
          if (requestId !== searchRequestIdRef.current) return;

          const retriedByUrl = new Map(
            retriedItems
              .map((item) => [String(item.job_url || "").trim(), item])
              .filter(([jobUrl]) => jobUrl)
          );

          finalEnrichedItems = enrichedItems.map((item) => {
            const jobUrl = String(item?.job_url || "").trim();
            return retriedByUrl.get(jobUrl) || item;
          });
        }

        finalData = mergeLinkedInEnrichedJobs(finalData, finalEnrichedItems);
        setResponse((prev) => mergeLinkedInEnrichedJobs(prev, finalEnrichedItems));
      }

      if (!finalData) return;

      persistSearchCache(finalData);
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsLoading(false);
        setSearchPhaseMessage("");
      }
    }
  };

  const handleRunRerank = async () => {
    if (!response?.jobs?.length) {
      setError("Run a search first before reranking the current results.");
      return;
    }
    if (!selectedModel) {
      setError("Select an AI model in the matching settings before running LLM matching.");
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);
    setIsReranking(true);
    setError("");
    setSearchPhaseMessage("Running LLM matching on current results...");
    setEnableRerank(true);

    try {
      const currentQueryDebug = await fetchQueryDebug(
        {
          resumeText,
          wishes,
          selectedRerankProfileId,
          model: selectedModel,
          lmTimeout
        },
        { signal: abortController.signal }
      );
      queryDebugDataRef.current = currentQueryDebug;

      const rerankData = await rerankJobs(
        {
          jobs: response.jobs,
          resumeText,
          wishes,
          selectedRerankProfileId: selectedRerankProfileId || currentQueryDebug.query_profile_id || response.query_profile_id || "",
          bm25Query: currentQueryDebug.bm25_query || response.bm25_query || null,
          bm25Language: currentQueryDebug.bm25_language || response.bm25_language || null,
          bm25Tokenizer: currentQueryDebug.bm25_tokenizer || response.bm25_tokenizer || null,
          bm25QueryTerms: currentQueryDebug.bm25_query_terms || response.bm25_query_terms || null,
          model: selectedModel,
          lmTimeout,
          rerankTopN,
          precisionWeightEmbedding: weightEmbedding,
          precisionWeightKeyword: weightKeyword
        },
        { signal: abortController.signal }
      );

      const mergedResponse = mergeResponseStable(response, rerankData, { preserveRichDetails: true });
      setResponse(mergedResponse);
      persistSearchCache(mergedResponse);
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to rerank current results.");
    } finally {
      setIsLoading(false);
      setIsReranking(false);
      setSearchPhaseMessage("");
    }
  };

  const handleSelectRerankProfile = async (profileId) => {
    setSelectedRerankProfileId(profileId || "");
    if (!profileId) {
      setRerankProfileError("");
      return;
    }

    setRerankProfileError("");
    try {
      const listedProfile = cvProfiles.find((profile) => profile.profile_id === profileId);
      const profile = listedProfile || await getCvProfile(profileId);
      const rawResume = profile?.audit?.raw_resume_text || "";
      setResumeText(rawResume);
      if (!rawResume.trim()) {
        setRerankProfileError("Selected CV profile has no saved CV text.");
      }
    } catch (err) {
      setRerankProfileError(err instanceof Error ? err.message : "Failed to load selected CV profile.");
    }
  };

  const handleLoadCache = () => {
    if (!cachedResponse) return;
    setError("");
    setResponse(cachedResponse);
    setSelectedJob(null);
  };

  const handleClearCache = () => {
    sessionStorage.removeItem(CACHE_KEY);
    setCachedResponse(null);
    setCachedAt("");
  };

  const handleStartCvReview = ({ canonical, job, templateId, docType, outputLanguage }) => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview({ canonical, job, templateId, docType, outputLanguage });
    setJobCvEntryStep("review");
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
    setActiveJobAction("cv");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = templateId || "awesomecv";
    pdfPreviewStructureRef.current = "";
  };

  const handleW1CreateDraftGenerated = ({ canonical, templateId, outputLanguage, jobContext }) => {
    const resolvedJob = selectedJob || {
      title: jobContext?.job_title || "",
      company: jobContext?.company || "",
      description: jobContext?.job_description || "",
      job_url: jobContext?.job_url || ""
    };

    pdfPreviewRequestVersionRef.current += 1;
    setCvReview({
      canonical,
      job: resolvedJob,
      templateId: templateId || cvTemplateId || "awesomecv",
      docType: "resume",
      outputLanguage: outputLanguage || cvOutputLanguage || "english",
      initialProfileId: canonical?.profile_id || "default"
    });
    setJobCvEntryStep("create");
    setIsJobReviewReadOnly(false);
    setCvTemplateId(templateId || cvTemplateId || "awesomecv");
    setApplicationContext((prev) => ({
      ...prev,
      company: jobContext?.company || resolvedJob.company || "",
      application_status: "",
      application_date: "",
      job_title: jobContext?.job_title || resolvedJob.title || "",
      job_description: jobContext?.job_description || resolvedJob.description || "",
      job_url: jobContext?.job_url || resolvedJob.job_url || ""
    }));
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = templateId || cvTemplateId || "awesomecv";
    pdfPreviewStructureRef.current = "";
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
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = templateId || cvTemplateId || "awesomecv";
    pdfPreviewStructureRef.current = "";
  };

  const clearCreatePreviewState = () => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview(null);
    setIsJobReviewReadOnly(false);
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    setPendingPreviewSaveCount(0);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
    shouldAutoRenderNewbiePreviewRef.current = false;
  };

  const handleNewbieDraftReady = ({ canonical, templateId, outputLanguage, jobContext }) => {
    pdfPreviewRequestVersionRef.current += 1;
    shouldAutoRenderNewbiePreviewRef.current = true;
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
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = templateId || "awesomecv";
    pdfPreviewStructureRef.current = "";
  };

  const handleNewbieDraftGenerated = ({ canonical, templateId, outputLanguage, jobContext }) => {
    openCvIdModal({ canonical, templateId, outputLanguage, jobContext });
  };

  const sanitizeProfileId = (value) => {
    const normalized = (value || "").trim().toLowerCase();
    const safe = normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return safe || `profile-${Date.now()}`;
  };

  const buildCvIdSuggestion = ({ jobTitle, existingIds }) => {
    const normalizedIds = new Set((existingIds || []).map((id) => String(id || "").toLowerCase()));
    const baseSlug = String(jobTitle || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const prefix = baseSlug ? `${baseSlug}-v` : "v";
    let version = 2;
    let candidate = `${prefix}${version}`;
    while (normalizedIds.has(candidate.toLowerCase())) {
      version += 1;
      candidate = `${prefix}${version}`;
    }
    return candidate;
  };


  const escapeRegexLiteral = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const buildJobDraftProfileId = ({ baseId, company }) => {
    const companySlug = sanitizeProfileId(company || "company");
    const base = sanitizeProfileId(baseId || "profile")
      .replace(/-v\d+$/, "")
      .replace(new RegExp(`-${escapeRegexLiteral(companySlug)}-draft(-v\\d+)?$`), "");
    return `${base}-${companySlug}-draft`;
  };

  const buildNextAvailableDraftProfileId = (draftBaseId) => {
    const normalizedBase = sanitizeProfileId(draftBaseId || "profile-draft");
    const exactExists = cvProfiles.some((profile) => profile.profile_id === normalizedBase);
    if (!exactExists) return normalizedBase;
    const suffixPattern = new RegExp(`^${escapeRegexLiteral(normalizedBase)}-v(\\d+)$`);
    const versions = cvProfiles
      .map((profile) => {
        const match = suffixPattern.exec(profile.profile_id || "");
        return match ? Number(match[1]) : null;
      })
      .filter((value) => Number.isFinite(value));
    const maxVersion = versions.length ? Math.max(...versions) : 1;
    return `${normalizedBase}-v${Math.max(2, maxVersion + 1)}`;
  };

  const normalizeContextValue = (value) => String(value || "").trim().toLowerCase();

  const doesLoadedProfileMatchCurrentJob = () => {
    if (!selectedJob || !selectedProfileId) return false;
    const loadedUrl = normalizeContextValue(loadedProfileSnapshot.job_url);
    const currentUrl = normalizeContextValue(selectedJob.job_url || applicationContext.job_url);
    if (loadedUrl && currentUrl) {
      return loadedUrl === currentUrl;
    }
    const loadedTitle = normalizeContextValue(loadedProfileSnapshot.job_title);
    const loadedCompany = normalizeContextValue(loadedProfileSnapshot.company);
    const currentTitle = normalizeContextValue(selectedJob.title || applicationContext.job_title);
    const currentCompany = normalizeContextValue(selectedJob.company || applicationContext.company);
    return Boolean(loadedTitle && loadedCompany && loadedTitle === currentTitle && loadedCompany === currentCompany);
  };

  const buildCompanySuffixProfileId = ({ baseId, company }) => {
    const base = sanitizeProfileId(baseId || "profile");
    const companySlug = sanitizeProfileId(company || "company");
    const withoutTrailingVersion = base.replace(/-v\d+$/, "");
    const withoutCompanySuffix = withoutTrailingVersion.replace(new RegExp(`-${companySlug}$`), "");
    return `${withoutCompanySuffix}-${companySlug}`;
  };

  const mergeProfileImageIntoData = (data, profileImage) => {
    const base = data && typeof data === "object" ? data : {};
    return {
      ...base,
      profile_image: (profileImage || "").trim() || null
    };
  };

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
      lastAutosaveSnapshotRef.current = JSON.stringify(payload);
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

  const buildLineageFields = ({ sourceProfile, nextProfileId, branchReason = null }) => {
    const targetId = sanitizeProfileId(nextProfileId || "profile");
    if (!sourceProfile?.profile_id) {
      return {
        parent_profile_id: null,
        lineage_root_profile_id: targetId,
        lineage_depth: 0,
        branch_reason: branchReason
      };
    }
    const sourceRoot = sourceProfile.lineage_root_profile_id || sourceProfile.profile_id;
    const sourceDepth = Number.isFinite(sourceProfile.lineage_depth)
      ? Number(sourceProfile.lineage_depth)
      : 0;
    return {
      parent_profile_id: sourceProfile.profile_id,
      lineage_root_profile_id: sourceRoot,
      lineage_depth: sourceDepth + 1,
      branch_reason: branchReason || "manual-branch"
    };
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
      const payload = {
        schema_version: CANONICAL_SCHEMA_VERSION,
        profile_id: nextProfileId,
        revision: 0,
        template_id: cvTemplateId || "awesomecv",
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
        parent_profile_id: null,
        lineage_root_profile_id: nextProfileId,
        lineage_depth: 0,
        branch_reason: null,
        data: mergeProfileImageIntoData({}, applicationContext.profile_image),
        section_order: [],
        sidebar_section_order: [],
        main_section_order: [],
        audit: {
          raw_resume_text: resumeText || ""
        }
      };
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

  const buildNextVersionedProfileId = (profileId) => {
    const normalized = (profileId || "profile").trim();
    const base = normalized.replace(/-v\d+$/, "") || "profile";
    const regex = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-v(\\d+)$`);
    const versionCandidates = cvProfiles
      .map((profile) => {
        const match = regex.exec(profile.profile_id || "");
        return match ? Number(match[1]) : null;
      })
      .filter((value) => Number.isFinite(value));
    const maxVersion = versionCandidates.length ? Math.max(...versionCandidates) : (normalized === base ? 1 : 0);
    return `${base}-v${Math.max(2, maxVersion + 1)}`;
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

      const payload = {
        ...basePayload,
        profile_id: currentProfileId,
        revision: existing.revision,
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
        parent_profile_id: basePayload.parent_profile_id ?? existing.parent_profile_id ?? null,
        lineage_root_profile_id: basePayload.lineage_root_profile_id ?? existing.lineage_root_profile_id ?? existing.profile_id,
        lineage_depth: basePayload.lineage_depth ?? existing.lineage_depth ?? 0,
        branch_reason: basePayload.branch_reason ?? existing.branch_reason ?? null,
        audit: {
          ...(existing.audit || {}),
          ...(basePayload.audit || {}),
          raw_resume_text: resumeText
        },
        data: mergeProfileImageIntoData(basePayload.data || existing.data, applicationContext.profile_image)
      };

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
      const basePayload = existing || {
        schema_version: CANONICAL_SCHEMA_VERSION,
        profile_id: targetProfileId,
        revision: 0,
        template_id: cvTemplateId || "awesomecv",
        parent_profile_id: null,
        lineage_root_profile_id: targetProfileId,
        lineage_depth: 0,
        branch_reason: null,
        data: {},
        section_order: [],
        sidebar_section_order: [],
        main_section_order: [],
        audit: {}
      };
      const payload = {
        ...basePayload,
        profile_id: targetProfileId,
        revision: basePayload.revision ?? 0,
        template_id: cvTemplateId || basePayload.template_id || "awesomecv",
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
        parent_profile_id: basePayload.parent_profile_id ?? null,
        lineage_root_profile_id: basePayload.lineage_root_profile_id ?? targetProfileId,
        lineage_depth: basePayload.lineage_depth ?? 0,
        branch_reason: basePayload.branch_reason ?? null,
        section_order: basePayload.section_order || [],
        sidebar_section_order: basePayload.sidebar_section_order || [],
        main_section_order: basePayload.main_section_order || [],
        audit: {
          ...(basePayload.audit || {}),
          raw_resume_text: resumeText
        },
        data: mergeProfileImageIntoData(basePayload.data, applicationContext.profile_image)
      };
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
          : buildNextVersionedProfileId(selectedProfileId))
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

      const isBranchFromSource = Boolean(
        existing?.profile_id &&
        nextProfileId !== existing.profile_id &&
        !existingTarget
      );
      const lineageFields = existingTarget
        ? {
          parent_profile_id: existingTarget.parent_profile_id ?? null,
          lineage_root_profile_id: existingTarget.lineage_root_profile_id ?? existingTarget.profile_id,
          lineage_depth: existingTarget.lineage_depth ?? 0,
          branch_reason: existingTarget.branch_reason ?? null
        }
        : isBranchFromSource
          ? buildLineageFields({
            sourceProfile: existing,
            nextProfileId,
            branchReason: isJobWorkflow ? "job-tailor" : "manual-tailor"
          })
          : buildLineageFields({ sourceProfile: null, nextProfileId, branchReason: null });

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
      const payload = {
        schema_version: parsed.schema_version || existing?.schema_version || "v1",
        profile_id: nextProfileId,
        revision: existingTarget?.revision ?? 0,
        template_id: existing?.template_id || cvTemplateId,
        company: effectiveCompany || null,
        application_status: applicationContext.application_status || existing?.application_status || null,
        application_date: applicationContext.application_date || existing?.application_date || null,
        job_title: effectiveJobTitle || null,
        job_description: effectiveJobDescription || null,
        job_url: effectiveJobUrl || null,
        theme_color: normalizeHexColor(applicationContext.theme_color || existing?.theme_color, null),
        show_profile_image: applicationContext.show_profile_image !== false,
        header_text_align: applicationContext.header_text_align || existing?.header_text_align || "right",
        header_title_size: applicationContext.header_title_size || existing?.header_title_size || "Huge",
        header_subtitle_size: applicationContext.header_subtitle_size || existing?.header_subtitle_size || "Large",
        ...lineageFields,
        data: mergeProfileImageIntoData(parsed.data, applicationContext.profile_image || existing?.data?.profile_image),
        section_order: existing?.section_order || parsed.section_order || [],
        sidebar_section_order: existing?.sidebar_section_order || parsed.sidebar_section_order || [],
        main_section_order: existing?.main_section_order || parsed.main_section_order || [],
        audit: {
          ...(existing?.audit || {}),
          raw_resume_text: resumeText,
          parsed_canonical: parsed.data,
          edited_canonical: parsed.data
        }
      };
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
        setJobCvEntryStep("review");
        setIsJobReviewReadOnly(false);
        setActiveJobAction("cv");
        setCvPreviewPayload(null);
        setPdfPreviewUrl(null);
        hasRenderedPdfPreviewRef.current = false;
        pdfPreviewTemplateRef.current = saved.template_id || "awesomecv";
        pdfPreviewStructureRef.current = "";
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

  const buildAutosavePayload = () => {
    if (!cvDraftState.payload) return null;
    const templateId = cvReview?.templateId || cvTemplateId || cvDraftState.payload.template_id || "awesomecv";
    const profileId = cvDraftState.payload.profile_id || cvDraftState.targetProfileId || cvReview?.canonical?.profile_id || "";
    if (!profileId) return null;
    const currentRevision = loadedProfileSnapshot.revision || cvDraftState.revision || cvDraftState.payload.revision || 0;
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
  };

  const autosaveProfile = async (reason = "interval") => {
    if (activeView !== "create" || isCvIdModalOpen || isSavingCvId) return false;
    if (!cvDraftState.isDirty && !buildApplicationContextDiff().hasChanges) return false;
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
  };

  useEffect(() => {
    autosaveHandlerRef.current = autosaveProfile;
  });

  const handleCreateStepLeave = ({ from, to }) => {
    if (!cvReview?.canonical?.profile_id) return;
    if (from === to) return;
    autosaveProfile("navigation");
  };

  useEffect(() => {
    if (!cvDraftState.payload) return;
    if (cvDraftState.isDirty || buildApplicationContextDiff().hasChanges) return;
    const snapshot = JSON.stringify(buildAutosavePayload());
    if (snapshot && snapshot !== lastAutosaveSnapshotRef.current) {
      lastAutosaveSnapshotRef.current = snapshot;
    }
  }, [cvDraftState.payload, cvDraftState.isDirty, applicationContext, resumeText]);

  useEffect(() => {
    if (!isNewbieCreateMode || !cvReview?.canonical?.profile_id) {
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
      autosaveHandlerRef.current?.("interval");
    }, 30000);
    return () => {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [isNewbieCreateMode, cvReview?.canonical?.profile_id]);

  const handleSelectJob = (job) => {
    pdfPreviewRequestVersionRef.current += 1;
    setSelectedJob(job);
    setCvReview(null);
    setIsJobReviewReadOnly(false);
    setActiveView("find");
    setActiveJobAction("none");
    setJobCvEntryStep("choice");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
  };

  const initializeJobCvContext = async (job) => {
    if (!job) return;
    setCvEntryError("");
    setActiveJobAction("cv");
    setJobCvEntryStep("choice");
    clearCreatePreviewState();

    const nextCompany = job?.company || "";

    setNewProfileId("");

    const mergedContext = {
      ...EMPTY_APPLICATION_CONTEXT,
      company: nextCompany,
      application_status: "",
      application_date: "",
      job_title: job?.title || "",
      job_description: job?.description || "",
      job_url: job?.job_url || ""
    };
    setApplicationContext(mergedContext);
    setSelectedProfileId("");
    setLoadedProfileSnapshot({
      profile_id: "",
      revision: 0,
      updated_at: null,
      raw_resume_text: "",
      ...EMPTY_APPLICATION_CONTEXT
    });
    setCvReview(null);
    setIsJobReviewReadOnly(false);
  };

  const handleChooseCreateJobCv = () => {
    const mergedContext = {
      ...EMPTY_APPLICATION_CONTEXT,
      company: selectedJob?.company || "",
      application_status: "",
      application_date: "",
      job_title: selectedJob?.title || "",
      job_description: selectedJob?.description || "",
      job_url: selectedJob?.job_url || ""
    };

    setJobCvEntryStep("create");
    setSelectedProfileId("");
    setNewProfileId("");
    setResumeText("");
    setIsDraftProfileActive(false);
    setDraftProfileId("");
    setApplicationContext(mergedContext);
    setLoadedProfileSnapshot({
      profile_id: "",
      revision: 0,
      updated_at: null,
      raw_resume_text: "",
      ...EMPTY_APPLICATION_CONTEXT
    });
    setCvReview(null);
    setIsJobReviewReadOnly(false);
  };

  const handleChooseBranchJobCv = () => {
    setJobCvEntryStep("branch");
    setIsDraftProfileActive(false);
    setDraftProfileId("");
    setCvReview(null);
    setIsJobReviewReadOnly(false);
  };

  const loadProfileIntoJobCvContext = async (profileId) => {
    if (!profileId || !selectedJob) return;
    const shouldFocusReviewSection = jobCvEntryStep !== "review";
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
      setJobCvEntryStep("review");
      setIsJobReviewReadOnly(true);
      if (shouldFocusReviewSection) {
        setActiveReviewNav("review");
        shouldFocusReviewAfterProfileLoadRef.current = true;
      }
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const openJobEditDecisionDialog = () => {
    const suggestedDraftId = buildNextAvailableDraftProfileId(
      buildJobDraftProfileId({
        baseId: selectedProfileId || newProfileId || "profile",
        company: selectedJob?.company || applicationContext.company || "company"
      })
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

      const payload = {
        ...sourceProfile,
        profile_id: nextDraftId,
        revision: 0,
        company: selectedJob.company || applicationContext.company || sourceProfile.company || null,
        application_status: applicationContext.application_status || "",
        application_date: applicationContext.application_date || null,
        job_title: selectedJob.title || applicationContext.job_title || sourceProfile.job_title || null,
        job_description: selectedJob.description || applicationContext.job_description || sourceProfile.job_description || null,
        job_url: selectedJob.job_url || applicationContext.job_url || sourceProfile.job_url || null,
        theme_color: normalizeHexColor(applicationContext.theme_color || sourceProfile.theme_color, null),
        show_profile_image: applicationContext.show_profile_image !== false,
        header_text_align: applicationContext.header_text_align || sourceProfile.header_text_align || "right",
        header_title_size: applicationContext.header_title_size || sourceProfile.header_title_size || "Huge",
        header_subtitle_size: applicationContext.header_subtitle_size || sourceProfile.header_subtitle_size || "Large",
        ...buildLineageFields({
          sourceProfile,
          nextProfileId: nextDraftId,
          branchReason: "job-edit-draft"
        }),
        audit: {
          ...(sourceProfile.audit || {}),
          raw_resume_text: resumeText || sourceProfile.audit?.raw_resume_text || ""
        }
      };

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
      hasRenderedPdfPreviewRef.current = false;
      pdfPreviewTemplateRef.current = saved.template_id || "awesomecv";
      pdfPreviewStructureRef.current = "";
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

  const handleBackToResults = () => {
    pdfPreviewRequestVersionRef.current += 1;
    setSelectedJob(null);
    setCvReview(null);
    setIsJobReviewReadOnly(false);
    setActiveView("find");
    setActiveJobAction("none");
    setJobCvEntryStep("choice");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
  };

  const handleSetView = (view) => {
    setActiveView(view);
    setSelectedJob(null);
    setJobCvEntryStep("choice");
    setIsSidebarOpen(false);
  };

  const handleSwitchJobAction = () => {
    if (activeJobAction === "cover") {
      initializeJobCvContext(selectedJob);
      return;
    }

    pdfPreviewRequestVersionRef.current += 1;
    setCvReview(null);
    setIsJobReviewReadOnly(false);
    setJobCvEntryStep("choice");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
    setActiveJobAction("cover");
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
      setActiveReviewNav("review");
    }
  }, [cvReview]);

  useEffect(() => {
    if (!cvReview) return;

    const updateActiveNavFromScroll = () => {
      const stickyOffset = 140;
      const reviewRect = reviewSectionRef.current?.getBoundingClientRect();
      const reviewTop = reviewRect?.top ?? Number.POSITIVE_INFINITY;
      const profileTop = profileBrowserSectionRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      const detailTop = jobDetailsSectionRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      if (reviewTop <= stickyOffset + 80) {
        setActiveReviewNav("review");
        return;
      }

      if (profileTop <= stickyOffset + 80) {
        setActiveReviewNav("profiles");
        return;
      }

      if (detailTop <= stickyOffset + 80) {
        setActiveReviewNav("details");
        return;
      }

      setActiveReviewNav("details");
    };

    updateActiveNavFromScroll();
    window.addEventListener("scroll", updateActiveNavFromScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateActiveNavFromScroll);
  }, [cvReview]);

  useEffect(() => {
    if (!cvReview || jobCvEntryStep !== "review") return;
    if (!shouldFocusReviewAfterProfileLoadRef.current) return;
    shouldFocusReviewAfterProfileLoadRef.current = false;

    requestAnimationFrame(() => {
      reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveReviewNav("review");
    });
  }, [cvReview, jobCvEntryStep]);

  const handleOpenJobDetailsPanel = () => {
    setActiveReviewNav("details");
    requestAnimationFrame(() => {
      jobDetailsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleOpenProfileBrowserPanel = () => {
    setActiveReviewNav("profiles");
    requestAnimationFrame(() => {
      profileBrowserSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleOpenCvReviewSection = () => {
    setActiveReviewNav("review");
    requestAnimationFrame(() => {
      reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

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
                  ) : isJobCvCreateStep ? (
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
                        onDraftGenerated={handleW1CreateDraftGenerated}
                        cvReview={cvReview}
                        selectedModel={selectedModel}
                        lmTimeout={lmTimeout}
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
                        initialStep="template"
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
