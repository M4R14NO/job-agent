export function buildSearchRequest({
  resumeText,
  wishes,
  searchTerm,
  location,
  resultsWanted,
  hoursOld,
  isRemote,
  sites,
  fetchFullDescriptions,
  model,
  enableRerank,
  rerankTopN,
  weightEmbedding,
  weightKeyword
}) {
  return {
    resume_text: resumeText.trim(),
    wishes: wishes.trim() || null,
    search_term: searchTerm.trim() || null,
    location: location.trim() || null,
    results_wanted: resultsWanted,
    hours_old: hoursOld,
    is_remote: isRemote,
    site_name: sites,
    linkedin_fetch_description: fetchFullDescriptions,
    description_format: "markdown",
    model: model || null,
    enable_rerank: Boolean(enableRerank),
    rerank_top_n: rerankTopN,
    precision_weight_embedding: weightEmbedding,
    precision_weight_keyword: weightKeyword
  };
}

export function normalizeJob(job) {
  return {
    ...job,
    title: job.title ?? "Untitled",
    company: job.company ?? job.company_name ?? "Unknown",
    description: job.description ?? job.job_description ?? job.snippet ?? "",
    location: job.location ?? "",
    site: job.site ?? "",
    date_posted: job.date_posted ?? "",
    match_score: job.match_score ?? null,
    match_reasons: Array.isArray(job.match_reasons) ? job.match_reasons : []
  };
}

export function normalizeSearchResponse(response) {
  return {
    ...response,
    jobs: Array.isArray(response.jobs)
      ? response.jobs.map(normalizeJob)
      : []
  };
}