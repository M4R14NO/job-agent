import { useEffect, useState } from "react";
import { searchJobs } from "./api/search";
import { fetchModels, getCvProfile, listCvProfiles, parseCvCanonical } from "./api/llm";
import { useJobDescription } from "./hooks/useJobDescription";
import SearchFilters from "./components/SearchFilters";
import ResultsList from "./components/ResultsList";
import JobModal from "./components/JobModal";
import CvReview from "./components/CvReview";

const CACHE_KEY = "job-agent:search-response";

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
  const [enableRerank, setEnableRerank] = useState(true);
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

  const jobs = response?.jobs ?? [];
  const descriptionHtml = useJobDescription(selectedJob);

  const defaultRerankTopN = (() => {
    const total = response?.jobs?.length ?? resultsWanted;
    if (!total) return null;
    const cap = Math.min(total, resultsWanted);
    return Math.max(3, Math.ceil(0.4 * cap));
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
  };

  const handleBackToResults = () => {
    setSelectedJob(null);
    setCvReview(null);
  };

  const showPanel = Boolean(selectedJob || cvReview);
  const panelTitle = selectedJob?.title || (cvReview ? "CV editor" : "Job review");
  const panelEyebrow = selectedJob ? "Review panel" : "CV editor";

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
        </header>
        <div className="panel-body">
          <div className="panel-column">
            {selectedJob ? (
              <JobModal
                job={selectedJob}
                descriptionHtml={descriptionHtml}
                resumeText={resumeText}
                selectedModel={selectedModel}
                lmTimeout={lmTimeout}
                onStartCvReview={handleStartCvReview}
              />
            ) : (
              <div className="panel-card panel-empty">
                <p className="helper">No job selected. Mapping will be generic.</p>
              </div>
            )}
          </div>
          <div className="panel-column">
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
                <p className="helper">Run CV review to edit the mapped data and render a PDF.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Local-only prototype</p>
          <h1>Job Agent</h1>
          <p className="subtitle">
            Paste your resume text to start a search and ranking flow.
          </p>
        </div>
      </header>

      <section className="card">
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
          onLmTimeoutChange={setLmTimeout}
          modelError={modelError}
          enableRerank={enableRerank}
          onEnableRerankChange={setEnableRerank}
          rerankTopN={rerankTopN}
          onRerankTopNChange={setRerankTopN}
          defaultRerankTopN={defaultRerankTopN}
          cachedAvailable={Boolean(cachedResponse)}
          cachedAt={cachedAt}
          onLoadCache={handleLoadCache}
          onClearCache={handleClearCache}
          isLoading={isLoading}
          error={error}
          onSearch={handleSearch}
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
        />
        {response && (
          <ResultsList
            jobs={jobs}
            rerankApplied={response?.rerank_applied}
            rerankTopN={response?.rerank_top_n}
            onSelectJob={handleSelectJob}
          />
        )}
      </section>

    </div>
  );
}
