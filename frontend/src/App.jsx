import { useEffect, useRef, useState } from "react";
import { searchJobs } from "./api/search";
import { fetchModels, getCvProfile, listCvProfiles, parseCvCanonical, renderCvFromTemplate, saveCvProfile } from "./api/llm";
import { useJobDescription } from "./hooks/useJobDescription";
import SearchFilters from "./components/SearchFilters";
import ResultsList from "./components/ResultsList";
import { JobActionsCard, JobDetailsCard, PdfPreviewCard } from "./components/JobModal";
import CvReview from "./components/CvReview";
import CvEntry from "./components/CvEntry";
import OverwriteConfirmationModal from "./components/OverwriteConfirmationModal";
import { Box, Grid, GridItem } from "@chakra-ui/react";

const CACHE_KEY = "job-agent:search-response";
const LLM_PROFILE_KEY = "job-agent:llm-profiles";
const SIDEBAR_WIDTH_KEY = "job-agent:sidebar-width";
const SIDEBAR_MIN_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 720;
const PDF_PREVIEW_DEBOUNCE_MS = 5000;

const EMPTY_APPLICATION_CONTEXT = {
  company: "",
  application_status: "",
  application_date: "",
  job_title: "",
  job_description: "",
  job_url: ""
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
  const [llmProfiles, setLlmProfiles] = useState([]);
  const [selectedLlmProfileId, setSelectedLlmProfileId] = useState("");
  const [llmProfileName, setLlmProfileName] = useState("");
  const [llmProfileError, setLlmProfileError] = useState("");
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [cvPreviewPayload, setCvPreviewPayload] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);

  const searchTimerRef = useRef(null);
  const cvRemapTimerRef = useRef(null);
  const pdfPreviewTimerRef = useRef(null);
  const pdfPreviewTemplateRef = useRef("");
  const hasRenderedPdfPreviewRef = useRef(false);
  const pdfPreviewStructureRef = useRef("");
  const pdfPreviewRequestVersionRef = useRef(0);
  const cvDraftHashRef = useRef("");
  const isResizingSidebarRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(SIDEBAR_MIN_WIDTH);
  const sidebarWidthRef = useRef(SIDEBAR_MIN_WIDTH);

  const jobs = response?.jobs ?? [];
  const descriptionHtml = useJobDescription(selectedJob);
  const isFindView = activeView === "find";

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

  useEffect(() => {
    const stored = localStorage.getItem(LLM_PROFILE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
      setLlmProfiles(profiles);
      if (typeof parsed?.lastSelectedId === "string") {
        setSelectedLlmProfileId(parsed.lastSelectedId);
      }
      if (typeof parsed?.lastSelectedName === "string") {
        setLlmProfileName(parsed.lastSelectedName);
      }
    } catch (err) {
      localStorage.removeItem(LLM_PROFILE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      LLM_PROFILE_KEY,
      JSON.stringify({
        profiles: llmProfiles,
        lastSelectedId: selectedLlmProfileId,
        lastSelectedName: llmProfileName
      })
    );
  }, [llmProfiles, selectedLlmProfileId, llmProfileName]);

  const loadProfiles = async () => {
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const data = await listCvProfiles();
      const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
      setCvProfiles(profiles);
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
    job_url: profile?.job_url || ""
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
      job_url: loadedProfileSnapshot.job_url || ""
    };

    const config = [
      ["raw_resume_text", "CV text"],
      ["company", "Company"],
      ["application_status", "Application status"],
      ["application_date", "Application date"],
      ["job_title", "Job title"],
      ["job_description", "Job description"],
      ["job_url", "Job URL"]
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
    if (!cvPreviewPayload || !cvReview) return undefined;
    const activeTemplateId = cvReview.templateId || "awesomecv";
    const templateChanged = Boolean(pdfPreviewTemplateRef.current) && pdfPreviewTemplateRef.current !== activeTemplateId;

    const structureSignature = JSON.stringify({
      sections: cvPreviewPayload.sections || {},
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
  }, [cvPreviewPayload, cvReview?.templateId]);

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
    setIsLoading(true);
    setError("");
    setResponse(null);
    try {
      const data = await searchJobs({
        resumeText, wishes, searchTerm, location, searchRadiusKm,
        resultsWanted, hoursOld, isRemote, sites, fetchFullDescriptions,
        model: selectedModel,
        enableRerank,
        rerankTopN,
        weightEmbedding,
        weightKeyword
      });
      setResponse(data);
      const savedAt = new Date().toISOString();
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          savedAt,
          response: data,
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
      setCachedResponse(data);
      setCachedAt(savedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveLlmProfile = () => {
    const name = llmProfileName.trim();
    if (!name) {
      setLlmProfileError("Profile name is required.");
      return;
    }
    const safeId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const profileId = safeId || `profile-${Date.now()}`;
    const nextProfile = {
      id: profileId,
      name,
      updatedAt: new Date().toISOString(),
      data: {
        resumeText,
        wishes,
        selectedModel,
        lmTimeout,
        enableRerank,
        rerankTopN
      }
    };
    setLlmProfiles((prev) => {
      const existingIndex = prev.findIndex((profile) => profile.id === profileId);
      if (existingIndex === -1) {
        return [...prev, nextProfile];
      }
      const updated = [...prev];
      updated[existingIndex] = nextProfile;
      return updated;
    });
    setSelectedLlmProfileId(profileId);
    setLlmProfileError("");
  };

  const handleLoadLlmProfile = (profileId) => {
    const targetId = profileId || selectedLlmProfileId;
    if (!targetId) {
      setLlmProfileError("Select a profile to load.");
      return;
    }
    const profile = llmProfiles.find((item) => item.id === targetId);
    if (!profile) {
      setLlmProfileError("Selected profile was not found.");
      return;
    }
    const data = profile.data || {};
    if (typeof data.resumeText === "string") setResumeText(data.resumeText);
    if (typeof data.wishes === "string") setWishes(data.wishes);
    if (typeof data.selectedModel === "string") setSelectedModel(data.selectedModel);
    if (typeof data.lmTimeout === "number") setLmTimeout(data.lmTimeout);
    if (typeof data.enableRerank === "boolean") setEnableRerank(data.enableRerank);
    if (typeof data.rerankTopN === "number" || data.rerankTopN === null) {
      setRerankTopN(data.rerankTopN ?? null);
    }
    setLlmProfileName(profile.name || "");
    setSelectedLlmProfileId(profile.id);
    setLlmProfileError("");
  };

  const handleDeleteLlmProfile = () => {
    if (!selectedLlmProfileId) {
      setLlmProfileError("Select a profile to delete.");
      return;
    }
    setLlmProfiles((prev) => prev.filter((profile) => profile.id !== selectedLlmProfileId));
    setSelectedLlmProfileId("");
    setLlmProfileName("");
    setLlmProfileError("");
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
      job_url: job?.job_url || ""
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
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    setIsPdfGenerating(true);
    try {
      const { blob } = await renderCvFromTemplate({
        payload: templatePayload,
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
    setIsPdfDownloading(true);
    try {
      const { blob, filename } = await renderCvFromTemplate({
        payload: templatePayload,
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

  const buildDraftProfileId = () => `draft-${Date.now()}`;

  const handleCreateNewEntry = () => {
    const nextDraftId = buildDraftProfileId();
    setNewProfileId("");
    setDraftProfileId(nextDraftId);
    setIsDraftProfileActive(true);
    setSelectedProfileId(nextDraftId);
    setResumeText("");
    setApplicationContext({ ...EMPTY_APPLICATION_CONTEXT });
    setLoadedProfileSnapshot({
      profile_id: nextDraftId,
      revision: 0,
      updated_at: null,
      raw_resume_text: "",
      ...EMPTY_APPLICATION_CONTEXT
    });
    setCvEntryError("");
    clearCreatePreviewState();
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
      const contextKeys = new Set(["raw_resume_text", "company", "application_status", "application_date", "job_title", "job_description", "job_url"]);
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
        data: existing.data,
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
        audit: {
          ...(existing.audit || {}),
          ...(basePayload.audit || {}),
          raw_resume_text: resumeText
        }
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
        audit: {
          ...(existing.audit || {}),
          raw_resume_text: resumeText
        }
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
        data: parsed.data,
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
                  className="cta cta-cover"
                  onClick={() => setActiveJobAction("cover")}
                >
                  Generate cover letter
                </button>
                <button
                  className="cta cta-cv"
                  onClick={() => setActiveJobAction("cv")}
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
                llmProfiles={llmProfiles}
                selectedLlmProfileId={selectedLlmProfileId}
                onSelectedLlmProfileIdChange={setSelectedLlmProfileId}
                llmProfileName={llmProfileName}
                onLlmProfileNameChange={setLlmProfileName}
                onSaveLlmProfile={handleSaveLlmProfile}
                onLoadLlmProfile={handleLoadLlmProfile}
                onDeleteLlmProfile={handleDeleteLlmProfile}
                llmProfileError={llmProfileError}
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
                  rerankApplied={response?.rerank_applied}
                  rerankTopN={response?.rerank_top_n}
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
                  Work from one profile table and start new entries without switching tabs.
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
                    isLoadingProfile={isLoadingProfile}
                    isUpdatingProfileCvText={isUpdatingProfileCvText}
                    isRemappingProfileCvText={isRemappingProfileCvText}
                    remapProgress={cvRemapProgress}
                    cvEntryError={cvEntryError}
                    cvTemplateId={cvTemplateId}
                    onCvTemplateIdChange={handleTemplateIdChange}
                    cvOutputLanguage={cvOutputLanguage}
                    onCvOutputLanguageChange={setCvOutputLanguage}
                    applicationContext={applicationContext}
                    onApplicationContextChange={setApplicationContext}
                    resumeText={resumeText}
                    onResumeTextChange={setResumeText}
                    newProfileId={newProfileId}
                    onNewProfileIdChange={setNewProfileId}
                    onCreateNewEntry={handleCreateNewEntry}
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
