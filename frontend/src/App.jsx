import { useEffect, useRef, useState } from "react";
import { searchJobs } from "./api/search";
import {
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
import ResultsList from "./components/ResultsList";
import { JobActionsCard, JobDetailsCard, PdfPreviewCard } from "./components/JobModal";
import CvReview from "./components/CvReview";
import CvEntry from "./components/CvEntry";
import OverwriteConfirmationModal from "./components/OverwriteConfirmationModal";
import { Box, Grid, GridItem } from "@chakra-ui/react";

const CACHE_KEY = "job-agent:search-response";
const SIDEBAR_WIDTH_KEY = "job-agent:sidebar-width";
const SIDEBAR_MIN_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 720;
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
  const [sites, setSites] = useState(["indeed", "linkedin", "google"]);
  const [fetchFullDescriptions, setFetchFullDescriptions] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [cvReview, setCvReview] = useState(null);
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
  const [activeView, setActiveView] = useState("find");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeJobAction, setActiveJobAction] = useState("none");
  const [selectedRerankProfileId, setSelectedRerankProfileId] = useState("");
  const [rerankProfileError, setRerankProfileError] = useState("");
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);
  const [searchPhaseMessage, setSearchPhaseMessage] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [cvPreviewPayload, setCvPreviewPayload] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [cvThemeColors, setCvThemeColors] = useState(DEFAULT_TEMPLATE_THEME_COLORS);

  const searchTimerRef = useRef(null);
  const cvRemapTimerRef = useRef(null);
  const pdfPreviewTimerRef = useRef(null);
  const pdfPreviewTemplateRef = useRef("");
  const hasRenderedPdfPreviewRef = useRef(false);
  const pdfPreviewStructureRef = useRef("");
  const pdfPreviewRequestVersionRef = useRef(0);
  const cvDraftHashRef = useRef("");
  const searchRequestIdRef = useRef(0);
  const searchAbortControllerRef = useRef(null);
  const isResizingSidebarRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(SIDEBAR_MIN_WIDTH);
  const sidebarWidthRef = useRef(SIDEBAR_MIN_WIDTH);

  const jobs = response?.jobs ?? [];
  const descriptionHtml = useJobDescription(selectedJob);
  const isFindView = activeView === "find";

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
  const refinementIsActive = isLoading && enableRerank;
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

  const loadProfiles = async () => {
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
      } else if (!selectedProfileId) {
        setSelectedProfileId(profiles[0].profile_id || "");
      }
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setProfilesLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

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

  useEffect(() => {
    if (!cvPreviewPayload || !cvReview) return undefined;
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
  }, [cvPreviewPayload, cvReview?.templateId, cvThemeColors, applicationContext?.show_profile_image, applicationContext?.theme_color, applicationContext?.header_text_align, applicationContext?.header_title_size, applicationContext?.header_subtitle_size]);

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
    const handleMouseMove = (event) => {
      if (!isResizingSidebarRef.current) return;
      const delta = event.clientX - resizeStartXRef.current;
      const nextWidth = Math.min(
        Math.max(resizeStartWidthRef.current + delta, SIDEBAR_MIN_WIDTH),
        SIDEBAR_MAX_WIDTH
      );
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (!isResizingSidebarRef.current) return;
      isResizingSidebarRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current));
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
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
        if (Array.isArray(parsed.sites)) setSites(parsed.sites);
        if (typeof parsed.fetchFullDescriptions === "boolean") setFetchFullDescriptions(parsed.fetchFullDescriptions);
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
      searchTerm,
      location,
      searchRadiusKm,
      resultsWanted,
      hoursOld,
      isRemote,
      sites,
      model: selectedModel,
      lmTimeout,
      rerankTopN,
      weightEmbedding,
      weightKeyword
    };

    setIsLoading(true);
    setError("");
    setResponse(null);
    setSearchPhaseMessage(fetchFullDescriptions
      ? `Batch search started (size ${SEARCH_BATCH_SIZE}): quick pass first...`
      : "Searching job boards...");

    try {
      let finalData = null;

      if (fetchFullDescriptions) {
        const totalWanted = Math.max(1, Number(resultsWanted) || 1);
        const batchTargets = [];
        for (let next = SEARCH_BATCH_SIZE; next < totalWanted; next += SEARCH_BATCH_SIZE) {
          batchTargets.push(next);
        }
        batchTargets.push(totalWanted);

        for (let batchIndex = 0; batchIndex < batchTargets.length; batchIndex += 1) {
          const targetCount = batchTargets[batchIndex];
          const batchLabel = `${batchIndex + 1}/${batchTargets.length}`;

          setSearchPhaseMessage(
            `Batch ${batchLabel}: loading top ${targetCount} without descriptions...`
          );
          const quickData = await searchJobs({
            ...baseInput,
            resultsWanted: targetCount,
            fetchFullDescriptions: false,
            enableRerank: false
          }, { signal: abortController.signal });
          if (requestId !== searchRequestIdRef.current) return;

          setResponse((prev) => mergeResponseStable(prev, quickData, { preserveRichDetails: true }));

          const isFinalBatch = batchIndex === batchTargets.length - 1;
          setSearchPhaseMessage(
            `Batch ${batchLabel}: enriching top ${targetCount} with full descriptions${isFinalBatch && enableRerank ? " and rerank" : ""}...`
          );
          const detailedData = await searchJobs({
            ...baseInput,
            resultsWanted: targetCount,
            fetchFullDescriptions: true,
            enableRerank: isFinalBatch ? enableRerank : false
          }, { signal: abortController.signal });
          if (requestId !== searchRequestIdRef.current) return;

          finalData = mergeResponseStable(finalData || quickData, detailedData);
          setResponse((prev) => mergeResponseStable(prev, detailedData));
        }
      } else {
        const data = await searchJobs({
          ...baseInput,
          fetchFullDescriptions,
          enableRerank
        }, { signal: abortController.signal });
        if (requestId !== searchRequestIdRef.current) return;

        finalData = mergeResponseStable(null, data);
        setResponse((prev) => mergeResponseStable(prev, data));
      }

      if (!finalData) return;

      const savedAt = new Date().toISOString();
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          savedAt,
          response: finalData,
          resumeText,
          wishes,
          searchTerm,
          location,
          searchRadiusKm,
          resultsWanted,
          hoursOld,
          isRemote,
          sites,
          fetchFullDescriptions,
          selectedModel,
          lmTimeout,
          enableRerank,
          rerankTopN,
          weightEmbedding,
          weightKeyword
        })
      );
      setCachedResponse(finalData);
      setCachedAt(savedAt);
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
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = templateId || cvTemplateId || "awesomecv";
    pdfPreviewStructureRef.current = "";
  };

  const clearCreatePreviewState = () => {
    pdfPreviewRequestVersionRef.current += 1;
    setCvReview(null);
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
  };

  const sanitizeProfileId = (value) => {
    const normalized = (value || "").trim().toLowerCase();
    const safe = normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return safe || `profile-${Date.now()}`;
  };

  const mergeProfileImageIntoData = (data, profileImage) => {
    const base = data && typeof data === "object" ? data : {};
    return {
      ...base,
      profile_image: (profileImage || "").trim() || null
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
    if (!selectedProfileId) {
      setCvEntryError("Select a profile before updating application data.");
      return;
    }
    setCvEntryError("");
    setIsUpdatingProfileCvText(true);
    try {
      const existing = await getCvProfile(selectedProfileId);
      const payload = {
        ...existing,
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
        audit: {
          ...(existing.audit || {}),
          raw_resume_text: resumeText
        },
        data: mergeProfileImageIntoData(existing.data, applicationContext.profile_image)
      };
      const saved = await saveCvProfile(selectedProfileId, payload);
      upsertCvProfileInList(saved);
      setResumeText(saved.audit?.raw_resume_text || "");
      setApplicationContext(contextFromProfile(saved));
      setLoadedProfileSnapshot(contextSnapshotFromProfile(saved));
      setCvEntryError(`Application profile '${selectedProfileId}' updated (revision ${saved.revision}).`);
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
      const fallbackProfileId = hasPersistedSelectedProfile
        ? buildNextVersionedProfileId(selectedProfileId)
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
      handleStartCvEditor({
        canonical: saved,
        templateId: saved.template_id || "awesomecv",
        initialProfileId: saved.profile_id
      });
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

  const handleSelectJob = (job) => {
    pdfPreviewRequestVersionRef.current += 1;
    setSelectedJob(job);
    setCvReview(null);
    setActiveView("find");
    setActiveJobAction("none");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
  };

  const handleBackToResults = () => {
    pdfPreviewRequestVersionRef.current += 1;
    setSelectedJob(null);
    setCvReview(null);
    setActiveView("find");
    setActiveJobAction("none");
    setCvPreviewPayload(null);
    setPdfPreviewUrl(null);
    hasRenderedPdfPreviewRef.current = false;
    pdfPreviewTemplateRef.current = "";
    pdfPreviewStructureRef.current = "";
  };

  const handleSetView = (view) => {
    setActiveView(view);
    setSelectedJob(null);
    setIsSidebarOpen(false);
  };

  const handleSidebarResizeStart = (event) => {
    if (!isFindView) return;
    isResizingSidebarRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (!isFindView) setIsSidebarOpen(false);
  }, [isFindView]);

  const showPanel = Boolean(selectedJob);
  const panelTitle = selectedJob?.title || (cvReview ? "CV editor" : "Job detail");
  const panelEyebrow = selectedJob ? "Job detail" : "CV editor";
  const showActionsPanel = activeJobAction !== "none" && !cvReview;
  const showActionSwitcher = activeJobAction !== "none" && !cvReview;
  const actionLabel = activeJobAction === "cover" ? "Cover letter" : "CV generation";
  const switchActionLabel = activeJobAction === "cover" ? "Switch to CV generation" : "Switch to Cover letter";

  if (showPanel) {
    return (
      <div className="panel-page">
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
                  onClick={() => setActiveJobAction("cv")}
                  title="Use AI to turn your resume text and job context into an editable CV draft."
                >
                  Generate CV
                </button>
              </>
            ) : (
              <>
                <span className="action-pill">{actionLabel}</span>
                {showActionSwitcher && (
                  <button
                    className="cta cta-switch"
                    onClick={() => setActiveJobAction(activeJobAction === "cover" ? "cv" : "cover")}
                  >
                    {switchActionLabel}
                  </button>
                )}
              </>
            )}
          </div>
        </header>
        <div className={`panel-body ${showActionsPanel || cvReview ? "" : "is-single"}`}>
          <div className="panel-column">
            <JobDetailsCard
              job={selectedJob}
              descriptionHtml={descriptionHtml}
              collapsible={Boolean(cvReview)}
              defaultCollapsed={Boolean(cvReview)}
            />
            {cvReview && (
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
              />
            )}
          </div>
          {showActionsPanel || cvReview ? (
            <div className="panel-column">
              {showActionsPanel && (
                <JobActionsCard
                  mode={activeJobAction}
                  job={selectedJob}
                  resumeText={resumeText}
                  onResumeTextChange={setResumeText}
                  selectedModel={selectedModel}
                  lmTimeout={lmTimeout}
                  onStartCvReview={handleStartCvReview}
                />
              )}
              {cvReview ? (
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
                />
              ) : null}
            </div>
          ) : null}
        </div>
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
            className={`rail-button ${!isFindView ? "is-active" : ""}`}
            onClick={() => handleSetView("create")}
          >
            <span className="rail-icon">📝</span>
            <span>Create CV</span>
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
                sites={sites} onSitesChange={setSites}
                fetchFullDescriptions={fetchFullDescriptions} onFetchFullDescriptionsChange={setFetchFullDescriptions}
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
            <>
              <header className="main-header">
                <p className="eyebrow">Local-only prototype</p>
                <h1>Job Agent</h1>
                <p className="subtitle">
                  Paste your resume text to start a search and ranking flow.
                </p>
              </header>
              <section className="card">
                <ResultsList
                  jobs={jobs}
                  rerankRequested={response?.rerank_requested}
                  rerankApplied={response?.rerank_applied}
                  rerankTopN={response?.rerank_top_n}
                  rerankSkipReason={response?.rerank_skip_reason}
                  searchPhaseMessage={searchPhaseMessage}
                  onSelectJob={handleSelectJob}
                  isLoading={isLoading}
                  hasResponse={Boolean(response)}
                  refinementProgress={refinementProgress}
                />
              </section>
            </>
          ) : (
            <>
              <header className="main-header">
                <p className="eyebrow">CV workspace</p>
                <h1>Create CV</h1>
                <p className="subtitle">
                  Create a new CV or load and work on an existing one.
                </p>
              </header>
              <div className="create-layout">
                <section className="card">
                  <CvEntry
                    cvProfiles={cvProfiles}
                    profilesLoading={profilesLoading}
                    profilesError={profilesError}
                    selectedProfileId={selectedProfileId}
                    onSelectedProfileIdChange={setSelectedProfileId}
                    onProfileRowSelect={handleProfileRowSelect}
                    onRefreshProfiles={loadProfiles}
                    onUpdateProfileCvText={handleUpdateApplicationProfileData}
                    onRemapProfileCvText={handleRemapProfileCvText}
                    onCreateNewEntry={handleCreateNewEntry}
                    onBeginNewEntry={handleBeginNewEntry}
                    isCreatingProfileEntry={isCreatingProfileEntry}
                    isLoadingProfile={isLoadingProfile}
                    isUpdatingProfileCvText={isUpdatingProfileCvText}
                    isRemappingProfileCvText={isRemappingProfileCvText}
                    isUploadingProfileImage={isUploadingProfileImage}
                    remapProgress={cvRemapProgress}
                    cvEntryError={cvEntryError}
                    cvTemplateId={cvTemplateId}
                    onCvTemplateIdChange={handleTemplateIdChange}
                    cvOutputLanguage={cvOutputLanguage}
                    onCvOutputLanguageChange={setCvOutputLanguage}
                    applicationContext={applicationContext}
                    onApplicationContextChange={handleApplicationContextChange}
                    onUploadProfileImage={handleUploadProfileImage}
                    resumeText={resumeText}
                    onResumeTextChange={setResumeText}
                    newProfileId={newProfileId}
                    draftProfileId={draftProfileId}
                    isDraftProfileActive={isDraftProfileActive}
                  />
                </section>
                <div className="create-review-layout">
                  <div className="create-review-pane create-review-pane-preview">
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
                      disabled={!cvReview}
                      disabledReason="Tailor the CV first to enable preview."
                    />
                  </div>
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
                        onDraftStateChange={handleCvDraftStateChange}
                        onPreviewPayloadChange={setCvPreviewPayload}
                      />
                    ) : (
                      <div className="panel-card panel-empty panel-disabled">
                        <p className="helper">Tailor the CV first to unlock CV preview and editing.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </GridItem>
      </Grid>
      {isFindView && (
        <div
          className={`sidebar-backdrop ${isSidebarOpen ? "is-open" : ""}`}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

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
