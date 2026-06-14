export const buildLineageFields = ({
  sourceProfile,
  nextProfileId,
  branchReason = null,
  sanitizeProfileIdFn
} = {}) => {
  const sanitize = typeof sanitizeProfileIdFn === "function"
    ? sanitizeProfileIdFn
    : (value) => String(value || "").trim().toLowerCase();

  const targetId = sanitize(nextProfileId || "profile");
  if (!sourceProfile?.profile_id) {
    return {
      parent_profile_id: null,
      lineage_root_profile_id: targetId,
      lineage_depth: 0,
      branch_reason: branchReason
    };
  }

  const sourceRoot = sourceProfile.lineage_root_profile_id || sourceProfile.profile_id;
  const sourceDepth = Number.isFinite(sourceProfile.lineage_depth)
    ? Number(sourceProfile.lineage_depth)
    : 0;

  return {
    parent_profile_id: sourceProfile.profile_id,
    lineage_root_profile_id: sourceRoot,
    lineage_depth: sourceDepth + 1,
    branch_reason: branchReason || "manual-branch"
  };
};

export const resolveRemapLineageFields = ({
  existingTarget,
  existing,
  nextProfileId,
  isJobWorkflow,
  sanitizeProfileIdFn
} = {}) => {
  if (existingTarget) {
    return {
      parent_profile_id: existingTarget.parent_profile_id ?? null,
      lineage_root_profile_id: existingTarget.lineage_root_profile_id ?? existingTarget.profile_id,
      lineage_depth: existingTarget.lineage_depth ?? 0,
      branch_reason: existingTarget.branch_reason ?? null
    };
  }

  const isBranchFromSource = Boolean(
    existing?.profile_id
    && nextProfileId !== existing.profile_id
  );

  if (!isBranchFromSource) {
    return buildLineageFields({
      sourceProfile: null,
      nextProfileId,
      branchReason: null,
      sanitizeProfileIdFn
    });
  }

  return buildLineageFields({
    sourceProfile: existing,
    nextProfileId,
    branchReason: isJobWorkflow ? "job-tailor" : "manual-tailor",
    sanitizeProfileIdFn
  });
};

export const buildSaveAndSwitchPayload = ({
  existing,
  basePayload,
  currentProfileId,
  applicationContext,
  resumeText,
  normalizeHexColorFn,
  mergeProfileImageIntoDataFn
} = {}) => ({
  ...basePayload,
  profile_id: currentProfileId,
  revision: existing.revision,
  company: applicationContext.company || null,
  application_status: applicationContext.application_status || null,
  application_date: applicationContext.application_date || null,
  job_title: applicationContext.job_title || null,
  job_description: applicationContext.job_description || null,
  job_url: applicationContext.job_url || null,
  theme_color: normalizeHexColorFn(applicationContext.theme_color, null),
  show_profile_image: applicationContext.show_profile_image !== false,
  header_text_align: applicationContext.header_text_align || "right",
  header_title_size: applicationContext.header_title_size || "Huge",
  header_subtitle_size: applicationContext.header_subtitle_size || "Large",
  parent_profile_id: basePayload.parent_profile_id ?? existing.parent_profile_id ?? null,
  lineage_root_profile_id: basePayload.lineage_root_profile_id ?? existing.lineage_root_profile_id ?? existing.profile_id,
  lineage_depth: basePayload.lineage_depth ?? existing.lineage_depth ?? 0,
  branch_reason: basePayload.branch_reason ?? existing.branch_reason ?? null,
  audit: {
    ...(existing.audit || {}),
    ...(basePayload.audit || {}),
    raw_resume_text: resumeText
  },
  data: mergeProfileImageIntoDataFn(basePayload.data || existing.data, applicationContext.profile_image)
});

export const buildUpdateApplicationProfilePayload = ({
  existing,
  targetProfileId,
  cvTemplateId,
  canonicalSchemaVersion,
  applicationContext,
  resumeText,
  normalizeHexColorFn,
  mergeProfileImageIntoDataFn
} = {}) => {
  const basePayload = existing || {
    schema_version: canonicalSchemaVersion,
    profile_id: targetProfileId,
    revision: 0,
    template_id: cvTemplateId || "awesomecv",
    parent_profile_id: null,
    lineage_root_profile_id: targetProfileId,
    lineage_depth: 0,
    branch_reason: null,
    data: {},
    section_order: [],
    sidebar_section_order: [],
    main_section_order: [],
    audit: {}
  };

  return {
    ...basePayload,
    profile_id: targetProfileId,
    revision: basePayload.revision ?? 0,
    template_id: cvTemplateId || basePayload.template_id || "awesomecv",
    company: applicationContext.company || null,
    application_status: applicationContext.application_status || null,
    application_date: applicationContext.application_date || null,
    job_title: applicationContext.job_title || null,
    job_description: applicationContext.job_description || null,
    job_url: applicationContext.job_url || null,
    theme_color: normalizeHexColorFn(applicationContext.theme_color, null),
    show_profile_image: applicationContext.show_profile_image !== false,
    header_text_align: applicationContext.header_text_align || "right",
    header_title_size: applicationContext.header_title_size || "Huge",
    header_subtitle_size: applicationContext.header_subtitle_size || "Large",
    parent_profile_id: basePayload.parent_profile_id ?? null,
    lineage_root_profile_id: basePayload.lineage_root_profile_id ?? targetProfileId,
    lineage_depth: basePayload.lineage_depth ?? 0,
    branch_reason: basePayload.branch_reason ?? null,
    section_order: basePayload.section_order || [],
    sidebar_section_order: basePayload.sidebar_section_order || [],
    main_section_order: basePayload.main_section_order || [],
    audit: {
      ...(basePayload.audit || {}),
      raw_resume_text: resumeText
    },
    data: mergeProfileImageIntoDataFn(basePayload.data, applicationContext.profile_image)
  };
};

