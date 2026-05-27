export function buildSearchRequest({
  resumeText,
  wishes,
  selectedRerankProfileId,
  searchTerm,
  location,
  searchRadiusKm,
  resultsWanted,
  hoursOld,
  isRemote,
  sites,
  model,
  lmTimeout,
  enableRerank,
  rerankTopN,
  weightEmbedding,
  weightKeyword
}) {
  return {
    resume_text: resumeText.trim(),
    wishes: wishes.trim() || null,
    selected_rerank_profile_id: selectedRerankProfileId || null,
    search_term: searchTerm.trim() || null,
    location: location.trim() || null,
    search_radius_km: searchRadiusKm,
    results_wanted: resultsWanted,
    hours_old: hoursOld,
    is_remote: isRemote,
    site_name: sites,
    linkedin_fetch_description: false,
    description_format: "markdown",
    model: model || null,
    lm_timeout: lmTimeout,
    enable_rerank: Boolean(enableRerank),
    rerank_top_n: rerankTopN,
    precision_weight_embedding: weightEmbedding,
    precision_weight_keyword: weightKeyword
  };
}

function buildBaseJobContext({
  resumeText,
  wishes,
  selectedRerankProfileId,
  model,
  lmTimeout,
  precisionWeightEmbedding,
  precisionWeightKeyword
}) {
  return {
    resume_text: resumeText.trim(),
    wishes: wishes.trim() || null,
    selected_rerank_profile_id: selectedRerankProfileId || null,
    model: model || null,
    lm_timeout: lmTimeout,
    precision_weight_embedding: precisionWeightEmbedding,
    precision_weight_keyword: precisionWeightKeyword
  };
}

export function buildQueryDebugRequest({
  resumeText,
  wishes,
  selectedRerankProfileId,
  model,
  lmTimeout
}) {
  return {
    resume_text: resumeText.trim(),
    wishes: wishes.trim() || null,
    selected_rerank_profile_id: selectedRerankProfileId || null,
    model: model || null,
    lm_timeout: lmTimeout
  };
}

export function buildScoreJobsRequest({
  jobs,
  resumeText,
  wishes,
  selectedRerankProfileId,
  bm25Query,
  bm25Language,
  bm25Tokenizer,
  bm25QueryTerms,
  model,
  lmTimeout,
  precisionWeightEmbedding,
  precisionWeightKeyword
}) {
  return {
    jobs,
    ...buildBaseJobContext({
      resumeText,
      wishes,
      selectedRerankProfileId,
      model,
      lmTimeout,
      precisionWeightEmbedding,
      precisionWeightKeyword
    }),
    bm25_query: bm25Query || null,
    bm25_language: bm25Language || null,
    bm25_tokenizer: bm25Tokenizer || null,
    bm25_query_terms: bm25QueryTerms || null
  };
}

export function buildRerankJobsRequest({
  jobs,
  resumeText,
  wishes,
  selectedRerankProfileId,
  bm25Query,
  bm25Language,
  bm25Tokenizer,
  bm25QueryTerms,
  model,
  lmTimeout,
  rerankTopN,
  precisionWeightEmbedding,
  precisionWeightKeyword
}) {
  return {
    ...buildScoreJobsRequest({
      jobs,
      resumeText,
      wishes,
      selectedRerankProfileId,
      bm25Query,
      bm25Language,
      bm25Tokenizer,
      bm25QueryTerms,
      model,
      lmTimeout,
      precisionWeightEmbedding,
      precisionWeightKeyword
    }),
    rerank_top_n: rerankTopN ?? null
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
