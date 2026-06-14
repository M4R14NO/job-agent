import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchModels } from "../api/llm";
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
    setResumeText,
    setWishes,
    loadRerankProfile,
    onLoadCacheApplied
  } = options;

  const [searchTerm, setSearchTerm] = useState("");
  const [location, setLocation] = useState("");
  const [searchRadiusKm, setSearchRadiusKm] = useState(null);
  const [resultsWanted, setResultsWanted] = useState(10);
  const [hoursOld, setHoursOld] = useState(72);
  const [isRemote, setIsRemote] = useState(false);
  const [enableRerank, setEnableRerank] = useState(false);
  const [rerankTopN, setRerankTopN] = useState(null);
  const [weightEmbedding, setWeightEmbedding] = useState(0.8);
  const [weightKeyword, setWeightKeyword] = useState(0.2);
  const [selectedRerankProfileId, setSelectedRerankProfileId] = useState("");
  const [models, setModels] = useState([]);
  const [modelError, setModelError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [lmTimeout, setLmTimeout] = useState(120);

  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cachedResponse, setCachedResponse] = useState(null);
  const [cachedAt, setCachedAt] = useState("");
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);
  const [searchPhaseMessage, setSearchPhaseMessage] = useState("");
  const [isReranking, setIsReranking] = useState(false);
  const [rerankProfileError, setRerankProfileError] = useState("");

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
        selectedRerankProfileId,
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
      if (err?.name === "AbortError") return;
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
    setEnableRerank(true);

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
      if (err?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to rerank current results.");
    } finally {
      setIsLoading(false);
      setIsReranking(false);
      setSearchPhaseMessage("");
    }
  }, [
    response,
    selectedModel,
    resumeText,
    wishes,
    selectedRerankProfileId,
    lmTimeout,
    rerankTopN,
    weightEmbedding,
    weightKeyword,
    persistSearchCache
  ]);

  const handleSelectRerankProfile = useCallback(async (profileId) => {
    const nextId = profileId || "";
    setSelectedRerankProfileId(nextId);
    if (!nextId) {
      setRerankProfileError("");
      return;
    }

    if (typeof loadRerankProfile !== "function") {
      setRerankProfileError("");
      return;
    }

    setRerankProfileError("");
    try {
      const profile = await loadRerankProfile(nextId);
      const rawResume = profile?.audit?.raw_resume_text || "";
      setResumeText?.(rawResume);
      if (!rawResume.trim()) {
        setRerankProfileError("Selected CV profile has no saved CV text.");
      }
    } catch (err) {
      setRerankProfileError(err instanceof Error ? err.message : "Failed to load selected CV profile.");
    }
  }, [loadRerankProfile, setResumeText]);

  const syncRerankProfileSelection = useCallback((profiles = []) => {
    const list = Array.isArray(profiles) ? profiles : [];
    setSelectedRerankProfileId((prev) => {
      if (prev && list.some((profile) => profile.profile_id === prev)) {
        return prev;
      }
      return list[0]?.profile_id || "";
    });
    if (!list.length) {
      setRerankProfileError("");
    }
  }, []);

  const handleProfilesDeletedFromSearch = useCallback((deletedProfileIds = []) => {
    const ids = Array.isArray(deletedProfileIds) ? deletedProfileIds : [];
    if (!ids.length) return;
    setSelectedRerankProfileId((prev) => (ids.includes(prev) ? "" : prev));
    setRerankProfileError("");
  }, []);

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
    let isMounted = true;
    fetchModels()
      .then((available) => {
        if (!isMounted) return;
        const list = Array.isArray(available) ? available : [];
        setModels(list);
        setModelError("");
        setSelectedModel((prev) => {
          if (prev && list.includes(prev)) return prev;
          return list[0] || "";
        });
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
      if (!parsed?.response) return;

      setCachedResponse(parsed.response);
      setCachedAt(parsed.savedAt || "");
      if (typeof parsed.resumeText === "string") setResumeText?.(parsed.resumeText);
      if (typeof parsed.wishes === "string") setWishes?.(parsed.wishes);
      if (typeof parsed.searchTerm === "string") setSearchTerm(parsed.searchTerm);
      if (typeof parsed.location === "string") setLocation(parsed.location);
      if (typeof parsed.searchRadiusKm === "number" || parsed.searchRadiusKm === null) {
        setSearchRadiusKm(parsed.searchRadiusKm ?? null);
      }
      if (typeof parsed.resultsWanted === "number") setResultsWanted(parsed.resultsWanted);
      if (typeof parsed.hoursOld === "number") setHoursOld(parsed.hoursOld);
      if (typeof parsed.isRemote === "boolean") setIsRemote(parsed.isRemote);
      if (typeof parsed.selectedModel === "string") setSelectedModel?.(parsed.selectedModel);
      if (typeof parsed.lmTimeout === "number") setLmTimeout?.(parsed.lmTimeout);
      if (typeof parsed.enableRerank === "boolean") setEnableRerank(parsed.enableRerank);
      if (typeof parsed.rerankTopN === "number" || parsed.rerankTopN === null) {
        setRerankTopN(parsed.rerankTopN ?? null);
      }
      if (typeof parsed.weightEmbedding === "number") setWeightEmbedding(parsed.weightEmbedding);
      if (typeof parsed.weightKeyword === "number") setWeightKeyword(parsed.weightKeyword);
      if (typeof parsed.selectedRerankProfileId === "string") {
        setSelectedRerankProfileId(parsed.selectedRerankProfileId);
      }
    } catch (_err) {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }, [setResumeText, setWishes]);

  return useMemo(() => ({
    models,
    modelError,
    selectedModel,
    setSelectedModel,
    lmTimeout,
    setLmTimeout,
    response,
    error,
    isLoading,
    searchElapsedMs,
    searchPhaseMessage,
    isReranking,
    cachedResponse,
    cachedAt,
    rerankProfileError,
    searchTerm,
    setSearchTerm,
    location,
    setLocation,
    searchRadiusKm,
    setSearchRadiusKm,
    resultsWanted,
    setResultsWanted,
    hoursOld,
    setHoursOld,
    isRemote,
    setIsRemote,
    enableRerank,
    setEnableRerank,
    rerankTopN,
    setRerankTopN,
    weightEmbedding,
    setWeightEmbedding,
    weightKeyword,
    setWeightKeyword,
    selectedRerankProfileId,
    syncRerankProfileSelection,
    handleProfilesDeletedFromSearch,
    handleSearch,
    handleRunRerank,
    handleSelectRerankProfile,
    handleLoadCache,
    handleClearCache
  }), [
    models,
    modelError,
    selectedModel,
    lmTimeout,
    response,
    error,
    isLoading,
    searchElapsedMs,
    searchPhaseMessage,
    isReranking,
    cachedResponse,
    cachedAt,
    rerankProfileError,
    searchTerm,
    location,
    searchRadiusKm,
    resultsWanted,
    hoursOld,
    isRemote,
    enableRerank,
    rerankTopN,
    weightEmbedding,
    weightKeyword,
    selectedRerankProfileId,
    syncRerankProfileSelection,
    handleProfilesDeletedFromSearch,
    handleSearch,
    handleRunRerank,
    handleSelectRerankProfile,
    handleLoadCache,
    handleClearCache
  ]);
}
