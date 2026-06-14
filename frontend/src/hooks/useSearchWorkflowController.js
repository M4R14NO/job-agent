import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  enrichLinkedInJobs,
  fetchQueryDebug,
  rerankJobs,
  searchJobs
} from "../api/search";
import {
  isTransientDetailsFailure,
  mergeLinkedInEnrichedJobs,
  mergeResponseStable
} from "../workflow/search/searchMappers";

const CACHE_KEY = "job-agent:search-response";
const SEARCH_BATCH_SIZE = 4;

export default function useSearchWorkflowController(options = {}) {
  const {
    resumeText,
    wishes,
    selectedRerankProfileId,
    searchTerm,
    location,
    searchRadiusKm,
    resultsWanted,
    hoursOld,
    isRemote,
    selectedModel,
    lmTimeout,
    enableRerank,
    rerankTopN,
    weightEmbedding,
    weightKeyword,
    setResumeText,
    setWishes,
    setSearchTerm,
    setLocation,
    setSearchRadiusKm,
    setResultsWanted,
    setHoursOld,
    setIsRemote,
    setSelectedModel,
    setLmTimeout,
    setEnableRerank,
    setRerankTopN,
    setWeightEmbedding,
    setWeightKeyword,
    onLoadCacheApplied
  } = options;

  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cachedResponse, setCachedResponse] = useState(null);
  const [cachedAt, setCachedAt] = useState("");
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);
  const [searchPhaseMessage, setSearchPhaseMessage] = useState("");
  const [isReranking, setIsReranking] = useState(false);

  const searchTimerRef = useRef(null);
  const searchRequestIdRef = useRef(0);
  const searchAbortControllerRef = useRef(null);

  const persistSearchCache = useCallback((nextResponse) => {
    if (!nextResponse) return;
    const savedAt = new Date().toISOString();
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        savedAt,
        response: nextResponse,
        resumeText,
        wishes,
        searchTerm,
        location,
        searchRadiusKm,
        resultsWanted,
        hoursOld,
        isRemote,
        sites: ["linkedin"],
        selectedModel,
        lmTimeout,
        enableRerank,
        rerankTopN,
        weightEmbedding,
        weightKeyword
      })
    );
    setCachedResponse(nextResponse);
    setCachedAt(savedAt);
  }, [
    resumeText,
    wishes,
    searchTerm,
    location,
    searchRadiusKm,
    resultsWanted,
    hoursOld,
    isRemote,
    selectedModel,
    lmTimeout,
    enableRerank,
    rerankTopN,
    weightEmbedding,
    weightKeyword
  ]);

  const handleSearch = useCallback(async () => {
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
      selectedRerankProfileId,
      searchTerm,
      location,
      searchRadiusKm,
      resultsWanted,
      hoursOld,
      isRemote,
      sites: ["linkedin"],
      model: selectedModel,
      lmTimeout,
      rerankTopN,
      weightEmbedding,
      weightKeyword
    };

    setIsLoading(true);
    setError("");
    setResponse(null);
    setSearchPhaseMessage("Loading LinkedIn results...");

    try {
      let finalData = null;

      const quickData = await searchJobs({
        ...baseInput,
        enableRerank: false
      }, { signal: abortController.signal });
      if (requestId !== searchRequestIdRef.current) return;

      finalData = mergeResponseStable(null, quickData);
      setResponse(finalData);

      const jobsNeedingDetails = (finalData.jobs || [])
        .filter((job) => String(job.site || "").toLowerCase() === "linkedin")
        .filter((job) => (job.description || job.job_description || "").trim().length === 0)
        .filter((job) => String(job.job_url || "").trim().length > 0);

      const totalNeedingDetails = jobsNeedingDetails.length;
      const totalBatches = Math.ceil(totalNeedingDetails / SEARCH_BATCH_SIZE);
      const retriedUrls = new Set();

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const start = batchIndex * SEARCH_BATCH_SIZE;
        const end = Math.min(start + SEARCH_BATCH_SIZE, totalNeedingDetails);
        const batch = jobsNeedingDetails.slice(start, end);
        const batchLabel = `${batchIndex + 1}/${totalBatches}`;

        setSearchPhaseMessage(
          `Batch ${batchLabel}: enriching ${end}/${totalNeedingDetails} LinkedIn jobs...`
        );

        const enrichedItems = await enrichLinkedInJobs(
          batch.map((job) => ({ job_url: job.job_url })),
          { signal: abortController.signal }
        );
        if (requestId !== searchRequestIdRef.current) return;

        const retryCandidates = enrichedItems.filter((item) => {
          const jobUrl = String(item?.job_url || "").trim();
          if (!jobUrl || retriedUrls.has(jobUrl)) return false;
          return isTransientDetailsFailure(item);
        });

        let finalEnrichedItems = enrichedItems;
        if (retryCandidates.length > 0) {
          retryCandidates.forEach((item) => {
            retriedUrls.add(String(item.job_url || "").trim());
          });

          setSearchPhaseMessage(
            `Batch ${batchLabel}: retrying ${retryCandidates.length} transient detail fetches...`
          );

          const retriedItems = await enrichLinkedInJobs(
            retryCandidates.map((item) => ({ job_url: item.job_url })),
            { signal: abortController.signal }
          );
          if (requestId !== searchRequestIdRef.current) return;

          const retriedByUrl = new Map(
            retriedItems
              .map((item) => [String(item.job_url || "").trim(), item])
              .filter(([jobUrl]) => jobUrl)
          );

          finalEnrichedItems = enrichedItems.map((item) => {
            const jobUrl = String(item?.job_url || "").trim();
            return retriedByUrl.get(jobUrl) || item;
          });
        }

        finalData = mergeLinkedInEnrichedJobs(finalData, finalEnrichedItems);
        setResponse((prev) => mergeLinkedInEnrichedJobs(prev, finalEnrichedItems));
      }

      if (!finalData) return;
      persistSearchCache(finalData);
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
  }, [
    resumeText,
    wishes,
    selectedRerankProfileId,
    searchTerm,
    location,
    searchRadiusKm,
    resultsWanted,
    hoursOld,
    isRemote,
    selectedModel,
    lmTimeout,
    rerankTopN,
    weightEmbedding,
    weightKeyword,
    persistSearchCache
  ]);

  const handleRunRerank = useCallback(async () => {
    if (!response?.jobs?.length) {
      setError("Run a search first before reranking the current results.");
      return;
    }
    if (!selectedModel) {
      setError("Select an AI model in the matching settings before running LLM matching.");
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);
    setIsReranking(true);
    setError("");
    setSearchPhaseMessage("Running LLM matching on current results...");
    setEnableRerank?.(true);

    try {
      const currentQueryDebug = await fetchQueryDebug(
        {
          resumeText,
          wishes,
          selectedRerankProfileId,
          model: selectedModel,
          lmTimeout
        },
        { signal: abortController.signal }
      );

      const rerankData = await rerankJobs(
        {
          jobs: response.jobs,
          resumeText,
          wishes,
          selectedRerankProfileId: selectedRerankProfileId || currentQueryDebug.query_profile_id || response.query_profile_id || "",
          bm25Query: currentQueryDebug.bm25_query || response.bm25_query || null,
          bm25Language: currentQueryDebug.bm25_language || response.bm25_language || null,
          bm25Tokenizer: currentQueryDebug.bm25_tokenizer || response.bm25_tokenizer || null,
          bm25QueryTerms: currentQueryDebug.bm25_query_terms || response.bm25_query_terms || null,
          model: selectedModel,
          lmTimeout,
          rerankTopN,
          precisionWeightEmbedding: weightEmbedding,
          precisionWeightKeyword: weightKeyword
        },
        { signal: abortController.signal }
      );

      const mergedResponse = mergeResponseStable(response, rerankData, { preserveRichDetails: true });
      setResponse(mergedResponse);
      persistSearchCache(mergedResponse);
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to rerank current results.");
    } finally {
      setIsLoading(false);
      setIsReranking(false);
      setSearchPhaseMessage("");
    }
  }, [
    response,
    selectedModel,
    setEnableRerank,
    resumeText,
    wishes,
    selectedRerankProfileId,
    lmTimeout,
    rerankTopN,
    weightEmbedding,
    weightKeyword,
    persistSearchCache
  ]);

  const handleLoadCache = useCallback(() => {
    if (!cachedResponse) return;
    setError("");
    setResponse(cachedResponse);
    onLoadCacheApplied?.(cachedResponse);
  }, [cachedResponse, onLoadCacheApplied]);

  const handleClearCache = useCallback(() => {
    sessionStorage.removeItem(CACHE_KEY);
    setCachedResponse(null);
    setCachedAt("");
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

  useEffect(() => () => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached);
      if (!parsed?.response) return;

      setCachedResponse(parsed.response);
      setCachedAt(parsed.savedAt || "");
      if (typeof parsed.resumeText === "string") setResumeText?.(parsed.resumeText);
      if (typeof parsed.wishes === "string") setWishes?.(parsed.wishes);
      if (typeof parsed.searchTerm === "string") setSearchTerm?.(parsed.searchTerm);
      if (typeof parsed.location === "string") setLocation?.(parsed.location);
      if (typeof parsed.searchRadiusKm === "number" || parsed.searchRadiusKm === null) {
        setSearchRadiusKm?.(parsed.searchRadiusKm ?? null);
      }
      if (typeof parsed.resultsWanted === "number") setResultsWanted?.(parsed.resultsWanted);
      if (typeof parsed.hoursOld === "number") setHoursOld?.(parsed.hoursOld);
      if (typeof parsed.isRemote === "boolean") setIsRemote?.(parsed.isRemote);
      if (typeof parsed.selectedModel === "string") setSelectedModel?.(parsed.selectedModel);
      if (typeof parsed.lmTimeout === "number") setLmTimeout?.(parsed.lmTimeout);
      if (typeof parsed.enableRerank === "boolean") setEnableRerank?.(parsed.enableRerank);
      if (typeof parsed.rerankTopN === "number" || parsed.rerankTopN === null) {
        setRerankTopN?.(parsed.rerankTopN ?? null);
      }
      if (typeof parsed.weightEmbedding === "number") setWeightEmbedding?.(parsed.weightEmbedding);
      if (typeof parsed.weightKeyword === "number") setWeightKeyword?.(parsed.weightKeyword);
    } catch (_err) {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }, [
    setResumeText,
    setWishes,
    setSearchTerm,
    setLocation,
    setSearchRadiusKm,
    setResultsWanted,
    setHoursOld,
    setIsRemote,
    setSelectedModel,
    setLmTimeout,
    setEnableRerank,
    setRerankTopN,
    setWeightEmbedding,
    setWeightKeyword
  ]);

  return useMemo(() => ({
    response,
    setResponse,
    error,
    setError,
    isLoading,
    searchElapsedMs,
    searchPhaseMessage,
    isReranking,
    cachedResponse,
    cachedAt,
    handleSearch,
    handleRunRerank,
    handleLoadCache,
    handleClearCache
  }), [
    response,
    error,
    isLoading,
    searchElapsedMs,
    searchPhaseMessage,
    isReranking,
    cachedResponse,
    cachedAt,
    handleSearch,
    handleRunRerank,
    handleLoadCache,
    handleClearCache
  ]);
}
