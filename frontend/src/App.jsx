import { useEffect, useState } from "react";
import { searchJobs } from "./api/search";
import { fetchModels } from "./api/llm";
import { useJobDescription } from "./hooks/useJobDescription";
import SearchFilters from "./components/SearchFilters";
import ResultsList from "./components/ResultsList";
import JobModal from "./components/JobModal";

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
  const [models, setModels] = useState([]);
  const [modelError, setModelError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [enableRerank, setEnableRerank] = useState(true);
  const [rerankTopN, setRerankTopN] = useState(12);
  const [weightEmbedding, setWeightEmbedding] = useState(0.8);
  const [weightKeyword, setWeightKeyword] = useState(0.2);

  const jobs = response?.jobs ?? [];
  const descriptionHtml = useJobDescription(selectedJob);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
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
          modelError={modelError}
          isLoading={isLoading}
          error={error}
          onSearch={handleSearch}
        />
        {response && (
          <ResultsList jobs={jobs} onSelectJob={setSelectedJob} />
        )}
      </section>

      {selectedJob && (
        <JobModal
          job={selectedJob}
          descriptionHtml={descriptionHtml}
          resumeText={resumeText}
          selectedModel={selectedModel}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}