export const buildRemapProfilePayload = ({
  parsed,
  existing,
  existingTarget,
  nextProfileId,
  cvTemplateId,
  applicationContext,
  resumeText,
  effectiveJobTitle,
  effectiveCompany,
  effectiveJobDescription,
  effectiveJobUrl,
  lineageFields,
  normalizeHexColorFn,
  mergeProfileImageIntoDataFn
} = {}) => ({
  schema_version: parsed.schema_version || existing?.schema_version || "v1",
  profile_id: nextProfileId,
  revision: existingTarget?.revision ?? 0,
  template_id: existing?.template_id || cvTemplateId,
  company: effectiveCompany || null,
  application_status: applicationContext.application_status || existing?.application_status || null,
  application_date: applicationContext.application_date || existing?.application_date || null,
  job_title: effectiveJobTitle || null,
  job_description: effectiveJobDescription || null,
  job_url: effectiveJobUrl || null,
  theme_color: normalizeHexColorFn(applicationContext.theme_color || existing?.theme_color, null),
  show_profile_image: applicationContext.show_profile_image !== false,
  header_text_align: applicationContext.header_text_align || existing?.header_text_align || "right",
  header_title_size: applicationContext.header_title_size || existing?.header_title_size || "Huge",
  header_subtitle_size: applicationContext.header_subtitle_size || existing?.header_subtitle_size || "Large",
  ...lineageFields,
  data: mergeProfileImageIntoDataFn(parsed.data, applicationContext.profile_image || existing?.data?.profile_image),
  section_order: existing?.section_order || parsed.section_order || [],
  sidebar_section_order: existing?.sidebar_section_order || parsed.sidebar_section_order || [],
  main_section_order: existing?.main_section_order || parsed.main_section_order || [],
  audit: {
    ...(existing?.audit || {}),
    raw_resume_text: resumeText,
    parsed_canonical: parsed.data,
    edited_canonical: parsed.data
  }
});

export const buildJobEditDraftPayload = ({
  sourceProfile,
  nextDraftId,
  selectedJob,
  applicationContext,
  resumeText,
  normalizeHexColorFn,
  lineageFields
} = {}) => ({
  ...sourceProfile,
  profile_id: nextDraftId,
  revision: 0,
  company: selectedJob.company || applicationContext.company || sourceProfile.company || null,
  application_status: applicationContext.application_status || "",
  application_date: applicationContext.application_date || null,
  job_title: selectedJob.title || applicationContext.job_title || sourceProfile.job_title || null,
  job_description: selectedJob.description || applicationContext.job_description || sourceProfile.job_description || null,
  job_url: selectedJob.job_url || applicationContext.job_url || sourceProfile.job_url || null,
  theme_color: normalizeHexColorFn(applicationContext.theme_color || sourceProfile.theme_color, null),
  show_profile_image: applicationContext.show_profile_image !== false,
  header_text_align: applicationContext.header_text_align || sourceProfile.header_text_align || "right",
  header_title_size: applicationContext.header_title_size || sourceProfile.header_title_size || "Huge",
  header_subtitle_size: applicationContext.header_subtitle_size || sourceProfile.header_subtitle_size || "Large",
  ...lineageFields,
  audit: {
    ...(sourceProfile.audit || {}),
    raw_resume_text: resumeText || sourceProfile.audit?.raw_resume_text || ""
  }
});

export const buildCreateNewEntryPayload = ({
  nextProfileId,
  cvTemplateId,
  canonicalSchemaVersion,
  applicationContext,
  resumeText,
  normalizeHexColorFn,
  mergeProfileImageIntoDataFn
} = {}) => ({
  schema_version: canonicalSchemaVersion,
  profile_id: nextProfileId,
  revision: 0,
  template_id: cvTemplateId || "awesomecv",
  company: applicationContext.company || null,
  application_status: applicationContext.application_status || null,
  application_date: applicationContext.application_date || null,
  job_title: applicationContext.job_title || null,
  job_description: applicationContext.job_description || null,
  job_url: applicationContext.job_url || null,
  theme_color: normalizeHexColorFn(applicationContext.theme_color, null),
  show_profile_image: applicationContext.show_profile_image !== false,
  header_text_align: applicationContext.header_text_align || "right",
  header_title_size: applicationContext.header_title_size || "Huge",
  header_subtitle_size: applicationContext.header_subtitle_size || "Large",
  parent_profile_id: null,
  lineage_root_profile_id: nextProfileId,
  lineage_depth: 0,
  branch_reason: null,
  data: mergeProfileImageIntoDataFn({}, applicationContext.profile_image),
  section_order: [],
  sidebar_section_order: [],
  main_section_order: [],
  audit: {
    raw_resume_text: resumeText || ""
  }
});
