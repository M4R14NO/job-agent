import { useEffect, useRef, useState } from "react";
import { searchJobs } from "./api/search";
import { fetchModels, getCvProfile, listCvProfiles, parseCvCanonical } from "./api/llm";
import { useJobDescription } from "./hooks/useJobDescription";
import SearchFilters from "./components/SearchFilters";
import ResultsList from "./components/ResultsList";
import { JobActionsCard, JobDetailsCard } from "./components/JobModal";
import CvReview from "./components/CvReview";
import CvEntry from "./components/CvEntry";
import { Box, Grid, GridItem } from "@chakra-ui/react";

const CACHE_KEY = "job-agent:search-response";
const LLM_PROFILE_KEY = "job-agent:llm-profiles";

export default function App() {
  const [resumeText, setResumeText] = useState("");
  const [wishes, setWishes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [location, setLocation] = useState("");
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
  const [cvTemplateId, setCvTemplateId] = useState("awesomecv");
  const [cvDocType, setCvDocType] = useState("resume");
  const [cvOutputLanguage, setCvOutputLanguage] = useState("english");
  const [cvEntryError, setCvEntryError] = useState("");
  const [isCreatingCv, setIsCreatingCv] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [activeView, setActiveView] = useState("find");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeJobAction, setActiveJobAction] = useState("none");
  const [llmProfiles, setLlmProfiles] = useState([]);
  const [selectedLlmProfileId, setSelectedLlmProfileId] = useState("");
  const [llmProfileName, setLlmProfileName] = useState("");
  const [llmProfileError, setLlmProfileError] = useState("");
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);

  const searchTimerRef = useRef(null);

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
        resumeText, wishes, searchTerm, location,
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
    setCvReview({ canonical, job, templateId, docType, outputLanguage });
    setSelectedJob(job);
    setActiveJobAction("cv");
  };

  const handleStartCvEditor = ({ canonical }) => {
    setCvReview({
      canonical,
      job: { title: "", company: "", description: "", job_url: "" },
      templateId: cvTemplateId,
      docType: cvDocType,
      outputLanguage: cvOutputLanguage
    });
    setSelectedJob(null);
    setActiveView("create");
  };

  const handleCreateCvFromResume = async () => {
    if (!selectedModel) {
      setCvEntryError("Select a model to create a CV profile.");
      return;
    }
    if (!resumeText.trim()) {
      setCvEntryError("Resume text is required to create a new profile.");
      return;
    }
    setCvEntryError("");
    setIsCreatingCv(true);
    try {
      const canonical = await parseCvCanonical({
        resume_text: resumeText,
        model: selectedModel,
        lm_timeout: lmTimeout,
        output_language: cvOutputLanguage
      });
      handleStartCvEditor({ canonical });
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to parse resume");
    } finally {
      setIsCreatingCv(false);
    }
  };

  const handleLoadProfile = async () => {
    if (!selectedProfileId) {
      setCvEntryError("Select a profile to load.");
      return;
    }
    setCvEntryError("");
    setIsLoadingProfile(true);
    try {
      const canonical = await getCvProfile(selectedProfileId);
      handleStartCvEditor({ canonical });
    } catch (err) {
      setCvEntryError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleSelectJob = (job) => {
    setSelectedJob(job);
    setCvReview(null);
    setActiveView("find");
    setActiveJobAction("none");
  };

  const handleBackToResults = () => {
    setSelectedJob(null);
    setCvReview(null);
    setActiveView("find");
    setActiveJobAction("none");
  };

  const handleSetView = (view) => {
    setActiveView(view);
    setSelectedJob(null);
    setIsSidebarOpen(false);
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
            />
          </div>
          {showActionsPanel || cvReview ? (
            <div className="panel-column">
              {showActionsPanel && (
                <JobActionsCard
                  mode={activeJobAction}
                  job={selectedJob}
                  resumeText={resumeText}
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
        templateColumns={isFindView ? "72px minmax(360px, 420px) 1fr" : "72px 1fr"}
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
          <GridItem className="app-sidebar">
            <SearchFilters
              searchTerm={searchTerm} onSearchTermChange={setSearchTerm}
              location={location} onLocationChange={setLocation}
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
                  Load a profile or generate one from resume text.
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
                    onRefreshProfiles={loadProfiles}
                    onLoadProfile={handleLoadProfile}
                    onCreateCvFromResume={handleCreateCvFromResume}
                    isCreatingCv={isCreatingCv}
                    isLoadingProfile={isLoadingProfile}
                    cvEntryError={cvEntryError}
                    cvTemplateId={cvTemplateId}
                    onCvTemplateIdChange={setCvTemplateId}
                    cvDocType={cvDocType}
                    onCvDocTypeChange={setCvDocType}
                    cvOutputLanguage={cvOutputLanguage}
                    onCvOutputLanguageChange={setCvOutputLanguage}
                    resumeText={resumeText}
                    onResumeTextChange={setResumeText}
                  />
                </section>
                {cvReview ? (
                  <CvReview
                    canonical={cvReview.canonical}
                    job={cvReview.job}
                    templateId={cvReview.templateId}
                    docType={cvReview.docType}
                    outputLanguage={cvReview.outputLanguage}
                    model={selectedModel}
                    lmTimeout={lmTimeout}
                  />
                ) : (
                  <div className="panel-card panel-empty">
                    <p className="helper">Load a profile or create one to start editing.</p>
                  </div>
                )}
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
    </Box>
  );
}
