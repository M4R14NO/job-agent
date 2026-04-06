import { useEffect, useState } from "react";
import { searchJobs } from "./api/search";
import { fetchModels } from "./api/llm";
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
    setSelectedJob(null);
  };

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
        />
        {response && (
          <ResultsList
            jobs={jobs}
            rerankApplied={response?.rerank_applied}
            rerankTopN={response?.rerank_top_n}
            onSelectJob={setSelectedJob}
          />
        )}
      </section>

      {selectedJob && (
        <JobModal
          job={selectedJob}
          descriptionHtml={descriptionHtml}
          resumeText={resumeText}
          selectedModel={selectedModel}
          lmTimeout={lmTimeout}
          onStartCvReview={handleStartCvReview}
          onClose={() => setSelectedJob(null)}
        />
      )}

      {cvReview && (
        <CvReview
          canonical={cvReview.canonical}
          job={cvReview.job}
          templateId={cvReview.templateId}
          docType={cvReview.docType}
          outputLanguage={cvReview.outputLanguage}
          model={selectedModel}
          lmTimeout={lmTimeout}
          onClose={() => setCvReview(null)}
        />
      )}
    </div>
  );
}
