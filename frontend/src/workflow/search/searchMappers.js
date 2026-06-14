const getJobStableId = (job, fallbackIndex = 0) => {
  if (!job || typeof job !== "object") return `job-${fallbackIndex}`;
  const jobUrl = String(job.job_url || "").trim();
  if (jobUrl) return `url:${jobUrl}`;
  const title = String(job.title || "").trim().toLowerCase();
  const company = String(job.company || job.company_name || "").trim().toLowerCase();
  const location = String(job.location || "").trim().toLowerCase();
  const site = String(job.site || "").trim().toLowerCase();
  return `sig:${title}|${company}|${location}|${site}|${fallbackIndex}`;
};

export const mergeResponseStable = (previous, incoming, options = {}) => {
  const preserveRichDetails = Boolean(options.preserveRichDetails);
  if (!incoming || !Array.isArray(incoming.jobs)) {
    return incoming;
  }

  const prevJobs = Array.isArray(previous?.jobs) ? previous.jobs : [];
  const prevKeys = new Set(prevJobs.map((job, index) => getJobStableId(job, index)));
  const incomingByKey = new Map(
    incoming.jobs.map((job, index) => [getJobStableId(job, index), job])
  );

  const mergedJobs = [];
  prevJobs.forEach((job, index) => {
    const key = getJobStableId(job, index);
    const next = incomingByKey.get(key);
    if (!next) {
      mergedJobs.push(job);
      return;
    }

    const merged = { ...job, ...next };

    if (!preserveRichDetails) {
      const hadDescription = (job.description || "").trim().length > 0;
      const nowHasDescription = (next.description || "").trim().length > 0;
      if (!hadDescription && nowHasDescription) {
        merged._enrichedAt = Date.now();
      } else {
        merged._enrichedAt = job._enrichedAt ?? null;
      }
    }

    if (preserveRichDetails) {
      const prevDescription = String(job.description || "");
      const nextDescription = String(next.description || "");
      if (prevDescription.length > nextDescription.length) {
        merged.description = job.description;
      }

      const prevJobDescription = String(job.job_description || "");
      const nextJobDescription = String(next.job_description || "");
      if (prevJobDescription.length > nextJobDescription.length) {
        merged.job_description = job.job_description;
      }

      const prevSnippet = String(job.snippet || "");
      const nextSnippet = String(next.snippet || "");
      if (prevSnippet.length > nextSnippet.length) {
        merged.snippet = job.snippet;
      }

      if (job.rerank_score != null && next.rerank_score == null) {
        merged.rerank_score = job.rerank_score;
      }

      const nextReasons = Array.isArray(next.match_reasons) ? next.match_reasons : [];
      const prevReasons = Array.isArray(job.match_reasons) ? job.match_reasons : [];
      if (prevReasons.length > nextReasons.length) {
        merged.match_reasons = prevReasons;
      }
    }

    mergedJobs.push(merged);
  });

  incoming.jobs.forEach((job, index) => {
    const key = getJobStableId(job, index);
    if (!prevKeys.has(key)) {
      mergedJobs.push(job);
    }
  });

  return {
    ...incoming,
    jobs: mergedJobs,
  };
};

export const mergeLinkedInEnrichedJobs = (previous, enrichItems) => {
  if (!previous || !Array.isArray(previous.jobs) || !Array.isArray(enrichItems)) {
    return previous;
  }

  const enrichByUrl = new Map(
    enrichItems
      .filter((item) => item)
      .map((item) => [String(item.job_url || "").trim(), item])
      .filter(([jobUrl]) => jobUrl)
  );

  if (!enrichByUrl.size) {
    return previous;
  }

  const jobs = previous.jobs.map((job) => {
    const jobUrl = String(job?.job_url || "").trim();
    const item = enrichByUrl.get(jobUrl);
    if (!item) {
      return job;
    }

    const hadDescription = String(job.description || job.job_description || "").trim().length > 0;
    const nextDescription = String(item.description || "").trim();

    if (item.status === "ok" && (nextDescription || item.description_html)) {
      return {
        ...job,
        description: nextDescription,
        job_description: nextDescription,
        description_html: item.description_html || null,
        _detailsFetched: true,
        _detailsStatus: "ok",
        _detailsError: null,
        _enrichedAt: hadDescription ? (job._enrichedAt ?? null) : Date.now(),
      };
    }

    return {
      ...job,
      _detailsFetched: false,
      _detailsStatus: item.status || "error",
      _detailsError: item.error || null,
    };
  });

  return {
    ...previous,
    jobs,
  };
};

export const isTransientDetailsFailure = (item) => {
  if (!item) return false;
  if (item.status === "timeout") return true;
  if (item.status !== "http_error") return false;
  const msg = String(item.error || "");
  return /HTTP\s(429|502|503|504)/i.test(msg);
};
