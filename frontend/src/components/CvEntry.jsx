import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Download, PencilLine, Plus, Search, RotateCcw, Sparkles, Tag } from "lucide-react";
import { Progress, Spinner } from "@chakra-ui/react";

const EXAMPLE_CV_TEXT = `PROFILE
Name: Alex Rivers
Headline: Senior Machine Learning Engineer | Applied AI Systems
Summary: 8+ years delivering production AI systems, MLOps workflows, and measurable product impact.

CONTACT
Email: alex.rivers@example.com
Phone: +49 151 0000 0000
Location: Munich, Germany
Links: github.com/alexrivers, linkedin.com/in/alexrivers

EXPERIENCE
2022-01 to Present | Principal ML Engineer | Northstar AI GmbH | Munich, Germany
- Led retrieval and ranking platform serving 2M+ requests/day with 99.95% uptime.
- Improved recommendation CTR by 18% through hybrid embedding plus keyword architecture.
- Mentored 6 engineers and established model release quality gates.

2019-04 to 2021-12 | Senior Data Scientist | Helios Analytics | Berlin, Germany
- Built forecasting services that reduced inventory misses by 24%.
- Introduced feature store conventions and model registry governance.

EDUCATION
M.Sc. Computer Science | Technical University of Munich | 2018
B.Sc. Information Engineering | University of Stuttgart | 2016

SKILLS
Machine Learning: ranking systems, NLP, recommendation systems, experimentation
Programming: Python, TypeScript, SQL, Bash
Platforms: AWS, Docker, Kubernetes, Airflow, Postgres

LANGUAGES
German (C1), English (C2), Spanish (B1)

VOLUNTEER
Mentor | Data4Good Munich | 2021-Present
- Run monthly workshops on practical ML project setup.

HONORS
Top 10 Finalist | European ML Challenge | 2023
Dean's List | TU Munich | 2016-2018

CERTIFICATES
AWS Certified Machine Learning Specialty | AWS | 2024
TensorFlow Developer Certificate | Google | 2022

WRITING
"Efficient Ranking with Hybrid Signals" | Applied AI Review | 2024
"Reliable Offline Evaluation in Recommenders" | MLOps Journal | 2023

INTERESTS
Trail running, analog photography, open-source developer tooling

STRENGTHS
Cross-functional leadership, system thinking, pragmatic delivery

HOBBIES
Rock climbing, chess, espresso brewing

PROJECTS
Open-source feature drift monitor for tabular models (github.com/alexrivers/drift-watch)`;

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
};

const normalizeText = (value) => String(value || "").toLowerCase();

const fuzzyFieldMatch = (query, text) => {
  const q = normalizeText(query).trim();
  const t = normalizeText(text);
  if (!q || q.length < 4) return false;
  if (t.includes(q)) return true;
  let qi = 0;
  let startIndex = -1;
  let endIndex = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      if (startIndex === -1) startIndex = ti;
      endIndex = ti;
      qi += 1;
    }
  }
  if (qi !== q.length) return false;
  // Reject very wide matches to avoid matching almost every row.
  const span = endIndex - startIndex + 1;
  return span <= q.length * 3;
};

const profileSearchFields = (profile) => [
  profile.profile_id,
  profile.company,
  profile.application_status,
  profile.application_date,
  profile.job_title,
  profile.job_description,
  profile.job_url,
  profile.template_id,
  profile.audit?.raw_resume_text,
  JSON.stringify(profile.data || {})
];

const profileMatchesQuery = (profile, query) => {
  const normalized = normalizeText(query).trim();
  if (!normalized) return true;
  const terms = normalized.split(/\s+/).filter(Boolean);
  const fields = profileSearchFields(profile).map((field) => normalizeText(field));
  return terms.every((term) => fields.some((field) => field.includes(term) || fuzzyFieldMatch(term, field)));
};

const statusBadgeClass = (status) => {
  const normalized = normalizeText(status);
  if (normalized === "offer" || normalized === "invited" || normalized === "interviewing") return "status-badge is-positive";
  if (normalized === "applied" || normalized === "in-prep") return "status-badge is-neutral";
  if (normalized === "rejected" || normalized === "closed") return "status-badge is-negative";
  return "status-badge";
};

const nextProfileVersionName = (profileId) => {
  const normalized = (profileId || "profile").trim() || "profile";
  const match = normalized.match(/^(.*?)-v(\d+)$/);
  if (match) {
    return `${match[1]}-v${Number(match[2]) + 1}`;
  }
  return `${normalized}-v2`;
};

const PROFILE_TABLE_COLUMNS = [
  { key: "profile_id", label: "CV profile", sortable: true, defaultWidth: 290, minWidth: 180 },
  { key: "company", label: "Company", sortable: true, defaultWidth: 210, minWidth: 140 },
  { key: "application_status", label: "Status", sortable: true, defaultWidth: 130, minWidth: 96 },
  { key: "job_title", label: "Job title", sortable: true, defaultWidth: 260, minWidth: 160 },
  { key: "template_id", label: "Template", sortable: true, defaultWidth: 130, minWidth: 96 },
  { key: "revision", label: "Revision", sortable: true, defaultWidth: 96, minWidth: 76 },
  { key: "cv_text", label: "CV text", sortable: false, defaultWidth: 110, minWidth: 88 },
  { key: "updated", label: "Updated", sortable: true, defaultWidth: 170, minWidth: 120 }
];

