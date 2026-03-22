import { useState } from "react";
import { searchJobs } from "./api/search";
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

  const jobs = response?.jobs ?? [];
  const descriptionHtml = useJobDescription(selectedJob);

  const handleSearch = async () => {
    setIsLoading(true);
    setError("");
    setResponse(null);
    try {
      const data = await searchJobs({
        resumeText, wishes, searchTerm, location,
        resultsWanted, hoursOld, isRemote, sites, fetchFullDescriptions
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
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}
