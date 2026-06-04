import ResultsList from "./ResultsList";

export default function FindJobsView({
  jobs,
  response,
  searchPhaseMessage,
  onSelectJob,
  isLoading,
  hasResponse,
  refinementProgress
}) {
  return (
    <>
      <header className="main-header">
        <p className="eyebrow">Local-only prototype</p>
        <h1>Job Agent</h1>
        <p className="subtitle">
          Find a job and generate an AI-tailored CV or cover letter.
        </p>
      </header>
      <section className="card">
        <ResultsList
          jobs={jobs}
          rerankRequested={response?.rerank_requested}
          rerankApplied={response?.rerank_applied}
          rerankTopN={response?.rerank_top_n}
          rerankSkipReason={response?.rerank_skip_reason}
          queryProfileId={response?.query_profile_id}
          bm25Query={response?.bm25_query}
          bm25Language={response?.bm25_language}
          bm25Tokenizer={response?.bm25_tokenizer}
          searchPhaseMessage={searchPhaseMessage}
          onSelectJob={onSelectJob}
          isLoading={isLoading}
          hasResponse={hasResponse}
          refinementProgress={refinementProgress}
        />
      </section>
    </>
  );
}