export default function CvEntry({
  cvProfiles,
  profilesError,
  selectedProfileId,
  onSelectedProfileIdChange,
  onProfileRowSelect,
  onUpdateProfileCvText,
  onRemapProfileCvText,
  onCreateNewEntry,
  onBeginNewEntry,
  isCreatingProfileEntry,
  isLoadingProfile,
  isUpdatingProfileCvText,
  isRemappingProfileCvText,
  isUploadingProfileImage,
  remapProgress,
  cvEntryError,
  cvTemplateId,
  onCvTemplateIdChange,
  cvOutputLanguage,
  onCvOutputLanguageChange,
  applicationContext,
  onApplicationContextChange,
  onUploadProfileImage,
  resumeText,
  onResumeTextChange,
  newProfileId,
  draftProfileId,
  isDraftProfileActive,
  contextMode = "create",
  hideCreateProfileButton = false,
  hideUpdateAction = false,
  hideTailorAction = false,
  hideTailorProgress = false,
  tailorActionDisabled,
  profileTableCollapsedByDefault = false,
  applicationContextDefaultCollapsed = false,
  collapsible = false,
  defaultCollapsed = false,
  remapSuggestionBuilder,
  tailorContext = null
}) {
  const isJobMode = contextMode === "job";
  const setupEyebrow = isJobMode ? "CV generation" : "Profile setup";
  const setupTitle = isJobMode ? "Application context" : "Profile & context setup";
  const [showExampleCvText, setShowExampleCvText] = useState(false);
  const [profileSearchDraft, setProfileSearchDraft] = useState("");
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updated");
  const [sortDirection, setSortDirection] = useState("desc");
  const [remapDialogOpen, setRemapDialogOpen] = useState(false);
  const [remapProfileName, setRemapProfileName] = useState("");
  const [newEntryDialogOpen, setNewEntryDialogOpen] = useState(false);
  const [newEntryProfileName, setNewEntryProfileName] = useState("");
  const [newEntryError, setNewEntryError] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [profileBrowserOpen, setProfileBrowserOpen] = useState(!profileTableCollapsedByDefault);
  const [applicationContextOpen, setApplicationContextOpen] = useState(!applicationContextDefaultCollapsed);
  const [entryCollapsed, setEntryCollapsed] = useState(defaultCollapsed);
  const [profileTableHeight, setProfileTableHeight] = useState(420);
  const [columnWidths, setColumnWidths] = useState(() => PROFILE_TABLE_COLUMNS.map((column) => column.defaultWidth));
  const searchInputRef = useRef(null);
  const searchButtonRef = useRef(null);
  const resetButtonRef = useRef(null);
  const createButtonRef = useRef(null);
  const firstRowRef = useRef(null);
  const exampleButtonRef = useRef(null);
  const updateProfileButtonRef = useRef(null);
  const tailorButtonRef = useRef(null);
  const cvTextRef = useRef(null);
  const isResizingTableRef = useRef(false);
  const tableResizeStartYRef = useRef(0);
  const tableResizeStartHeightRef = useRef(420);
  const columnResizeIndexRef = useRef(-1);
  const columnResizeStartXRef = useRef(0);
  const columnResizeStartWidthRef = useRef(0);

  const profilesWithDraft = useMemo(() => {
    if (!isDraftProfileActive || !draftProfileId) return cvProfiles;
    const hasRealProfile = cvProfiles.some((profile) => profile.profile_id === draftProfileId);
    if (hasRealProfile) return cvProfiles;
    const now = new Date().toISOString();
    const draftProfile = {
      profile_id: draftProfileId,
      company: applicationContext.company || "",
      application_status: applicationContext.application_status || "",
      job_title: applicationContext.job_title || "",
      template_id: cvTemplateId || "awesomecv",
      revision: 0,
      updated_at: now,
      created_at: now,
      section_order: [],
      sidebar_section_order: [],
      main_section_order: [],
      data: {},
      __isDraftEntry: true
    };
    return [draftProfile, ...cvProfiles];
  }, [
    cvProfiles,
    isDraftProfileActive,
    draftProfileId,
    applicationContext.company,
    applicationContext.application_status,
    applicationContext.job_title,
    cvTemplateId
  ]);

  const selectedProfile = useMemo(
    () => profilesWithDraft.find((profile) => profile.profile_id === selectedProfileId) || null,
    [profilesWithDraft, selectedProfileId]
  );

  const hasPersistedSelectedProfile = useMemo(
    () => cvProfiles.some((profile) => profile.profile_id === selectedProfileId),
    [cvProfiles, selectedProfileId]
  );

  const compareProfiles = (a, b) => {
    const leftDate = Date.parse(a.updated_at || a.created_at || "") || 0;
    const rightDate = Date.parse(b.updated_at || b.created_at || "") || 0;
    const getValue = (profile, key) => {
      if (key === "updated") return Date.parse(profile.updated_at || profile.created_at || "") || 0;
      if (key === "revision") return Number(profile.revision || 0);
      return normalizeText(profile?.[key]);
    };
    const left = sortBy === "updated" ? leftDate : getValue(a, sortBy);
    const right = sortBy === "updated" ? rightDate : getValue(b, sortBy);
    if (left < right) return sortDirection === "asc" ? -1 : 1;
    if (left > right) return sortDirection === "asc" ? 1 : -1;
    return normalizeText(a.profile_id).localeCompare(normalizeText(b.profile_id));
  };

  const sortedProfiles = useMemo(() => {
    const filtered = profilesWithDraft.filter((profile) => profileMatchesQuery(profile, profileSearchQuery));
    const sorted = [...filtered].sort(compareProfiles);
    return sorted;
  }, [profilesWithDraft, profileSearchQuery, sortBy, sortDirection]);

  const treeRows = useMemo(() => {
    const profileMap = new Map(sortedProfiles.map((profile) => [profile.profile_id, profile]));
    const childMap = new Map();
    const roots = [];

    sortedProfiles.forEach((profile) => {
      const parentId = String(profile.parent_profile_id || "").trim();
      if (parentId && profileMap.has(parentId)) {
        if (!childMap.has(parentId)) childMap.set(parentId, []);
        childMap.get(parentId).push(profile);
      } else {
        roots.push(profile);
      }
    });

    childMap.forEach((children) => children.sort(compareProfiles));
    roots.sort(compareProfiles);

    const flattened = [];
    const visit = (profile, depth, guideLevels, isLastSibling) => {
      const parentId = String(profile.parent_profile_id || "").trim();
      const isRoot = !parentId || !profileMap.has(parentId);
      flattened.push({
        profile,
        depth,
        parentId,
        isRoot,
        hasCvText: Boolean(String(profile?.audit?.raw_resume_text || "").trim()),
        guideLevels,
        isLastSibling
      });
      const children = childMap.get(profile.profile_id) || [];
      children.forEach((child, childIndex) => {
        const childIsLast = childIndex === children.length - 1;
        visit(child, depth + 1, [...guideLevels, !isLastSibling], childIsLast);
      });
    };

    roots.forEach((root, rootIndex) => {
      const isLastRoot = rootIndex === roots.length - 1;
      visit(root, 0, [], isLastRoot);
    });
    return flattened;
  }, [sortedProfiles, sortBy, sortDirection]);

  const remapTargetExists = useMemo(
    () => cvProfiles.some((profile) => profile.profile_id === remapProfileName.trim()),
    [cvProfiles, remapProfileName]
  );

  useEffect(() => {
    if (profileTableCollapsedByDefault) {
      setProfileBrowserOpen(false);
    }
  }, [profileTableCollapsedByDefault]);

  useEffect(() => {
    if (defaultCollapsed) {
      setEntryCollapsed(true);
    }
  }, [defaultCollapsed]);

  const handleProfileSelect = (profile) => {
    if (profileTableCollapsedByDefault) {
      setProfileBrowserOpen(false);
    }
    if (onProfileRowSelect) {
      onProfileRowSelect(profile);
      return;
    }
    onSelectedProfileIdChange(profile.profile_id);
  };

  const handleProfileRowKeyDown = (event, profile) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleProfileSelect(profile);
    }
  };

  const focusFirstRow = () => {
    firstRowRef.current?.focus();
  };

  const focusElementById = (id) => {
    document.getElementById(id)?.focus();
  };

  const focusCvText = () => {
    cvTextRef.current?.focus();
  };

  const openNewEntryDialog = () => {
    onBeginNewEntry?.();
    const defaultName = String(newProfileId || "").trim();
    setNewEntryProfileName(defaultName);
    setNewEntryError("");
    setNewEntryDialogOpen(true);
  };

  const handleConfirmCreateEntry = async () => {
    const requestedName = newEntryProfileName.trim();
    if (!requestedName) {
      setNewEntryError("Profile name is required.");
      return;
    }
    try {
      await onCreateNewEntry?.({ profileName: requestedName });
      setNewEntryDialogOpen(false);
      setNewEntryError("");
    } catch (err) {
      setNewEntryError(err instanceof Error ? err.message : "Failed to create profile");
    }
  };

  const openRemapDialog = () => {
    const defaultSuggested = hasPersistedSelectedProfile
      ? nextProfileVersionName(selectedProfile?.profile_id || selectedProfileId || "profile")
      : (newProfileId.trim() || "");
    const suggested = typeof remapSuggestionBuilder === "function"
      ? (remapSuggestionBuilder({
        defaultSuggested,
        selectedProfile,
        selectedProfileId,
        newProfileId,
        hasPersistedSelectedProfile,
        applicationContext
      }) || defaultSuggested)
      : defaultSuggested;
    setRemapProfileName(suggested);
    setRemapDialogOpen(true);
  };

  const handleConfirmRemap = () => {
    const targetProfileId = remapProfileName.trim();
    if (!targetProfileId) return;
    onRemapProfileCvText?.({
      targetProfileId,
      allowOverwrite: remapTargetExists
    });
    setRemapDialogOpen(false);
  };

  const handleProfileImageChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProfileImageError("");
    try {
      await onUploadProfileImage?.(file);
    } catch (err) {
      setProfileImageError(err instanceof Error ? err.message : "Failed to upload profile image");
    }
  };

  const toggleSort = (nextSortBy) => {
    if (sortBy === nextSortBy) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSortBy);
    setSortDirection(nextSortBy === "updated" || nextSortBy === "revision" ? "desc" : "asc");
  };

  const renderSortHeader = (label, key) => (
    <button type="button" className="table-sort-button" onClick={() => toggleSort(key)}>
      <span>{label}</span>
      {sortBy === key ? <span className="table-sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );

  const handleTableResizeStart = (event) => {
    isResizingTableRef.current = true;
    tableResizeStartYRef.current = event.clientY;
    tableResizeStartHeightRef.current = profileTableHeight;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  const handleColumnResizeStart = (event, columnIndex) => {
    event.preventDefault();
    event.stopPropagation();
    columnResizeIndexRef.current = columnIndex;
    columnResizeStartXRef.current = event.clientX;
    columnResizeStartWidthRef.current = columnWidths[columnIndex];
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (applicationContextDefaultCollapsed) {
      setApplicationContextOpen(false);
    }
  }, [applicationContextDefaultCollapsed]);

  useEffect(() => {
    const onMouseMove = (event) => {
      if (columnResizeIndexRef.current >= 0) {
        const index = columnResizeIndexRef.current;
        const delta = event.clientX - columnResizeStartXRef.current;
        const minWidth = PROFILE_TABLE_COLUMNS[index]?.minWidth || 80;
        const nextWidth = Math.max(minWidth, columnResizeStartWidthRef.current + delta);
        setColumnWidths((prev) => {
          if (prev[index] === nextWidth) return prev;
          const updated = [...prev];
          updated[index] = nextWidth;
          return updated;
        });
        return;
      }

      if (!isResizingTableRef.current) return;
      const delta = event.clientY - tableResizeStartYRef.current;
      const next = Math.min(Math.max(tableResizeStartHeightRef.current + delta, 240), 920);
      setProfileTableHeight(next);
    };

    const onMouseUp = () => {
      const wasColumnResizing = columnResizeIndexRef.current >= 0;
      if (wasColumnResizing) {
        columnResizeIndexRef.current = -1;
      }

      const wasTableResizing = isResizingTableRef.current;
      if (wasTableResizing) {
        isResizingTableRef.current = false;
      }

      if (wasColumnResizing || wasTableResizing) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [profileTableHeight]);

  const renderProfileHeaderCell = (column, index) => (
    <th key={column.key} className="cv-profile-table-header-cell">
      <div className="cv-profile-table-header-content">
        {column.sortable
          ? renderSortHeader(column.label, column.key)
          : <span className="table-header-label">{column.label}</span>}
      </div>
      {index < PROFILE_TABLE_COLUMNS.length - 1 ? (
        <span
          className="cv-profile-column-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${column.label} column`}
          onMouseDown={(event) => handleColumnResizeStart(event, index)}
          title={`Drag to resize ${column.label} column`}
        />
      ) : null}
    </th>
  );

  const renderProfileTable = () => (
    <table className="cv-profile-table">
      <colgroup>
        {columnWidths.map((width, index) => (
          <col key={PROFILE_TABLE_COLUMNS[index].key} style={{ width: `${width}px` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {PROFILE_TABLE_COLUMNS.map((column, index) => renderProfileHeaderCell(column, index))}
        </tr>
      </thead>
      <tbody>{renderProfileTableRows()}</tbody>
    </table>
  );

  const renderProfileTableRows = () => {
    if (profilesError) {
      return (
        <tr>
          <td colSpan={8}>
            <p className="error">Failed to load profiles: {profilesError}</p>
          </td>
        </tr>
      );
    }

    if (treeRows.length === 0) {
      return (
        <tr>
          <td colSpan={8}>
            <p className="helper">No matching profiles found.</p>
          </td>
        </tr>
      );
    }

    return treeRows.map((row, index) => {
      const { profile, depth, parentId, isRoot, hasCvText, guideLevels, isLastSibling } = row;
      const isSelected = selectedProfileId === profile.profile_id;
      const ancestorGuideLevels = guideLevels.slice(0, -1);
      const firstContinuingGuideIndex = ancestorGuideLevels.findIndex((hasNext) => hasNext);
      return (
        <tr
          key={profile.profile_id}
          ref={index === 0 ? firstRowRef : null}
          className={isSelected ? "is-selected" : ""}
          onClick={() => handleProfileSelect(profile)}
          onKeyDown={(event) => handleProfileRowKeyDown(event, profile)}
          tabIndex={0}
          role="button"
          aria-selected={isSelected}
          aria-label={`Load profile ${profile.profile_id}`}
        >
          <td className="cv-profile-tree-td">
            {!isRoot ? (
              <span className="cv-profile-tree-rail" aria-hidden="true">
                {firstContinuingGuideIndex >= 0 ? (
                  <span
                    key={`${profile.profile_id}-guide-${firstContinuingGuideIndex}`}
                    className="cv-profile-tree-guide-col"
                    style={{ left: `${(firstContinuingGuideIndex + 1) * 20 - 10}px` }}
                  />
                ) : null}
                <span
                  className={`cv-profile-tree-branch ${isLastSibling ? "is-last" : "has-next"}`}
                  style={{ left: `${depth * 20 - 10}px` }}
                />
              </span>
            ) : null}
            <div className="cv-profile-tree-cell">
              <div className="cv-profile-tree-main" style={{ paddingLeft: `${8 + depth * 20}px` }}>
                <span
                  className={`cv-profile-tree-label${isRoot ? " is-root" : ""}`}
                  title={profile.profile_id}
                >
                  {profile.profile_id}
                </span>
              </div>
            </div>
          </td>
          <td>
            <span className="cv-profile-table-text" title={profile.company || "-"}>
              {profile.company || "-"}
            </span>
          </td>
          <td>
            {profile.application_status ? (
              <span className={statusBadgeClass(profile.application_status)}>{profile.application_status}</span>
            ) : "-"}
          </td>
          <td>
            <span className="cv-profile-table-text" title={profile.job_title || "-"}>
              {profile.job_title || "-"}
            </span>
          </td>
          <td>
            <span className="cv-profile-table-text" title={profile.template_id || "awesomecv"}>
              {profile.template_id || "awesomecv"}
            </span>
          </td>
          <td>r{profile.revision ?? 0}</td>
          <td>
            <span className={`cv-text-availability ${hasCvText ? "is-available" : "is-missing"}`}>
              {hasCvText ? "Available" : "Missing"}
            </span>
          </td>
          <td>{formatDateTime(profile.updated_at || profile.created_at)}</td>
        </tr>
      );
    });
  };

  if (collapsible && entryCollapsed) {
    return (
      <div className={`cv-entry${isJobMode ? " is-job-mode" : ""}`}>
        <button
          type="button"
          className="cv-entry-header cv-entry-header-toggle"
          onClick={() => setEntryCollapsed(false)}
          aria-label="Open profile setup"
        >
          <div>
            <p className="eyebrow">{setupEyebrow}</p>
            <h3>{setupTitle}</h3>
            <p className="helper">
              {selectedProfileId
                ? `Active profile: ${selectedProfileId}`
                : "Profile setup is hidden to keep focus on preview and editing."}
            </p>
          </div>
          <span className="sub-card-toggle-indicator">
            <ChevronRight size={15} />
            <span>Open setup</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`cv-entry${isJobMode ? " is-job-mode" : ""}`}>
      {collapsible ? (
        <button
          type="button"
          className="cv-entry-header cv-entry-header-toggle"
          onClick={() => setEntryCollapsed(true)}
          aria-label="Hide profile setup"
        >
          <div>
            <p className="eyebrow">{setupEyebrow}</p>
            <h3>{setupTitle}</h3>
            <p className="helper">
              {isJobMode
                ? "Review context and tailor against this job. Profile browsing is optional and collapsed by default."
                : "Select a profile or start a new entry. Collapse this setup section to focus on preview and editing."}
            </p>
          </div>
          <span className="sub-card-toggle-indicator">
            <ChevronDown size={15} />
            <span>Hide setup</span>
          </span>
        </button>
      ) : (
        <div className="cv-entry-header">
          <div>
            <p className="eyebrow">{setupEyebrow}</p>
            <h3>{setupTitle}</h3>
            <p className="helper">
              {isJobMode
                ? "Review context and tailor against this job. Profile browsing is optional and collapsed by default."
                : "Select a profile or start a new entry directly from this table."}
            </p>
          </div>
        </div>
      )}

      <div className="cv-entry-panel">
          {profileTableCollapsedByDefault ? (
            <details
              className="cv-profile-collapsible"
              open={profileBrowserOpen}
              onToggle={(event) => setProfileBrowserOpen(event.currentTarget.open)}
            >
              <summary className="cv-profile-collapsible-summary">
                <span>Browse and switch CV profiles</span>
                <span className="sub-card-toggle-indicator">
                  {profileBrowserOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span>{profileBrowserOpen ? "Collapse" : "Expand"}</span>
                </span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <div>
                  <label htmlFor="profileSearch" className="label">Search profiles</label>
                  <div className="cv-search-row">
                    <input
                      ref={searchInputRef}
                      id="profileSearch"
                      type="text"
                      placeholder="Search by profile name, company, status, job title, description, or CV text"
                      value={profileSearchDraft}
                      onChange={(e) => setProfileSearchDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          searchButtonRef.current?.click();
                          searchButtonRef.current?.focus();
                          return;
                        }
                        if (e.key === "Tab" && !e.shiftKey) {
                          e.preventDefault();
                          searchButtonRef.current?.focus();
                        }
                      }}
                    />
                    <div className="cv-search-actions">
                      <button
                        ref={searchButtonRef}
                        type="button"
                        className="primary cv-search-button"
                        onClick={() => setProfileSearchQuery(profileSearchDraft)}
                        onKeyDown={(e) => {
                          if (e.key === "Tab" && !e.shiftKey) {
                            e.preventDefault();
                            resetButtonRef.current?.focus();
                          }
                        }}
                      >
                        <Search size={14} />
                        Search
                      </button>
                      <button
                        ref={resetButtonRef}
                        type="button"
                        className="ghost cv-reset-button"
                        onClick={() => {
                          setProfileSearchDraft("");
                          setProfileSearchQuery("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Tab" && e.shiftKey) {
                            e.preventDefault();
                            searchButtonRef.current?.focus();
                            return;
                          }
                          if (e.key === "Tab" && !e.shiftKey) {
                            e.preventDefault();
                            if (!hideCreateProfileButton) {
                              createButtonRef.current?.focus();
                            } else {
                              focusFirstRow();
                            }
                          }
                        }}
                      >
                        <RotateCcw size={14} />
                        Reset
                      </button>
                      <div className="cv-search-profile-actions">
                        {!hideCreateProfileButton ? (
                          <button
                            ref={createButtonRef}
                            type="button"
                            className="primary cv-create-button"
                            onClick={openNewEntryDialog}
                            onKeyDown={(e) => {
                              if (e.key === "Tab" && e.shiftKey) {
                                e.preventDefault();
                                resetButtonRef.current?.focus();
                                return;
                              }
                              if (e.key === "Tab" && !e.shiftKey) {
                                e.preventDefault();
                                focusFirstRow();
                              }
                            }}
                          >
                            <Plus size={14} />
                            Create new CV Profile
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="cv-profile-table-wrap">
                  <div className="cv-profile-table-wrap-inner" style={{ maxHeight: `${profileTableHeight}px` }}>
                  {renderProfileTable()}
                  </div>
                  <div
                    className="cv-profile-table-resizer"
                    role="separator"
                    aria-orientation="horizontal"
                    onMouseDown={handleTableResizeStart}
                    title="Drag to resize profile list height"
                  />
                </div>
              </div>
            </details>
          ) : (
            <>
          <div>
            <label htmlFor="profileSearch" className="label">Search profiles</label>
            <div className="cv-search-row">
              <input
                ref={searchInputRef}
                id="profileSearch"
                type="text"
                placeholder="Search by profile name, company, status, job title, description, or CV text"
                value={profileSearchDraft}
                onChange={(e) => setProfileSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab" && e.shiftKey) {
                    e.preventDefault();
                    refreshButtonRef.current?.focus();
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchButtonRef.current?.click();
                    searchButtonRef.current?.focus();
                    return;
                  }
                  if (e.key === "Tab" && !e.shiftKey) {
                    e.preventDefault();
                    searchButtonRef.current?.focus();
                  }
                }}
              />
              <div className="cv-search-actions">
                <button
                  ref={searchButtonRef}
                  type="button"
                  className="primary cv-search-button"
                  onClick={() => setProfileSearchQuery(profileSearchDraft)}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey) {
                      e.preventDefault();
                      resetButtonRef.current?.focus();
                    }
                  }}
                >
                  <Search size={14} />
                  Search
                </button>
                <button
                  ref={resetButtonRef}
                  type="button"
                  className="ghost cv-reset-button"
                  onClick={() => {
                    setProfileSearchDraft("");
                    setProfileSearchQuery("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && e.shiftKey) {
                      e.preventDefault();
                      searchButtonRef.current?.focus();
                      return;
                    }
                    if (e.key === "Tab" && !e.shiftKey) {
                      e.preventDefault();
                      if (!hideCreateProfileButton) {
                        createButtonRef.current?.focus();
                      } else {
                        focusFirstRow();
                      }
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
                <div className="cv-search-profile-actions">
                  {!hideCreateProfileButton ? (
                    <button
                      ref={createButtonRef}
                      type="button"
                      className="primary cv-create-button"
                      onClick={openNewEntryDialog}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey) {
                          e.preventDefault();
                          focusFirstRow();
                        }
                      }}
                    >
                      <Plus size={14} />
                      Create new CV Profile
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="cv-profile-table-wrap">
            <div className="cv-profile-table-wrap-inner" style={{ maxHeight: `${profileTableHeight}px` }}>
            {renderProfileTable()}
            </div>
            <div
              className="cv-profile-table-resizer"
              role="separator"
              aria-orientation="horizontal"
              onMouseDown={handleTableResizeStart}
              title="Drag to resize profile list height"
            />
          </div>
            </>
          )}

          <div className="sub-card" style={{ marginTop: 4 }}>
            <div className="sub-card-header">
              <button
                type="button"
                className="sub-card-toggle"
                onClick={() => setApplicationContextOpen((prev) => !prev)}
                aria-expanded={applicationContextOpen}
              >
                <strong>Application context</strong>
                <span className="sub-card-toggle-indicator">
                  {applicationContextOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span>{applicationContextOpen ? "Collapse" : "Expand"}</span>
                </span>
              </button>
            </div>
            {applicationContextOpen ? (
              <>
            <p className="helper">Track job details and keep CV source text here. Use it for both existing and new entries.</p>
            <div className="field-grid">
              <div>
                <label htmlFor="newProfileName" className="label">CV profile</label>
                <input
                  id="newProfileName"
                  type="text"
                  value={newProfileId || selectedProfileId || ""}
                  readOnly
                  aria-readonly="true"
                />
                {isJobMode ? (
                  <p className="helper cv-working-copy-note">
                    Working copy mode: nothing is saved until you confirm Tailor for a new profile version.
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="cvTemplateEntry" className="label">Template</label>
                <select
                  id="cvTemplateEntry"
                  value={cvTemplateId}
                  onChange={(e) => onCvTemplateIdChange(e.target.value)}
                >
                  <option value="awesomecv">AwesomeCV</option>
                  <option value="hipstercv">HipsterCV</option>
                </select>
              </div>
              <div>
                <label htmlFor="cvLanguageEntry" className="label">Output language</label>
                <select
                  id="cvLanguageEntry"
                  value={cvOutputLanguage}
                  onChange={(e) => onCvOutputLanguageChange(e.target.value)}
                >
                  <option value="english">English</option>
                  <option value="german">German</option>
                </select>
              </div>
              {cvTemplateId === "hipstercv" || cvTemplateId === "awesomecv" ? (
                <div>
                  <label htmlFor="ctxProfileImage" className="label">
                    {cvTemplateId === "hipstercv" ? "Profile image (top bar)" : "Profile image"}
                  </label>
                  <input
                    id="ctxProfileImage"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleProfileImageChange}
                    disabled={isUploadingProfileImage}
                  />
                  <p className="helper" style={{ marginTop: 6 }}>
                    {applicationContext.profile_image
                      ? `Current image: ${applicationContext.profile_image}`
                      : "No image selected yet."}
                  </p>
                  {applicationContext.profile_image ? (
                    <button
                      type="button"
                      className="ghost"
                      style={{ marginTop: 6 }}
                      onClick={() => onApplicationContextChange((prev) => ({ ...prev, profile_image: "" }))}
                    >
                      Remove profile image
                    </button>
                  ) : null}
                  {profileImageError ? <p className="error">{profileImageError}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="field-grid">
              <div>
                <label htmlFor="ctxCompany" className="label">Company</label>
                <input
                  id="ctxCompany"
                  value={applicationContext.company || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ctxDate" className="label">Application date</label>
                <input
                  id="ctxDate"
                  type="date"
                  value={applicationContext.application_date || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, application_date: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ctxJobTitle" className="label">Job title</label>
                <input
                  id="ctxJobTitle"
                  value={applicationContext.job_title || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, job_title: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ctxStatus" className="label">Application status</label>
                <select
                  id="ctxStatus"
                  className="app-status-select"
                  value={applicationContext.application_status || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, application_status: e.target.value }))}
                >
                  <option value="">Not set</option>
                  <option value="in-prep">In preparation</option>
                  <option value="applied">Applied</option>
                  <option value="invited">Invited</option>
                  <option value="interviewing">Interviewing</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="ctxJobUrl" className="label">Job URL</label>
                <input
                  id="ctxJobUrl"
                  value={applicationContext.job_url || ""}
                  placeholder="https://..."
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, job_url: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="ctxJobDescription" className="label">Job description</label>
                <textarea
                  id="ctxJobDescription"
                  rows={5}
                  value={applicationContext.job_description || ""}
                  onChange={(e) => onApplicationContextChange((prev) => ({ ...prev, job_description: e.target.value }))}
                  placeholder="Optional: paste a job description to tailor CV remapping"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="loadedProfileCvText" className="label">CV text</label>
                <textarea
                  ref={cvTextRef}
                  id="loadedProfileCvText"
                  rows={8}
                  placeholder="Paste or edit CV text for this profile"
                  value={resumeText}
                  onChange={(e) => onResumeTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey) {
                      e.preventDefault();
                      exampleButtonRef.current?.focus();
                    }
                  }}
                />
                <button
                  ref={exampleButtonRef}
                  type="button"
                  className="ghost cv-example-toggle"
                  onClick={() => setShowExampleCvText((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && e.shiftKey) {
                      e.preventDefault();
                      focusCvText();
                      return;
                    }
                    if (e.key === "Tab" && !e.shiftKey) {
                      e.preventDefault();
                      updateProfileButtonRef.current?.focus();
                    }
                  }}
                >
                  <Tag size={14} />
                  {showExampleCvText ? "Hide example CV text" : "Show example CV text"}
                </button>
                {showExampleCvText ? <pre className="example-box">{EXAMPLE_CV_TEXT}</pre> : null}
              </div>
            </div>
              </>
            ) : null}
          </div>

          <div className="cv-entry-cta-wrap">
            {isJobMode && tailorContext && !hideTailorAction ? (
              <div className="w1-tailor-context">
                <p className="w1-tailor-context-title">
                  Create an editable, job-tailored copy for {tailorContext.jobTitle || "this role"}
                  {tailorContext.company ? ` at ${tailorContext.company}` : ""}.
                </p>
                <div className="w1-tailor-context-grid">
                  <span><strong>Target job:</strong> {(tailorContext.jobTitle || "-")}{tailorContext.company ? ` · ${tailorContext.company}` : ""}</span>
                  <span><strong>Source profile:</strong> {tailorContext.sourceProfileId || "none selected"}</span>
                  <span><strong>Target profile:</strong> {tailorContext.targetProfileId || "auto-generated"}</span>
                  <span><strong>Template + language:</strong> {tailorContext.templateId || "awesomecv"} · {tailorContext.outputLanguage || "english"}</span>
                </div>
              </div>
            ) : null}
            <div className="cv-entry-actions">
              {!hideUpdateAction ? (
                <button
                  ref={updateProfileButtonRef}
                  type="button"
                  className="primary cv-action-update"
                  onClick={onUpdateProfileCvText}
                  disabled={isUpdatingProfileCvText || isLoadingProfile || !hasPersistedSelectedProfile}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && e.shiftKey) {
                      e.preventDefault();
                      exampleButtonRef.current?.focus();
                      return;
                    }
                    if (e.key === "Tab" && !e.shiftKey) {
                      e.preventDefault();
                      tailorButtonRef.current?.focus();
                    }
                  }}
                >
                  <PencilLine size={14} />
                  {isUpdatingProfileCvText ? "Updating profile..." : "Update CV profile data"}
                </button>
              ) : null}
              {!hideTailorAction ? (
                <button
                  ref={tailorButtonRef}
                  type="button"
                  className="primary cv-action-remap llm-action-button"
                  title="Use AI to tailor this CV profile from your CV text and the job details you added above."
                  onClick={openRemapDialog}
                  disabled={typeof tailorActionDisabled === "boolean"
                    ? tailorActionDisabled
                    : (isRemappingProfileCvText || isLoadingProfile || !resumeText.trim())}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && e.shiftKey) {
                      e.preventDefault();
                      if (!hideUpdateAction) {
                        updateProfileButtonRef.current?.focus();
                      } else {
                        exampleButtonRef.current?.focus();
                      }
                      return;
                    }
                    if (e.key === "Tab" && !e.shiftKey) {
                      e.preventDefault();
                      focusElementById("pdf-preview-template-select");
                    }
                  }}
                >
                  <Sparkles size={14} />
                  {isRemappingProfileCvText ? "Tailoring profile..." : "Tailor CV using CV text & job description"}
                </button>
              ) : null}
            </div>
          </div>

          {!hideTailorProgress && isRemappingProfileCvText && remapProgress ? (
            <div className="refinement-progress">
              <div className="results-loading">
                <Spinner size="sm" color="blue.500" />
                <span>Tailoring your CV for this role. This can take about a minute.</span>
              </div>
              <div className="progress-header">
                <span>CV tailoring progress</span>
                <span>
                  {remapProgress.percent}% complete
                </span>
              </div>
              <Progress.Root value={remapProgress.percent} size="sm" colorPalette="blue">
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
              <p className="helper">
                {remapProgress.elapsedSeconds}s / {remapProgress.timeoutSeconds}s elapsed
              </p>
            </div>
          ) : null}
      </div>

      {profilesError && <p className="error">{profilesError}</p>}
      {cvEntryError && <p className="error">{cvEntryError}</p>}

      {remapDialogOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="remap-name-title">
          <div className="modal-backdrop" onClick={() => setRemapDialogOpen(false)} />
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="remap-name-title">Choose a name for the new profile version</h2>
            </div>
            <p className="helper">A new tailored profile will be generated using your CV text and saved under this name.</p>
            <div>
              <label htmlFor="remapProfileName" className="label">New profile name</label>
              <input
                id="remapProfileName"
                type="text"
                value={remapProfileName}
                onChange={(e) => setRemapProfileName(e.target.value)}
              />
            </div>
            {remapTargetExists ? (
              <p className="error">This name already exists. Continuing will overwrite the existing profile and previous data cannot be recovered.</p>
            ) : null}
            <div className="inline-actions">
              <button type="button" className="secondary" onClick={() => setRemapDialogOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`secondary ${remapTargetExists ? "cv-action-danger" : "cv-action-remap"}`}
                onClick={handleConfirmRemap}
                disabled={!remapProfileName.trim()}
              >
                {remapTargetExists ? "Overwrite existing profile" : "Create new profile version"}
              </button>
            </div>
          </div>
        </div>
      )}

      {newEntryDialogOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-entry-title">
          <div className="modal-backdrop" onClick={() => setNewEntryDialogOpen(false)} />
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="new-entry-title">Create new CV Profile</h2>
            </div>
            <p className="helper">Choose a profile name to create and save a new entry immediately.</p>
            <div>
              <label htmlFor="newEntryProfileName" className="label">Profile name</label>
              <input
                id="newEntryProfileName"
                type="text"
                value={newEntryProfileName}
                onChange={(e) => {
                  setNewEntryProfileName(e.target.value);
                  if (newEntryError) setNewEntryError("");
                }}
              />
            </div>
            {newEntryError ? <p className="error">{newEntryError}</p> : null}
            <div className="inline-actions">
              <button type="button" className="secondary" onClick={() => setNewEntryDialogOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="secondary cv-action-remap"
                onClick={handleConfirmCreateEntry}
                disabled={isCreatingProfileEntry || !newEntryProfileName.trim()}
              >
                {isCreatingProfileEntry ? "Creating..." : "Create and save profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
