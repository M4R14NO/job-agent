import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import {
  getCvProfile,
  deleteCvProfile,
  previewCvMapping,
  rewriteCvCanonical,
  saveCvProfile
} from "../api/llm";
import OverwriteConfirmationModal from "./OverwriteConfirmationModal";

const DEFAULT_SECTION_ORDER = [
  "summary",
  "skills",
  "languages",
  "interests",
  "experience",
  "volunteer",
  "honors",
  "certificates",
  "writing",
  "education"
];

const SECTION_LABELS = {
  summary: "Summary",
  skills: "Skills",
  languages: "Languages",
  interests: "Interests",
  experience: "Experience",
  volunteer: "Volunteer",
  honors: "Honors & Awards",
  certificates: "Certificates",
  writing: "Publications",
  education: "Education"
};

const SECTION_KEYS = Object.keys(SECTION_LABELS);

const HIPSTER_SIDEBAR_SECTION_KEYS = ["summary", "languages", "interests"];
const HIPSTER_MAIN_SECTION_KEYS = ["experience", "education", "skills", "volunteer", "writing", "certificates", "honors"];
const HIPSTER_DEFAULT_SIDEBAR_ORDER = ["summary", "languages", "interests"];
const HIPSTER_DEFAULT_MAIN_ORDER = ["experience", "education", "skills", "volunteer", "writing", "certificates", "honors"];

const PREVIEW_SECTION_TO_CANONICAL = {
  summary: "summary",
  skills: "skills",
  languages: "languages",
  interests: "interests",
  experience: "experience",
  volunteer: "volunteer",
  honors: "awards",
  certificates: "certificates",
  writing: "publications",
  writings: "publications",
  education: "education"
};

const emptyCanonical = {
  first_name: "",
  last_name: "",
  headline: "",
  summary: "",
  email: "",
  phone: "",
  location: "",
  links: [],
  experience: [],
  education: [],
  skills: [],
  projects: [],
  volunteer: [],
  certificates: [],
  publications: [],
  languages: [],
  interests: [],
  strengths: [],
  hobbies: [],
  awards: []
};

const makeId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeBullets = (bullets = [], prefix) =>
  bullets
    .filter((bullet) => bullet && typeof bullet.text === "string")
    .map((bullet) => ({
      id: bullet.id || makeId(prefix),
      text: bullet.text,
      source_id: bullet.source_id ?? null
    }));

const normalizeList = (items = [], prefix) =>
  items.map((item) => ({ ...item, id: item.id || makeId(prefix) }));

const normalizeCanonical = (data) => {
  if (!data) return { ...emptyCanonical };
  return {
    ...emptyCanonical,
    ...data,
    first_name: data.first_name || "",
    last_name: data.last_name || "",
    headline: data.headline || "",
    summary: data.summary || "",
    email: data.email || "",
    phone: data.phone || "",
    location: data.location || "",
    links: Array.isArray(data.links) ? data.links : [],
    experience: (data.experience || []).map((entry) => ({
      id: entry.id || makeId("exp"),
      title: entry.title || "",
      organization: entry.organization || "",
      location: entry.location || "",
      period: entry.period || "",
      bullets: normalizeBullets(entry.bullets, "exp_bullet")
    })),
    education: (data.education || []).map((entry) => ({
      id: entry.id || makeId("edu"),
      degree: entry.degree || "",
      institution: entry.institution || "",
      location: entry.location || "",
      period: entry.period || "",
      bullets: normalizeBullets(entry.bullets, "edu_bullet")
    })),
    skills: normalizeList(data.skills || [], "skill").map((entry) => ({
      ...entry,
      category: entry.category || "",
      items: Array.isArray(entry.items) ? entry.items : []
    })),
    volunteer: (data.volunteer || []).map((entry) => ({
      id: entry.id || makeId("vol"),
      role: entry.role || "",
      organization: entry.organization || "",
      location: entry.location || "",
      period: entry.period || "",
      bullets: normalizeBullets(entry.bullets, "vol_bullet")
    })),
    certificates: normalizeList(data.certificates || [], "cert").map((entry) => ({
      ...entry,
      title: entry.title || "",
      issuer: entry.issuer || "",
      year: entry.year || "",
      location: entry.location || ""
    })),
    publications: normalizeList(data.publications || [], "pub").map((entry) => ({
      ...entry,
      title: entry.title || "",
      venue: entry.venue || "",
      year: entry.year || "",
      notes: entry.notes || "",
      role: entry.role || ""
    })),
    languages: normalizeList(data.languages || [], "lang").map((entry) => ({
      ...entry,
      name: entry.name || "",
      level: entry.level || ""
    })),
    interests: normalizeList(data.interests || [], "int").map((entry) => ({
      ...entry,
      name: entry.name || ""
    })),
    strengths: normalizeList(data.strengths || [], "str").map((entry) => ({
      ...entry,
      name: entry.name || ""
    })),
    hobbies: normalizeList(data.hobbies || [], "hob").map((entry) => ({
      ...entry,
      name: entry.name || "",
      icon: entry.icon || null,
      icon_candidates: Array.isArray(entry.icon_candidates) ? entry.icon_candidates : []
    })),
    awards: normalizeList(data.awards || [], "award").map((entry) => ({
      ...entry,
      title: entry.title || "",
      issuer: entry.issuer || "",
      year: entry.year || "",
      location: entry.location || ""
    }))
  };
};

const normalizeSectionOrder = (order) => {
  const base = Array.isArray(order) && order.length ? order : DEFAULT_SECTION_ORDER;
  const filtered = base.filter((section) => SECTION_KEYS.includes(section));
  return filtered.length ? filtered : DEFAULT_SECTION_ORDER;
};

const normalizeSubsetOrder = (order, allowedKeys, fallback) => {
  const base = Array.isArray(order) ? order : [];
  const filtered = base.filter((section) => allowedKeys.includes(section));
  if (filtered.length) return filtered;
  return fallback.filter((section) => allowedKeys.includes(section));
};

const normalizeHipsterSectionOrders = ({
  sectionOrder,
  sidebarSectionOrder,
  mainSectionOrder
}) => {
  const normalizedSidebar = normalizeSubsetOrder(
    sidebarSectionOrder,
    HIPSTER_SIDEBAR_SECTION_KEYS,
    normalizeSubsetOrder(sectionOrder, HIPSTER_SIDEBAR_SECTION_KEYS, HIPSTER_DEFAULT_SIDEBAR_ORDER)
  );
  const normalizedMain = normalizeSubsetOrder(
    mainSectionOrder,
    HIPSTER_MAIN_SECTION_KEYS,
    normalizeSubsetOrder(sectionOrder, HIPSTER_MAIN_SECTION_KEYS, HIPSTER_DEFAULT_MAIN_ORDER)
  );
  return {
    sidebar: normalizedSidebar,
    main: normalizedMain
  };
};

const bulletsToText = (bullets) => bullets.map((bullet) => bullet.text).join("\n");

const textToBullets = (text, prefix) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ id: makeId(prefix), text: line, source_id: null }));

const splitCommaList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const mapPreviewItemToCanonical = (section, item) => {
  switch (section) {
    case "skills":
      return {
        id: item.id || makeId("skill"),
        category: item.category || "",
        items: splitCommaList(item.list)
      };
    case "languages":
      return {
        id: item.id || makeId("lang"),
        name: item.name || "",
        level: item.level || ""
      };
    case "interests":
      return {
        id: item.id || makeId("int"),
        name: item.name || ""
      };
    case "experience":
      return {
        id: item.id || makeId("exp"),
        title: item.title || "",
        organization: item.organization || "",
        location: item.location || "",
        period: item.period || "",
        bullets: textToBullets((item.details || []).join("\n"), "exp_bullet")
      };
    case "volunteer":
      return {
        id: item.id || makeId("vol"),
        role: item.role || "",
        organization: item.organization || "",
        location: item.location || "",
        period: item.period || "",
        bullets: textToBullets((item.details || []).join("\n"), "vol_bullet")
      };
    case "honors":
      return {
        id: item.id || makeId("award"),
        title: item.award || "",
        issuer: item.event || "",
        year: item.date || "",
        location: item.location || ""
      };
    case "certificates":
      return {
        id: item.id || makeId("cert"),
        title: item.title || "",
        issuer: item.organization || "",
        year: item.date || "",
        location: item.location || ""
      };
    case "writing":
    case "writings":
      return {
        id: item.id || makeId("pub"),
        title: item.title || "",
        venue: item.location || "",
        year: item.period || "",
        notes: (item.details || []).join("\n"),
        role: item.role || ""
      };
    case "education":
      return {
        id: item.id || makeId("edu"),
        degree: item.degree || "",
        institution: item.institution || "",
        location: item.location || "",
        period: item.period || "",
        bullets: textToBullets((item.details || []).join("\n"), "edu_bullet")
      };
    default:
      return item;
  }
};

const hasText = (value) => Boolean(String(value || "").trim());

const hasPreviewSectionContent = (section, items = []) => {
  if (!Array.isArray(items) || items.length === 0) return false;
  switch (section) {
    case "skills":
      return items.some((item) => hasText(item.category) || hasText(item.list));
    case "languages":
      return items.some((item) => hasText(item.name) || hasText(item.level));
    case "interests":
      return items.some((item) => hasText(item.name));
    case "experience":
      return items.some((item) =>
        hasText(item.title) ||
        hasText(item.organization) ||
        hasText(item.location) ||
        hasText(item.period) ||
        (item.details || []).some((detail) => hasText(detail))
      );
    case "volunteer":
      return items.some((item) =>
        hasText(item.role) ||
        hasText(item.organization) ||
        hasText(item.location) ||
        hasText(item.period) ||
        (item.details || []).some((detail) => hasText(detail))
      );
    case "honors":
      return items.some((item) => hasText(item.award) || hasText(item.event) || hasText(item.location) || hasText(item.date));
    case "certificates":
      return items.some((item) => hasText(item.title) || hasText(item.organization) || hasText(item.location) || hasText(item.date));
    case "writing":
    case "writings":
      return items.some((item) =>
        hasText(item.role) ||
        hasText(item.title) ||
        hasText(item.location) ||
        hasText(item.period) ||
        (item.details || []).some((detail) => hasText(detail))
      );
    case "education":
      return items.some((item) =>
        hasText(item.degree) ||
        hasText(item.institution) ||
        hasText(item.location) ||
        hasText(item.period) ||
        (item.details || []).some((detail) => hasText(detail))
      );
    default:
      return items.length > 0;
  }
};

const normalizePreviewSectionKey = (section) => (section === "writings" ? "writing" : section);

const FIELD_DIFF_CONFIG = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "headline", label: "Headline" },
  { key: "summary", label: "Summary" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" }
];

const SECTION_DIFF_CONFIG = [
  {
    key: "experience",
    label: "Experience",
    summarize: (item) => `${item.title || "Role"} @ ${item.organization || "Organization"} ${item.period ? `(${item.period})` : ""}`.trim()
  },
  {
    key: "education",
    label: "Education",
    summarize: (item) => `${item.degree || "Degree"} - ${item.institution || "Institution"} ${item.period ? `(${item.period})` : ""}`.trim()
  },
  {
    key: "skills",
    label: "Skills",
    summarize: (item) => `${item.category || "Category"}: ${(item.items || []).join(", ")}`.trim()
  },
  {
    key: "volunteer",
    label: "Volunteer",
    summarize: (item) => `${item.role || "Role"} @ ${item.organization || "Organization"} ${item.period ? `(${item.period})` : ""}`.trim()
  },
  {
    key: "certificates",
    label: "Certificates",
    summarize: (item) => `${item.title || "Certificate"} - ${item.issuer || "Issuer"} ${item.year ? `(${item.year})` : ""}`.trim()
  },
  {
    key: "publications",
    label: "Publications",
    summarize: (item) => `${item.title || "Publication"} ${item.venue ? `- ${item.venue}` : ""} ${item.year ? `(${item.year})` : ""}`.trim()
  },
  {
    key: "languages",
    label: "Languages",
    summarize: (item) => `${item.name || "Language"}${item.level ? ` - ${item.level}` : ""}`.trim()
  },
  {
    key: "interests",
    label: "Interests",
    summarize: (item) => item.name || "Interest"
  },
  {
    key: "awards",
    label: "Honors & Awards",
    summarize: (item) => `${item.title || "Award"} ${item.issuer ? `- ${item.issuer}` : ""} ${item.year ? `(${item.year})` : ""}`.trim()
  }
];

const compactText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const truncateValue = (value, max = 140) => {
  const normalized = compactText(value);
  if (!normalized) return "(empty)";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
};

const fieldLabel = (key) =>
  String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const profileValuePreview = (value) => {
  if (Array.isArray(value)) {
    if (!value.length) return "(empty)";
    return truncateValue(value.join(", "));
  }
  return truncateValue(value);
};

const stripInternalIds = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripInternalIds(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const cleaned = {};
  Object.entries(value).forEach(([key, entryValue]) => {
    if (key === "id" || key === "source_id") return;
    cleaned[key] = stripInternalIds(entryValue);
  });
  return cleaned;
};

const normalizedComparable = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizedComparable(entry));
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return compactText(value);
    return value;
  }
  const normalized = {};
  Object.entries(value).forEach(([key, entryValue]) => {
    normalized[key] = normalizedComparable(entryValue);
  });
  return normalized;
};

const itemDetails = (item) => {
  const cleaned = stripInternalIds(item);
  if (!cleaned || typeof cleaned !== "object") return [];
  return Object.entries(cleaned)
    .filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "string") return compactText(value).length > 0;
      if (typeof value === "object") return Object.keys(value).length > 0;
      return true;
    })
    .map(([key, value]) => `${fieldLabel(key)}: ${truncateValue(profileValuePreview(value), 220)}`);
};

const changedItemFields = (oldItem, newItem) => {
  const before = normalizedComparable(stripInternalIds(oldItem));
  const after = normalizedComparable(stripInternalIds(newItem));
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {})
  ]);

  const changes = [];
  allKeys.forEach((key) => {
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return;
    changes.push({
      field: fieldLabel(key),
      oldValue: truncateValue(profileValuePreview(oldValue), 220),
      newValue: truncateValue(profileValuePreview(newValue), 220)
    });
  });
  return changes;
};

const itemIdentifier = (item, index, summarize) => {
  if (item?.id) return `id:${item.id}`;
  const signature = truncateValue(summarize(item), 180);
  return `sig:${signature || index}`;
};

const buildSectionDiff = ({ key, label, summarize, oldItems = [], newItems = [] }) => {
  const existing = Array.isArray(oldItems) ? oldItems : [];
  const pending = Array.isArray(newItems) ? newItems : [];
  const oldPool = existing.map((item, index) => ({
    item,
    used: false,
    idKey: itemIdentifier(item, index, summarize),
    semanticKey: JSON.stringify(normalizedComparable(stripInternalIds(item))),
    summary: truncateValue(summarize(item))
  }));

  const added = [];
  const removed = [];
  const updated = [];

  pending.forEach((item, index) => {
    const idKey = itemIdentifier(item, index, summarize);
    const semanticKey = JSON.stringify(normalizedComparable(stripInternalIds(item)));
    const summary = truncateValue(summarize(item));

    let matched = oldPool.find((candidate) => !candidate.used && candidate.idKey === idKey);
    if (!matched) {
      matched = oldPool.find((candidate) => !candidate.used && candidate.semanticKey === semanticKey);
    }
    if (!matched) {
      matched = oldPool.find((candidate) => !candidate.used && candidate.summary === summary);
    }

    if (!matched) {
      added.push({ value: summary, details: itemDetails(item) });
      return;
    }

    matched.used = true;
    if (matched.semanticKey !== semanticKey) {
      updated.push({
        title: summary,
        oldValue: matched.summary,
        newValue: summary,
        changes: changedItemFields(matched.item, item)
      });
    }
  });

  oldPool.forEach((candidate) => {
    if (!candidate.used) {
      removed.push({ value: candidate.summary, details: itemDetails(candidate.item) });
    }
  });

  if (!added.length && !removed.length && !updated.length) {
    return null;
  }

  return { key, label, added, removed, updated };
};

const nextProfileSuggestion = (targetProfileId) => {
  const normalized = targetProfileId.trim();
  if (!normalized) return "profile-v2";
  const match = normalized.match(/^(.*?)-v(\d+)$/);
  if (match) {
    const next = Number(match[2]) + 1;
    return `${match[1]}-v${next}`;
  }
  return `${normalized}-v2`;
};

const buildOverwriteDiff = ({ existingProfile, pendingPayload, targetProfileId }) => {
  const topLevelChanges = [];
  FIELD_DIFF_CONFIG.forEach(({ key, label }) => {
    const before = existingProfile?.data?.[key];
    const after = pendingPayload?.data?.[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      topLevelChanges.push({
        key,
        label,
        oldValue: profileValuePreview(before),
        newValue: profileValuePreview(after)
      });
    }
  });

  const existingLinks = existingProfile?.data?.links || [];
  const pendingLinks = pendingPayload?.data?.links || [];
  if (JSON.stringify(existingLinks) !== JSON.stringify(pendingLinks)) {
    topLevelChanges.push({
      key: "links",
      label: "Links",
      oldValue: profileValuePreview(existingLinks),
      newValue: profileValuePreview(pendingLinks)
    });
  }

  if ((existingProfile?.template_id || "awesomecv") !== (pendingPayload?.template_id || "awesomecv")) {
    topLevelChanges.push({
      key: "template_id",
      label: "Template",
      oldValue: existingProfile?.template_id || "awesomecv",
      newValue: pendingPayload?.template_id || "awesomecv"
    });
  }

  const existingSectionOrder = existingProfile?.section_order || [];
  const pendingSectionOrder = pendingPayload?.section_order || [];
  if (JSON.stringify(existingSectionOrder) !== JSON.stringify(pendingSectionOrder)) {
    topLevelChanges.push({
      key: "section_order",
      label: "Section order",
      oldValue: profileValuePreview(existingSectionOrder),
      newValue: profileValuePreview(pendingSectionOrder)
    });
  }

  const existingSidebarOrder = existingProfile?.sidebar_section_order || [];
  const pendingSidebarOrder = pendingPayload?.sidebar_section_order || [];
  if (JSON.stringify(existingSidebarOrder) !== JSON.stringify(pendingSidebarOrder)) {
    topLevelChanges.push({
      key: "sidebar_section_order",
      label: "Sidebar section order",
      oldValue: profileValuePreview(existingSidebarOrder),
      newValue: profileValuePreview(pendingSidebarOrder)
    });
  }

  const existingMainOrder = existingProfile?.main_section_order || [];
  const pendingMainOrder = pendingPayload?.main_section_order || [];
  if (JSON.stringify(existingMainOrder) !== JSON.stringify(pendingMainOrder)) {
    topLevelChanges.push({
      key: "main_section_order",
      label: "Main section order",
      oldValue: profileValuePreview(existingMainOrder),
      newValue: profileValuePreview(pendingMainOrder)
    });
  }

  const sectionChanges = SECTION_DIFF_CONFIG
    .map((config) => buildSectionDiff({
      ...config,
      oldItems: existingProfile?.data?.[config.key] || [],
      newItems: pendingPayload?.data?.[config.key] || []
    }))
    .filter(Boolean);

  const totals = sectionChanges.reduce(
    (acc, section) => {
      acc.added += section.added.length;
      acc.removed += section.removed.length;
      acc.updated += section.updated.length;
      return acc;
    },
    { added: 0, removed: 0, updated: topLevelChanges.length }
  );

  return {
    targetProfileId,
    existingRevision: existingProfile?.revision ?? 0,
    existingUpdatedAt: existingProfile?.updated_at || null,
    topLevelChanges,
    sectionChanges,
    totals,
    hasChanges: totals.added + totals.removed + totals.updated > 0
  };
};

export default function CvReview({
  canonical,
  job,
  templateId,
  docType,
  outputLanguage,
  model,
  lmTimeout,
  onPreviewPayloadChange
}) {
  const isHipsterTemplate = templateId === "hipstercv";
  const [profileId, setProfileId] = useState(canonical?.profile_id || "default");
  const [loadedProfileId, setLoadedProfileId] = useState(canonical?.profile_id || "default");
  const [loadedRevision, setLoadedRevision] = useState(canonical?.revision ?? 0);
  const [revision, setRevision] = useState(canonical?.revision ?? 0);
  const [formData, setFormData] = useState(() => normalizeCanonical(canonical?.data));
  const [sectionOrder, setSectionOrder] = useState(() => normalizeSectionOrder(canonical?.section_order));
  const [hipsterSectionOrders, setHipsterSectionOrders] = useState(() =>
    normalizeHipsterSectionOrders({
      sectionOrder: canonical?.section_order,
      sidebarSectionOrder: canonical?.sidebar_section_order,
      mainSectionOrder: canonical?.main_section_order
    })
  );
  const [sectionLabels, setSectionLabels] = useState(() => ({ ...SECTION_LABELS }));
  const [editingLabelKey, setEditingLabelKey] = useState(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [saveProfileOpen, setSaveProfileOpen] = useState(false);
  const [hiddenPersonalFields, setHiddenPersonalFields] = useState(new Set());
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewPayload, setPreviewPayload] = useState(null);
  const [previewHash, setPreviewHash] = useState("");
  const [rewritePrompt, setRewritePrompt] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [draggedSection, setDraggedSection] = useState(null);
  const [draggedSectionZone, setDraggedSectionZone] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null); // { namespace, index }
  const [dragOverItem, setDragOverItem] = useState(null); // { namespace, index }
  const [openPreviewEditors, setOpenPreviewEditors] = useState({});
  const [hiddenSectionsOpen, setHiddenSectionsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => ({
    basics: true,
    summary: false,
    skills: false,
    languages: false,
    interests: false,
    experience: false,
    volunteer: false,
    honors: false,
    certificates: false,
    writing: false,
    education: false
  }));
  const [overwriteDialog, setOverwriteDialog] = useState({
    isOpen: false,
    diff: null,
    suggestedProfileId: "",
    pendingPayload: null,
    pendingTargetProfileId: "",
    pendingTargetRevision: 0,
    error: ""
  });
  const schemaVersion = canonical?.schema_version || "v1";
  const currentSectionOrder = isHipsterTemplate
    ? [...hipsterSectionOrders.sidebar, ...hipsterSectionOrders.main]
    : sectionOrder;
  const jobTitle = job?.title || "";
  const jobCompany = job?.company || "";
  const jobDescription = job?.description || "";
  const jobUrl = job?.job_url || "";
  const hasJobContext = Boolean(jobTitle || jobCompany || jobDescription);

  const hashString = (value) => {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 33) ^ value.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  };

  const buildPreviewHashFrom = (
    nextFormData,
    nextSectionOrder = currentSectionOrder,
    nextHipsterSectionOrders = hipsterSectionOrders
  ) =>
    hashString(
      JSON.stringify({
        data: nextFormData,
        section_order: nextSectionOrder,
        sidebar_section_order: isHipsterTemplate ? nextHipsterSectionOrders.sidebar : undefined,
        main_section_order: isHipsterTemplate ? nextHipsterSectionOrders.main : undefined,
        job_title: jobTitle,
        company: jobCompany,
        job_description: jobDescription,
        job_url: jobUrl,
        output_language: outputLanguage,
        template_id: templateId,
        doc_type: docType
      })
    );

  const buildPreviewHash = () => buildPreviewHashFrom(formData, currentSectionOrder, hipsterSectionOrders);

  useEffect(() => {
    setFormData(normalizeCanonical(canonical?.data));
    setSectionOrder(normalizeSectionOrder(canonical?.section_order));
    setHipsterSectionOrders(
      normalizeHipsterSectionOrders({
        sectionOrder: canonical?.section_order,
        sidebarSectionOrder: canonical?.sidebar_section_order,
        mainSectionOrder: canonical?.main_section_order
      })
    );
    setProfileId(canonical?.profile_id || "default");
    setLoadedProfileId(canonical?.profile_id || "default");
    setLoadedRevision(canonical?.revision ?? 0);
    setRevision(canonical?.revision ?? 0);
    setPreviewPayload(null);
    setPreviewHash("");
    setRewritePrompt("");
    setIsRewriting(false);
    setOpenPreviewEditors({});
    setSectionLabels({ ...SECTION_LABELS });
    setEditingLabelKey(null);
    setHiddenPersonalFields(new Set());
    setSaveProfileOpen(false);
  }, [canonical]);

  useEffect(() => {
    onPreviewPayloadChange?.(previewPayload);
  }, [previewPayload]);

  useEffect(() => {
    if (isPreviewing) return;
    const nextHash = buildPreviewHash();
    if (previewPayload && previewHash === nextHash) return;
    handlePreview();
  }, [
    isPreviewing,
    previewPayload,
    previewHash,
    formData,
    sectionOrder,
    hipsterSectionOrders,
    jobTitle,
    jobCompany,
    jobDescription,
    jobUrl,
    outputLanguage,
    templateId,
    docType
  ]);

  const enabledSections = useMemo(() => new Set(currentSectionOrder), [currentSectionOrder]);
  const hiddenSectionKeys = useMemo(
    () => SECTION_KEYS.filter((key) => !enabledSections.has(key)),
    [enabledSections]
  );

  const clearPreview = () => {
    setPreviewPayload(null);
    setPreviewHash("");
  };

  const applyHipsterOrders = (nextSidebar, nextMain) => {
    setHipsterSectionOrders({ sidebar: nextSidebar, main: nextMain });
    setSectionOrder([...nextSidebar, ...nextMain]);
  };

  const getHipsterZoneForSection = (key) =>
    HIPSTER_SIDEBAR_SECTION_KEYS.includes(key) ? "sidebar" : "main";

  const toggleSection = (key) => {
    if (isHipsterTemplate) {
      const zone = getHipsterZoneForSection(key);
      const source = zone === "sidebar" ? hipsterSectionOrders.sidebar : hipsterSectionOrders.main;
      const isEnabled = source.includes(key);
      const nextSidebar = [...hipsterSectionOrders.sidebar];
      const nextMain = [...hipsterSectionOrders.main];
      if (isEnabled) {
        if (zone === "sidebar") {
          applyHipsterOrders(nextSidebar.filter((section) => section !== key), nextMain);
        } else {
          applyHipsterOrders(nextSidebar, nextMain.filter((section) => section !== key));
        }
      } else if (zone === "sidebar") {
        applyHipsterOrders([...nextSidebar, key], nextMain);
      } else {
        applyHipsterOrders(nextSidebar, [...nextMain, key]);
      }
      return;
    }
    setSectionOrder((current) => {
      if (current.includes(key)) {
        return current.filter((section) => section !== key);
      }
      return [...current, key];
    });
  };

  const toggleSectionInReview = (key) => {
    if (isHipsterTemplate) {
      toggleSection(key);
      return;
    }
    setSectionOrder((current) => {
      if (current.includes(key)) {
        return current.filter((section) => section !== key);
      }
      return [...current, key];
    });
  };

  const moveSection = (key, direction) => {
    if (isHipsterTemplate) return;
    setSectionOrder((current) => {
      const index = current.indexOf(key);
      if (index < 0) return current;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const updated = [...current];
      [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
      return updated;
    });
  };

  const handleDragStart = (event, key, zone = "single") => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    setDraggedSection(key);
    setDraggedSectionZone(zone);
    setDragOverKey(null);
    setDragOverZone(null);
  };

  const handleDrop = (targetKey, zone = "single") => {
    if (isHipsterTemplate && zone === "single") {
      setDraggedSection(null);
      setDraggedSectionZone(null);
      setDragOverKey(null);
      setDragOverZone(null);
      return;
    }
    if (isHipsterTemplate && zone !== "single") {
      const source = zone === "sidebar" ? hipsterSectionOrders.sidebar : hipsterSectionOrders.main;
      if (!draggedSection || draggedSectionZone !== zone || draggedSection === targetKey) {
        setDraggedSection(null);
        setDraggedSectionZone(null);
        setDragOverKey(null);
        setDragOverZone(null);
        return;
      }
      const fromIndex = source.indexOf(draggedSection);
      const toIndex = source.indexOf(targetKey);
      if (fromIndex < 0 || toIndex < 0) {
        setDraggedSection(null);
        setDraggedSectionZone(null);
        setDragOverKey(null);
        setDragOverZone(null);
        return;
      }
      const nextZoneOrder = [...source];
      nextZoneOrder.splice(fromIndex, 1);
      nextZoneOrder.splice(toIndex, 0, draggedSection);
      if (zone === "sidebar") {
        applyHipsterOrders(nextZoneOrder, hipsterSectionOrders.main);
      } else {
        applyHipsterOrders(hipsterSectionOrders.sidebar, nextZoneOrder);
      }
      setDraggedSection(null);
      setDraggedSectionZone(null);
      setDragOverKey(null);
      setDragOverZone(null);
      return;
    }
    setSectionOrder((current) => {
      if (!draggedSection || draggedSection === targetKey) return current;
      const updated = [...current];
      const fromIndex = updated.indexOf(draggedSection);
      const toIndex = updated.indexOf(targetKey);
      if (fromIndex < 0 || toIndex < 0) return current;
      updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, draggedSection);
      return updated;
    });
    setDraggedSection(null);
    setDraggedSectionZone(null);
    setDragOverKey(null);
    setDragOverZone(null);
  };

  // ── Item-level drag & drop ──────────────────────────────────────────────────

  const movePreviewListItem = (payloadField, fromIndex, toIndex) => {
    const currentItems = previewPayload?.[payloadField] || [];
    const nextItems = [...currentItems];
    const [removed] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, removed);
    const normalizedSection = normalizePreviewSectionKey(payloadField);
    const sectionHasContent = hasPreviewSectionContent(normalizedSection, nextItems);
    setPreviewPayload((prev) => (
      prev
        ? {
            ...prev,
            [payloadField]: nextItems,
            sections: {
              ...(prev.sections || {}),
              [normalizedSection]: sectionHasContent
            }
          }
        : prev
    ));

    const canonicalField = PREVIEW_SECTION_TO_CANONICAL[normalizedSection];
    if (!canonicalField) return;
    const nextCanonicalItems = nextItems.map((item) => mapPreviewItemToCanonical(normalizedSection, item));
    const nextFormData = { ...formData, [canonicalField]: nextCanonicalItems };
    setFormData(nextFormData);
    setPreviewHash(buildPreviewHashFrom(nextFormData));
  };

  const handlePreviewItemDrop = (sectionKey, targetIndex) => {
    const ns = `preview:${sectionKey}`;
    if (!draggedItem || draggedItem.namespace !== ns || draggedItem.index === targetIndex) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }
    const payloadField = sectionKey === "writing" ? "writings" : sectionKey;
    movePreviewListItem(payloadField, draggedItem.index, targetIndex);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  // Returns className fragments for a draggable sub-card
  const getItemDragClass = (namespace, index) => {
    const isDragged = draggedItem?.namespace === namespace && draggedItem?.index === index;
    const isTarget =
      dragOverItem?.namespace === namespace &&
      dragOverItem?.index === index &&
      draggedItem?.namespace === namespace &&
      draggedItem?.index !== index;
    const dirClass = isTarget
      ? (draggedItem.index < index ? " is-drop-from-above" : " is-drop-from-below")
      : "";
    return `${isDragged ? " is-item-dragged" : ""}${dirClass}`;
  };

  // Drag events to spread onto a draggable sub-card div
  const itemDragEvents = (namespace, index, onDrop) => ({
    onDragOver: (e) => {
      if (draggedItem?.namespace !== namespace) return;
      e.preventDefault();
      setDragOverItem({ namespace, index });
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDragOverItem(null);
    },
    onDrop: (e) => {
      if (draggedItem?.namespace !== namespace) return;
      onDrop(index);
    },
  });

  // Drag handle button for items (used inside sub-card headers)
  const renderItemDragHandle = (namespace, index) => (
    <button
      type="button"
      className="drag-handle item-drag-handle"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.stopPropagation();
        setDraggedItem({ namespace, index });
        setDragOverItem(null);
      }}
      onDragEnd={() => { setDraggedItem(null); setDragOverItem(null); }}
      aria-label="Drag to reorder"
    >
      <span aria-hidden="true">⋮⋮</span>
      <span aria-hidden="true">⋮⋮</span>
    </button>
  );

  // ────────────────────────────────────────────────────────────────────────────

  const updateSectionLabel = (key, value) => {
    setSectionLabels((prev) => ({ ...prev, [key]: value }));
    setPreviewPayload((prev) => prev ? { ...prev, section_labels: { ...(prev.section_labels || {}), [key]: value } } : prev);
  };

  // Updates a canonical formData field AND the corresponding preview payload field simultaneously.
  // Does not clear the preview so changes are instantly reflected without re-generating the mapping.
  const updateBaseField = (canonicalField, previewField, value) => {
    setFormData((prev) => ({ ...prev, [canonicalField]: value }));
    if (previewField) {
      setPreviewPayload((prev) => prev ? { ...prev, [previewField]: value || null } : prev);
    }
  };

  // Updates one of github/linkedin/homepage in previewPayload only.
  // formData.links is kept in sync via the useEffect below.
  const updateLinkField = (linkKey, value) => {
    setPreviewPayload((prev) => prev ? { ...prev, [linkKey]: value || null } : prev);
  };

  // Sync formData.links from previewPayload link fields so saves use current values.
  useEffect(() => {
    if (!previewPayload) return;
    const links = [previewPayload.homepage, previewPayload.github, previewPayload.linkedin].filter(Boolean);
    setFormData((prev) => {
      const same = JSON.stringify(prev.links) === JSON.stringify(links);
      return same ? prev : { ...prev, links };
    });
  }, [previewPayload?.homepage, previewPayload?.github, previewPayload?.linkedin]);

  const updateField = (field, value) => {
    clearPreview();
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleExpandedSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderCollapsibleSection = ({
    key,
    title,
    helper,
    actions,
    content,
    dragKey,
    isEnabled = true
  }) => {
    const isOpen = expandedSections[key];
    const isDraggable = Boolean(dragKey) && isEnabled;
    const isDragged = draggedSection === dragKey;
    const isDropTarget = dragOverKey === dragKey && draggedSection && draggedSection !== dragKey;
    const sectionDropDir = isDropTarget
      ? (currentSectionOrder.indexOf(draggedSection) < currentSectionOrder.indexOf(dragKey) ? " is-drop-from-above" : " is-drop-from-below")
      : "";
    return (
      <div
        className={`section-card ${isOpen ? "is-open" : "is-collapsed"} ${isDragged ? "is-dragged" : ""} ${isDropTarget ? `is-drop-target${sectionDropDir}` : ""} ${!isEnabled ? "is-disabled" : ""}`}
        onDragOver={dragKey ? (event) => { if (!draggedSection) return; event.preventDefault(); setDragOverKey(dragKey); } : undefined}
        onDragLeave={dragKey ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverKey(null); } : undefined}
        onDrop={dragKey ? () => { handleDrop(dragKey); setDragOverKey(null); } : undefined}
      >
        <div className="section-header">
          <div className="section-heading">
            {actions}
            <div>
              <h3>{title}</h3>
              {helper ? <p className="helper">{helper}</p> : null}
            </div>
          </div>
          <div className="section-actions">
            <button
              type="button"
              className="ghost icon-button"
              onClick={() => toggleExpandedSection(key)}
            >
              <span className="icon" aria-hidden="true">
                {isOpen ? "▾" : "▸"}
              </span>
              <span>{isOpen ? "Collapse" : "Expand"}</span>
            </button>
          </div>
        </div>
        {isOpen ? <div className="section-body">{content}</div> : null}
      </div>
    );
  };

  const updateListItem = (section, index, patch) => {
    clearPreview();
    setFormData((prev) => {
      const updated = [...prev[section]];
      updated[index] = { ...updated[index], ...patch };
      return { ...prev, [section]: updated };
    });
  };

  const addListItem = (section, item) => {
    clearPreview();
    setFormData((prev) => ({ ...prev, [section]: [...prev[section], item] }));
  };

  const removeListItem = (section, index) => {
    clearPreview();
    setFormData((prev) => ({ ...prev, [section]: prev[section].filter((_, idx) => idx !== index) }));
  };

  const moveListItem = (section, index, direction) => {
    clearPreview();
    setFormData((prev) => {
      const updated = [...prev[section]];
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= updated.length) return prev;
      [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
      return { ...prev, [section]: updated };
    });
  };

  const handleSave = async () => {
    setError("");
    setOverwriteDialog((prev) => ({ ...prev, error: "" }));
    const targetProfileId = profileId.trim();
    if (!targetProfileId) {
      setError("Profile ID is required.");
      return;
    }

    const payload = {
      schema_version: schemaVersion,
      profile_id: targetProfileId,
      revision,
      template_id: templateId,
      data: formData,
      section_order: currentSectionOrder,
      sidebar_section_order: isHipsterTemplate ? hipsterSectionOrders.sidebar : undefined,
      main_section_order: isHipsterTemplate ? hipsterSectionOrders.main : undefined
    };

    setIsSaving(true);
    try {
      let existingTarget = null;
      let targetRevision = 0;
      try {
        existingTarget = await getCvProfile(targetProfileId);
        targetRevision = existingTarget?.revision ?? 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("status 404")) {
          throw err;
        }
      }

      if (existingTarget) {
        const diff = buildOverwriteDiff({
          existingProfile: existingTarget,
          pendingPayload: payload,
          targetProfileId
        });

        if (diff.hasChanges) {
          setOverwriteDialog({
            isOpen: true,
            diff,
            suggestedProfileId: nextProfileSuggestion(targetProfileId),
            pendingPayload: payload,
            pendingTargetProfileId: targetProfileId,
            pendingTargetRevision: targetRevision,
            error: ""
          });
          return;
        }
      }

      payload.revision = targetRevision;
      const saved = await saveCvProfile(targetProfileId, payload);
      setProfileId(saved.profile_id);
      setRevision(saved.revision);
      setLoadedProfileId(saved.profile_id);
      setLoadedRevision(saved.revision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const closeOverwriteDialog = () => {
    setOverwriteDialog({
      isOpen: false,
      diff: null,
      suggestedProfileId: "",
      pendingPayload: null,
      pendingTargetProfileId: "",
      pendingTargetRevision: 0,
      error: ""
    });
  };

  const handleConfirmOverwrite = async () => {
    if (!overwriteDialog.pendingPayload || !overwriteDialog.pendingTargetProfileId) return;
    setOverwriteDialog((prev) => ({ ...prev, error: "" }));
    setIsSaving(true);
    try {
      const payload = {
        ...overwriteDialog.pendingPayload,
        revision: overwriteDialog.pendingTargetRevision,
        profile_id: overwriteDialog.pendingTargetProfileId
      };
      const saved = await saveCvProfile(overwriteDialog.pendingTargetProfileId, payload);
      setProfileId(saved.profile_id);
      setRevision(saved.revision);
      setLoadedProfileId(saved.profile_id);
      setLoadedRevision(saved.revision);
      closeOverwriteDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Overwrite failed";
      setOverwriteDialog((prev) => ({ ...prev, error: message }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsNewFromDialog = async () => {
    const nextId = overwriteDialog.suggestedProfileId.trim();
    if (!nextId || !overwriteDialog.pendingPayload) {
      setOverwriteDialog((prev) => ({ ...prev, error: "Enter a new profile name." }));
      return;
    }

    setIsSaving(true);
    setOverwriteDialog((prev) => ({ ...prev, error: "" }));
    try {
      try {
        await getCvProfile(nextId);
        setOverwriteDialog((prev) => ({
          ...prev,
          error: "That profile name already exists. Choose a different one."
        }));
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("status 404")) {
          throw err;
        }
      }

      const payload = {
        ...overwriteDialog.pendingPayload,
        profile_id: nextId,
        revision: 0
      };
      const saved = await saveCvProfile(nextId, payload);
      setProfileId(saved.profile_id);
      setRevision(saved.revision);
      setLoadedProfileId(saved.profile_id);
      setLoadedRevision(saved.revision);
      closeOverwriteDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save as new profile failed";
      setOverwriteDialog((prev) => ({ ...prev, error: message }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    try {
      await deleteCvProfile(profileId);
      setRevision(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handlePreview = async ({ force = false } = {}) => {
    setError("");
    const nextHash = buildPreviewHash();
    if (!force && previewPayload && previewHash === nextHash) return;
    setIsPreviewing(true);
    try {
      const result = await previewCvMapping({
        data: formData,
        job_title: jobTitle,
        company: jobCompany,
        job_description: jobDescription,
        job_url: jobUrl,
        model,
        template_id: templateId,
        doc_type: docType,
        lm_timeout: lmTimeout,
        output_language: outputLanguage,
        section_order: currentSectionOrder,
        sidebar_section_order: isHipsterTemplate ? hipsterSectionOrders.sidebar : undefined,
        main_section_order: isHipsterTemplate ? hipsterSectionOrders.main : undefined,
        mapping_mode: "deterministic"
      });
      setPreviewPayload(result.payload ? { ...result.payload, section_labels: sectionLabels } : null);
      setPreviewHash(nextHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleRewrite = async () => {
    setError("");
    if (!model) {
      setError("Select a model to rewrite the canonical CV.");
      return;
    }
    const instructions = rewritePrompt.trim();
    if (!instructions) {
      setError("Add rewrite instructions before running the AI rewrite.");
      return;
    }
    setIsRewriting(true);
    try {
      const result = await rewriteCvCanonical({
        data: formData,
        prompt: instructions,
        job_title: jobTitle,
        company: jobCompany,
        job_description: jobDescription,
        job_url: jobUrl,
        model,
        lm_timeout: lmTimeout,
        output_language: outputLanguage
      });
      setFormData(normalizeCanonical(result.data));
      clearPreview();
      setOpenPreviewEditors({});
      setRewritePrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rewrite failed");
    } finally {
      setIsRewriting(false);
    }
  };

  const updatePreviewField = (field, value) => {
    setPreviewPayload((prev) => (
      prev
        ? {
            ...prev,
            [field]: value,
            sections: field === "summary"
              ? { ...(prev.sections || {}), summary: hasText(value) }
              : prev.sections
          }
        : prev
    ));
    if (field !== "summary") return;
    const nextFormData = { ...formData, summary: value };
    setFormData(nextFormData);
    setPreviewHash(buildPreviewHashFrom(nextFormData));
  };

  const updatePreviewListItem = (section, index, patch) => {
    const currentItems = previewPayload?.[section] || [];
    const nextItems = currentItems.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    const normalizedSection = normalizePreviewSectionKey(section);
    const sectionHasContent = hasPreviewSectionContent(normalizedSection, nextItems);
    setPreviewPayload((prev) => (
      prev
        ? {
            ...prev,
            [section]: nextItems,
            sections: {
              ...(prev.sections || {}),
              [normalizedSection]: sectionHasContent
            }
          }
        : prev
    ));

    const canonicalField = PREVIEW_SECTION_TO_CANONICAL[normalizedSection];
    if (!canonicalField) return;
    const nextCanonicalItems = nextItems.map((item) => mapPreviewItemToCanonical(normalizedSection, item));
    const nextFormData = { ...formData, [canonicalField]: nextCanonicalItems };
    setFormData(nextFormData);
    setPreviewHash(buildPreviewHashFrom(nextFormData));
  };

  const addPreviewListItem = (section, item) => {
    const currentItems = previewPayload?.[section] || [];
    const nextItems = [...currentItems, item];
    const normalizedSection = normalizePreviewSectionKey(section);
    const sectionHasContent = hasPreviewSectionContent(normalizedSection, nextItems);
    setPreviewPayload((prev) => (
      prev
        ? {
            ...prev,
            [section]: nextItems,
            sections: {
              ...(prev.sections || {}),
              [normalizedSection]: sectionHasContent
            }
          }
        : prev
    ));

    const canonicalField = PREVIEW_SECTION_TO_CANONICAL[normalizedSection];
    if (!canonicalField) return;
    const nextCanonicalItems = nextItems.map((nextItem) => mapPreviewItemToCanonical(normalizedSection, nextItem));
    const nextFormData = { ...formData, [canonicalField]: nextCanonicalItems };
    setFormData(nextFormData);
    setPreviewHash(buildPreviewHashFrom(nextFormData));
  };

  const removePreviewListItem = (section, index) => {
    const currentItems = previewPayload?.[section] || [];
    const nextItems = currentItems.filter((_, itemIndex) => itemIndex !== index);
    const normalizedSection = normalizePreviewSectionKey(section);
    const sectionHasContent = hasPreviewSectionContent(normalizedSection, nextItems);
    setPreviewPayload((prev) => (
      prev
        ? {
            ...prev,
            [section]: nextItems,
            sections: {
              ...(prev.sections || {}),
              [normalizedSection]: sectionHasContent
            }
          }
        : prev
    ));

    const canonicalField = PREVIEW_SECTION_TO_CANONICAL[normalizedSection];
    if (!canonicalField) return;
    const nextCanonicalItems = nextItems.map((nextItem) => mapPreviewItemToCanonical(normalizedSection, nextItem));
    const nextFormData = { ...formData, [canonicalField]: nextCanonicalItems };
    setFormData(nextFormData);
    setPreviewHash(buildPreviewHashFrom(nextFormData));
  };

  const renderPreviewSection = (key) => {
    if (!previewPayload) return null;
    switch (key) {
      case "summary":
        return previewPayload.summary ? <p>{previewPayload.summary}</p> : null;
      case "skills":
        return (previewPayload.skills || []).map((skill, idx) => (
          <p key={`${skill.category}-${idx}`}>
            <strong>{skill.category}:</strong> {skill.list}
          </p>
        ));
      case "languages":
        return (previewPayload.languages || []).map((lang, idx) => (
          <p key={`${lang.name}-${idx}`}>
            <strong>{lang.name}</strong> {lang.level ? `- ${lang.level}` : ""}
          </p>
        ));
      case "interests":
        return (previewPayload.interests || []).length
          ? <p>{previewPayload.interests.map((item) => item.name).filter(Boolean).join(", ")}</p>
          : null;
      case "experience":
        return (previewPayload.experience || []).map((entry, idx) => (
          <div key={`${entry.title}-${idx}`} className="preview-item">
            <strong>{entry.title}</strong> {entry.organization ? `· ${entry.organization}` : ""}
            <div className="helper">{[entry.location, entry.period].filter(Boolean).join(" | ")}</div>
            <ul>
              {(entry.details || []).filter(Boolean).map((detail, detailIdx) => (
                <li key={`${entry.title}-detail-${detailIdx}`}>{detail}</li>
              ))}
            </ul>
          </div>
        ));
      case "volunteer":
        return (previewPayload.volunteer || []).map((entry, idx) => (
          <div key={`${entry.role}-${idx}`} className="preview-item">
            <strong>{entry.role}</strong> {entry.organization ? `· ${entry.organization}` : ""}
            <div className="helper">{[entry.location, entry.period].filter(Boolean).join(" | ")}</div>
            <ul>
              {(entry.details || []).filter(Boolean).map((detail, detailIdx) => (
                <li key={`${entry.role}-detail-${detailIdx}`}>{detail}</li>
              ))}
            </ul>
          </div>
        ));
      case "honors":
        return (previewPayload.honors || []).map((honor, idx) => (
          <p key={`${honor.award}-${idx}`}>
            <strong>{honor.award}</strong> {honor.event ? `· ${honor.event}` : ""} {honor.date ? `(${honor.date})` : ""}
          </p>
        ));
      case "certificates":
        return (previewPayload.certificates || []).map((cert, idx) => (
          <p key={`${cert.title}-${idx}`}>
            <strong>{cert.title}</strong> {cert.organization ? `· ${cert.organization}` : ""} {cert.date ? `(${cert.date})` : ""}
          </p>
        ));
      case "writing":
        return (previewPayload.writings || []).map((writing, idx) => (
          <div key={`${writing.title}-${idx}`} className="preview-item">
            <strong>{writing.title}</strong> {writing.role ? `· ${writing.role}` : ""}
            <div className="helper">{[writing.location, writing.period].filter(Boolean).join(" | ")}</div>
            <ul>
              {(writing.details || []).filter(Boolean).map((detail, detailIdx) => (
                <li key={`${writing.title}-detail-${detailIdx}`}>{detail}</li>
              ))}
            </ul>
          </div>
        ));
      case "education":
        return (previewPayload.education || []).map((entry, idx) => (
          <div key={`${entry.degree}-${idx}`} className="preview-item">
            <strong>{entry.degree}</strong> {entry.institution ? `· ${entry.institution}` : ""}
            <div className="helper">{[entry.location, entry.period].filter(Boolean).join(" | ")}</div>
            <ul>
              {(entry.details || []).filter(Boolean).map((detail, detailIdx) => (
                <li key={`${entry.degree}-detail-${detailIdx}`}>{detail}</li>
              ))}
            </ul>
          </div>
        ));
      default:
        return null;
    }
  };

  const renderPreviewEditorSection = (key) => {
    if (!previewPayload) {
      return <p className="helper">Generate the mapped preview before editing.</p>;
    }

    switch (key) {
      case "summary":
        return (
          <textarea
            value={previewPayload.summary || ""}
            onChange={(event) => updatePreviewField("summary", event.target.value)}
          />
        );
      case "skills":
        return (
          <div className="preview-stack">
            {(previewPayload.skills || []).map((skill, idx) => (
              <div key={`skill-${idx}`} className={`sub-card${getItemDragClass("preview:skills", idx)}`} {...itemDragEvents("preview:skills", idx, (i) => handlePreviewItemDrop("skills", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:skills", idx)}
                    <strong>Skill {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("skills", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Category</label>
                    <input
                      value={skill.category || ""}
                      onChange={(event) => updatePreviewListItem("skills", idx, { category: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">List</label>
                    <input
                      value={skill.list || ""}
                      onChange={(event) => updatePreviewListItem("skills", idx, { list: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("skills", { category: "", list: "" })}
            >
              Add skill
            </button>
          </div>
        );
      case "languages":
        return (
          <div className="preview-stack">
            {(previewPayload.languages || []).map((lang, idx) => (
              <div key={`lang-${idx}`} className={`sub-card${getItemDragClass("preview:languages", idx)}`} {...itemDragEvents("preview:languages", idx, (i) => handlePreviewItemDrop("languages", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:languages", idx)}
                    <strong>Language {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("languages", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Name</label>
                    <input
                      value={lang.name || ""}
                      onChange={(event) => updatePreviewListItem("languages", idx, { name: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Level</label>
                    <input
                      value={lang.level || ""}
                      onChange={(event) => updatePreviewListItem("languages", idx, { level: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("languages", { name: "", level: "" })}
            >
              Add language
            </button>
          </div>
        );
      case "interests":
        return (
          <div className="preview-stack">
            {(previewPayload.interests || []).map((interest, idx) => (
              <div key={`interest-${idx}`} className={`sub-card${getItemDragClass("preview:interests", idx)}`} {...itemDragEvents("preview:interests", idx, (i) => handlePreviewItemDrop("interests", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:interests", idx)}
                    <strong>Interest {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("interests", idx)}>
                    Remove
                  </button>
                </div>
                <input
                  value={interest.name || ""}
                  onChange={(event) => updatePreviewListItem("interests", idx, { name: event.target.value })}
                />
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("interests", { name: "" })}
            >
              Add interest
            </button>
          </div>
        );
      case "experience":
        return (
          <div className="preview-stack">
            {(previewPayload.experience || []).map((entry, idx) => (
              <div key={`exp-${idx}`} className={`sub-card${getItemDragClass("preview:experience", idx)}`} {...itemDragEvents("preview:experience", idx, (i) => handlePreviewItemDrop("experience", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:experience", idx)}
                    <strong>Role {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("experience", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Title</label>
                    <input
                      value={entry.title || ""}
                      onChange={(event) => updatePreviewListItem("experience", idx, { title: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Organization</label>
                    <input
                      value={entry.organization || ""}
                      onChange={(event) => updatePreviewListItem("experience", idx, { organization: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Location</label>
                    <input
                      value={entry.location || ""}
                      onChange={(event) => updatePreviewListItem("experience", idx, { location: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Period</label>
                    <input
                      value={entry.period || ""}
                      onChange={(event) => updatePreviewListItem("experience", idx, { period: event.target.value })}
                    />
                  </div>
                </div>
                <label className="label">Details (one per line)</label>
                <textarea
                  value={(entry.details || []).join("\n")}
                  onChange={(event) =>
                    updatePreviewListItem("experience", idx, { details: event.target.value.split("\n") })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("experience", { title: "", organization: "", location: "", period: "", details: [] })}
            >
              Add experience
            </button>
          </div>
        );
      case "volunteer":
        return (
          <div className="preview-stack">
            {(previewPayload.volunteer || []).map((entry, idx) => (
              <div key={`vol-${idx}`} className={`sub-card${getItemDragClass("preview:volunteer", idx)}`} {...itemDragEvents("preview:volunteer", idx, (i) => handlePreviewItemDrop("volunteer", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:volunteer", idx)}
                    <strong>Volunteer {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("volunteer", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Role</label>
                    <input
                      value={entry.role || ""}
                      onChange={(event) => updatePreviewListItem("volunteer", idx, { role: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Organization</label>
                    <input
                      value={entry.organization || ""}
                      onChange={(event) => updatePreviewListItem("volunteer", idx, { organization: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Location</label>
                    <input
                      value={entry.location || ""}
                      onChange={(event) => updatePreviewListItem("volunteer", idx, { location: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Period</label>
                    <input
                      value={entry.period || ""}
                      onChange={(event) => updatePreviewListItem("volunteer", idx, { period: event.target.value })}
                    />
                  </div>
                </div>
                <label className="label">Details (one per line)</label>
                <textarea
                  value={(entry.details || []).join("\n")}
                  onChange={(event) =>
                    updatePreviewListItem("volunteer", idx, { details: event.target.value.split("\n") })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("volunteer", { role: "", organization: "", location: "", period: "", details: [] })}
            >
              Add volunteer
            </button>
          </div>
        );
      case "honors":
        return (
          <div className="preview-stack">
            {(previewPayload.honors || []).map((honor, idx) => (
              <div key={`honor-${idx}`} className={`sub-card${getItemDragClass("preview:honors", idx)}`} {...itemDragEvents("preview:honors", idx, (i) => handlePreviewItemDrop("honors", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:honors", idx)}
                    <strong>Honor {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("honors", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Award</label>
                    <input
                      value={honor.award || ""}
                      onChange={(event) => updatePreviewListItem("honors", idx, { award: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Event</label>
                    <input
                      value={honor.event || ""}
                      onChange={(event) => updatePreviewListItem("honors", idx, { event: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Location</label>
                    <input
                      value={honor.location || ""}
                      onChange={(event) => updatePreviewListItem("honors", idx, { location: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input
                      value={honor.date || ""}
                      onChange={(event) => updatePreviewListItem("honors", idx, { date: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("honors", { award: "", event: "", location: "", date: "" })}
            >
              Add honor
            </button>
          </div>
        );
      case "certificates":
        return (
          <div className="preview-stack">
            {(previewPayload.certificates || []).map((cert, idx) => (
              <div key={`cert-${idx}`} className={`sub-card${getItemDragClass("preview:certificates", idx)}`} {...itemDragEvents("preview:certificates", idx, (i) => handlePreviewItemDrop("certificates", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:certificates", idx)}
                    <strong>Certificate {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("certificates", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Title</label>
                    <input
                      value={cert.title || ""}
                      onChange={(event) => updatePreviewListItem("certificates", idx, { title: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Organization</label>
                    <input
                      value={cert.organization || ""}
                      onChange={(event) => updatePreviewListItem("certificates", idx, { organization: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Location</label>
                    <input
                      value={cert.location || ""}
                      onChange={(event) => updatePreviewListItem("certificates", idx, { location: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input
                      value={cert.date || ""}
                      onChange={(event) => updatePreviewListItem("certificates", idx, { date: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("certificates", { title: "", organization: "", location: "", date: "" })}
            >
              Add certificate
            </button>
          </div>
        );
      case "writing":
        return (
          <div className="preview-stack">
            {(previewPayload.writings || []).map((writing, idx) => (
              <div key={`writing-${idx}`} className={`sub-card${getItemDragClass("preview:writing", idx)}`} {...itemDragEvents("preview:writing", idx, (i) => handlePreviewItemDrop("writing", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:writing", idx)}
                    <strong>Writing {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("writings", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Role</label>
                    <input
                      value={writing.role || ""}
                      onChange={(event) => updatePreviewListItem("writings", idx, { role: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Title</label>
                    <input
                      value={writing.title || ""}
                      onChange={(event) => updatePreviewListItem("writings", idx, { title: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Location</label>
                    <input
                      value={writing.location || ""}
                      onChange={(event) => updatePreviewListItem("writings", idx, { location: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Period</label>
                    <input
                      value={writing.period || ""}
                      onChange={(event) => updatePreviewListItem("writings", idx, { period: event.target.value })}
                    />
                  </div>
                </div>
                <label className="label">Details (one per line)</label>
                <textarea
                  value={(writing.details || []).join("\n")}
                  onChange={(event) =>
                    updatePreviewListItem("writings", idx, { details: event.target.value.split("\n") })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("writings", { role: "", title: "", location: "", period: "", details: [] })}
            >
              Add writing
            </button>
          </div>
        );
      case "education":
        return (
          <div className="preview-stack">
            {(previewPayload.education || []).map((entry, idx) => (
              <div key={`edu-${idx}`} className={`sub-card${getItemDragClass("preview:education", idx)}`} {...itemDragEvents("preview:education", idx, (i) => handlePreviewItemDrop("education", i))}>
                <div className="sub-card-header">
                  <div className="sub-card-title-row">
                    {renderItemDragHandle("preview:education", idx)}
                    <strong>Education {idx + 1}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={() => removePreviewListItem("education", idx)}>
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div>
                    <label className="label">Degree</label>
                    <input
                      value={entry.degree || ""}
                      onChange={(event) => updatePreviewListItem("education", idx, { degree: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Institution</label>
                    <input
                      value={entry.institution || ""}
                      onChange={(event) => updatePreviewListItem("education", idx, { institution: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Location</label>
                    <input
                      value={entry.location || ""}
                      onChange={(event) => updatePreviewListItem("education", idx, { location: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Period</label>
                    <input
                      value={entry.period || ""}
                      onChange={(event) => updatePreviewListItem("education", idx, { period: event.target.value })}
                    />
                  </div>
                </div>
                <label className="label">Details (one per line)</label>
                <textarea
                  value={(entry.details || []).join("\n")}
                  onChange={(event) =>
                    updatePreviewListItem("education", idx, { details: event.target.value.split("\n") })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => addPreviewListItem("education", { degree: "", institution: "", location: "", period: "", details: [] })}
            >
              Add education
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const togglePreviewEditor = (key) => {
    setOpenPreviewEditors((prev) => {
      const isClosing = Boolean(prev[key]);
      if (isClosing && previewPayload) {
        // Push a fresh snapshot so parent consumers (PDF update) always see latest edits.
        onPreviewPayloadChange?.({ ...previewPayload });
      }
      return { ...prev, [key]: !prev[key] };
    });
  };

  const renderSectionActions = (key, extraActions = null) => {
    const isEnabled = enabledSections.has(key);
    const index = currentSectionOrder.indexOf(key);
    const canMoveUp = !isHipsterTemplate && isEnabled && index > 0;
    const canMoveDown = !isHipsterTemplate && isEnabled && index >= 0 && index < currentSectionOrder.length - 1;
    return (
      <div className="section-control-group">
        <div className="section-control-rail">
          <button
            type="button"
            className="drag-handle"
            draggable={isEnabled && !isHipsterTemplate}
            onDragStart={(event) => handleDragStart(event, key)}
            onDragEnd={() => {
              setDraggedSection(null);
              setDraggedSectionZone(null);
              setDragOverKey(null);
              setDragOverZone(null);
            }}
            disabled={!isEnabled || isHipsterTemplate}
            aria-label="Drag to reorder"
          >
            <span aria-hidden="true">⋮⋮</span>
            <span aria-hidden="true">⋮⋮</span>
          </button>
          <div className="arrow-stack" aria-label="Reorder">
            <button
              type="button"
              className="icon-button"
              onClick={() => moveSection(key, "up")}
              disabled={!canMoveUp || isHipsterTemplate}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => moveSection(key, "down")}
              disabled={!canMoveDown || isHipsterTemplate}
              aria-label="Move down"
            >
              ↓
            </button>
          </div>
        </div>
        <label className="checkbox small">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={() => toggleSection(key)}
          />
          <span>Enabled</span>
        </label>
        {extraActions}
      </div>
    );
  };

  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const collectCanonicalText = (key) => {
    switch (key) {
      case "summary":
        return formData.summary ? [formData.summary] : [];
      case "skills":
        return formData.skills.map((entry) => `${entry.category}: ${entry.items.join(", ")}`.trim());
      case "languages":
        return formData.languages.map((entry) => `${entry.name} ${entry.level}`.trim());
      case "interests":
        return formData.interests.map((entry) => entry.name);
      case "experience":
        return formData.experience.flatMap((entry) => entry.bullets.map((bullet) => bullet.text));
      case "volunteer":
        return formData.volunteer.flatMap((entry) => entry.bullets.map((bullet) => bullet.text));
      case "education":
        return formData.education.flatMap((entry) => entry.bullets.map((bullet) => bullet.text));
      case "honors":
        return formData.awards.map((entry) => `${entry.title} ${entry.issuer} ${entry.year}`.trim());
      case "certificates":
        return formData.certificates.map((entry) => `${entry.title} ${entry.issuer} ${entry.year}`.trim());
      case "writing":
        return formData.publications.map((entry) => `${entry.title} ${entry.notes}`.trim());
      default:
        return [];
    }
  };

  const collectPreviewText = (key) => {
    if (!previewPayload) return [];
    switch (key) {
      case "summary":
        return previewPayload.summary ? [previewPayload.summary] : [];
      case "skills":
        return (previewPayload.skills || []).map((entry) => `${entry.category}: ${entry.list}`.trim());
      case "languages":
        return (previewPayload.languages || []).map((entry) => `${entry.name} ${entry.level}`.trim());
      case "interests":
        return (previewPayload.interests || []).map((entry) => entry.name);
      case "experience":
        return (previewPayload.experience || []).flatMap((entry) => entry.details || []);
      case "volunteer":
        return (previewPayload.volunteer || []).flatMap((entry) => entry.details || []);
      case "education":
        return (previewPayload.education || []).flatMap((entry) => entry.details || []);
      case "honors":
        return (previewPayload.honors || []).map((entry) => `${entry.award} ${entry.event} ${entry.date}`.trim());
      case "certificates":
        return (previewPayload.certificates || []).map((entry) => `${entry.title} ${entry.organization} ${entry.date}`.trim());
      case "writing":
        return (previewPayload.writings || []).map((entry) => `${entry.title} ${(entry.details || []).join(" ")}`.trim());
      default:
        return [];
    }
  };

  // Helper: toggle a personal field's visibility in the CV (hidden → null in previewPayload)
  const togglePersonalField = (previewKey, restoreValue) => {
    setHiddenPersonalFields((prev) => {
      const next = new Set(prev);
      if (next.has(previewKey)) {
        next.delete(previewKey);
        setPreviewPayload((p) => p ? { ...p, [previewKey]: restoreValue || null } : p);
      } else {
        next.add(previewKey);
        setPreviewPayload((p) => p ? { ...p, [previewKey]: null } : p);
      }
      return next;
    });
  };

  // Renders a personal info field row with label, input and optional visibility toggle
  const renderPersonalField = ({ label, previewKey, canonicalField, previewFieldMap, type = "text", placeholder, canHide = false }) => {
    const isHidden = hiddenPersonalFields.has(previewKey);
    const rawValue = previewPayload ? (previewPayload[previewKey] ?? "") : (formData[canonicalField] ?? "");
    const displayValue = isHidden ? "" : rawValue;
    return (
      <div key={previewKey} className={`personal-field-row${isHidden ? " field-hidden" : ""}`}>
        <label className="label">{label}</label>
        <div className="personal-field-input-row">
          <input
            type={type}
            placeholder={isHidden ? "(hidden from CV)" : placeholder}
            value={displayValue}
            disabled={isHidden}
            onChange={(e) => {
              if (previewFieldMap) {
                updateLinkField(previewKey, e.target.value);
              } else {
                updateBaseField(canonicalField, previewKey, e.target.value);
              }
            }}
          />
          {canHide && (
            <button
              type="button"
              className={`field-visibility-btn${isHidden ? " is-hidden" : ""}`}
              title={isHidden ? "Include in CV" : "Exclude from CV"}
              onClick={() => togglePersonalField(previewKey, rawValue)}
            >
              {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          )}
        </div>
        {canHide && isHidden && (
          <p className="field-hidden-note">Not shown in CV</p>
        )}
      </div>
    );
  };

  const renderBasics = () =>
    renderCollapsibleSection({
      key: "basics",
      title: "Personal information",
      helper: "Edit the details shown in the CV header. Use the eye icon to hide optional fields.",
      content: (
        <div className="personal-fields-grid">
          {renderPersonalField({ label: "First name", previewKey: "first_name", canonicalField: "first_name" })}
          {renderPersonalField({ label: "Last name", previewKey: "last_name", canonicalField: "last_name" })}
          {renderPersonalField({ label: "Headline / Position", previewKey: "position", canonicalField: "headline" })}
          {renderPersonalField({ label: "Location", previewKey: "address", canonicalField: "location", canHide: true })}
          {renderPersonalField({ label: "Email", previewKey: "email", canonicalField: "email", type: "email", canHide: true })}
          {renderPersonalField({ label: "Phone", previewKey: "mobile", canonicalField: "phone", canHide: true })}
          {renderPersonalField({ label: "GitHub", previewKey: "github", canonicalField: "github", placeholder: "https://github.com/username", previewFieldMap: true, canHide: true })}
          {renderPersonalField({ label: "LinkedIn", previewKey: "linkedin", canonicalField: "linkedin", placeholder: "https://linkedin.com/in/username", previewFieldMap: true, canHide: true })}
          {renderPersonalField({ label: "Homepage", previewKey: "homepage", canonicalField: "homepage", placeholder: "https://yourwebsite.com", previewFieldMap: true, canHide: true })}
        </div>
      )
    });

  const renderSummary = () => {
    const isEnabled = enabledSections.has("summary");
    return renderCollapsibleSection({
      key: "summary",
      title: "Summary",
      actions: renderSectionActions("summary"),
      dragKey: "summary",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <textarea
          value={formData.summary}
          onChange={(e) => updateField("summary", e.target.value)}
          placeholder="Short professional summary"
        />
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderExperience = () => {
    const isEnabled = enabledSections.has("experience");
    return renderCollapsibleSection({
      key: "experience",
      title: "Experience",
      actions: renderSectionActions(
        "experience",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("experience", {
            id: makeId("exp"),
            title: "",
            organization: "",
            location: "",
            period: "",
            bullets: []
          })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "experience",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.experience.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Role {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("experience", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("experience", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("experience", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Title</label>
                  <input value={entry.title} onChange={(e) => updateListItem("experience", index, { title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Organization</label>
                  <input value={entry.organization} onChange={(e) => updateListItem("experience", index, { organization: e.target.value })} />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input value={entry.location} onChange={(e) => updateListItem("experience", index, { location: e.target.value })} />
                </div>
                <div>
                  <label className="label">Period</label>
                  <input value={entry.period} onChange={(e) => updateListItem("experience", index, { period: e.target.value })} />
                </div>
              </div>
              <label className="label">Highlights (one per line)</label>
              <textarea
                value={bulletsToText(entry.bullets)}
                onChange={(e) => updateListItem("experience", index, { bullets: textToBullets(e.target.value, "exp_bullet") })}
              />
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderEducation = () => {
    const isEnabled = enabledSections.has("education");
    return renderCollapsibleSection({
      key: "education",
      title: "Education",
      actions: renderSectionActions(
        "education",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("education", {
            id: makeId("edu"),
            degree: "",
            institution: "",
            location: "",
            period: "",
            bullets: []
          })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "education",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.education.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Education {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("education", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("education", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("education", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Degree</label>
                  <input value={entry.degree} onChange={(e) => updateListItem("education", index, { degree: e.target.value })} />
                </div>
                <div>
                  <label className="label">Institution</label>
                  <input value={entry.institution} onChange={(e) => updateListItem("education", index, { institution: e.target.value })} />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input value={entry.location} onChange={(e) => updateListItem("education", index, { location: e.target.value })} />
                </div>
                <div>
                  <label className="label">Period</label>
                  <input value={entry.period} onChange={(e) => updateListItem("education", index, { period: e.target.value })} />
                </div>
              </div>
              <label className="label">Details (one per line)</label>
              <textarea
                value={bulletsToText(entry.bullets)}
                onChange={(e) => updateListItem("education", index, { bullets: textToBullets(e.target.value, "edu_bullet") })}
              />
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderSkills = () => {
    const isEnabled = enabledSections.has("skills");
    return renderCollapsibleSection({
      key: "skills",
      title: "Skills",
      actions: renderSectionActions(
        "skills",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("skills", { id: makeId("skill"), category: "", items: [] })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "skills",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.skills.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Skill group {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("skills", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("skills", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("skills", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Category</label>
                  <input value={entry.category} onChange={(e) => updateListItem("skills", index, { category: e.target.value })} />
                </div>
                <div>
                  <label className="label">Items (comma separated)</label>
                  <input
                    value={entry.items.join(", ")}
                    onChange={(e) =>
                      updateListItem("skills", index, {
                        items: e.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderVolunteer = () => {
    const isEnabled = enabledSections.has("volunteer");
    return renderCollapsibleSection({
      key: "volunteer",
      title: "Volunteer",
      actions: renderSectionActions(
        "volunteer",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("volunteer", {
            id: makeId("vol"),
            role: "",
            organization: "",
            location: "",
            period: "",
            bullets: []
          })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "volunteer",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.volunteer.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Volunteer {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("volunteer", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("volunteer", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("volunteer", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Role</label>
                  <input value={entry.role} onChange={(e) => updateListItem("volunteer", index, { role: e.target.value })} />
                </div>
                <div>
                  <label className="label">Organization</label>
                  <input value={entry.organization} onChange={(e) => updateListItem("volunteer", index, { organization: e.target.value })} />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input value={entry.location} onChange={(e) => updateListItem("volunteer", index, { location: e.target.value })} />
                </div>
                <div>
                  <label className="label">Period</label>
                  <input value={entry.period} onChange={(e) => updateListItem("volunteer", index, { period: e.target.value })} />
                </div>
              </div>
              <label className="label">Highlights (one per line)</label>
              <textarea
                value={bulletsToText(entry.bullets)}
                onChange={(e) => updateListItem("volunteer", index, { bullets: textToBullets(e.target.value, "vol_bullet") })}
              />
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderLanguages = () => {
    const isEnabled = enabledSections.has("languages");
    return renderCollapsibleSection({
      key: "languages",
      title: "Languages",
      actions: renderSectionActions(
        "languages",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("languages", { id: makeId("lang"), name: "", level: "" })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "languages",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.languages.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Language {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("languages", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("languages", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("languages", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Name</label>
                  <input value={entry.name} onChange={(e) => updateListItem("languages", index, { name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Level</label>
                  <input value={entry.level} onChange={(e) => updateListItem("languages", index, { level: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderInterests = () => {
    const isEnabled = enabledSections.has("interests");
    return renderCollapsibleSection({
      key: "interests",
      title: "Interests",
      actions: renderSectionActions(
        "interests",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("interests", { id: makeId("int"), name: "" })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "interests",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.interests.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Interest {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("interests", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("interests", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("interests", index)}>Remove</button>
                </div>
              </div>
              <input value={entry.name} onChange={(e) => updateListItem("interests", index, { name: e.target.value })} />
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderHonors = () => {
    const isEnabled = enabledSections.has("honors");
    return renderCollapsibleSection({
      key: "honors",
      title: "Honors & Awards",
      actions: renderSectionActions(
        "honors",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("awards", { id: makeId("award"), title: "", issuer: "", year: "" })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "honors",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.awards.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Award {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("awards", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("awards", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("awards", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Title</label>
                  <input value={entry.title} onChange={(e) => updateListItem("awards", index, { title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Issuer</label>
                  <input value={entry.issuer} onChange={(e) => updateListItem("awards", index, { issuer: e.target.value })} />
                </div>
                <div>
                  <label className="label">Year</label>
                  <input value={entry.year} onChange={(e) => updateListItem("awards", index, { year: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderCertificates = () => {
    const isEnabled = enabledSections.has("certificates");
    return renderCollapsibleSection({
      key: "certificates",
      title: "Certificates",
      actions: renderSectionActions(
        "certificates",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("certificates", { id: makeId("cert"), title: "", issuer: "", year: "" })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "certificates",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.certificates.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Certificate {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("certificates", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("certificates", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("certificates", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Title</label>
                  <input value={entry.title} onChange={(e) => updateListItem("certificates", index, { title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Issuer</label>
                  <input value={entry.issuer} onChange={(e) => updateListItem("certificates", index, { issuer: e.target.value })} />
                </div>
                <div>
                  <label className="label">Year</label>
                  <input value={entry.year} onChange={(e) => updateListItem("certificates", index, { year: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderWriting = () => {
    const isEnabled = enabledSections.has("writing");
    return renderCollapsibleSection({
      key: "writing",
      title: "Publications",
      actions: renderSectionActions(
        "writing",
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => addListItem("publications", { id: makeId("pub"), title: "", venue: "", year: "", notes: "" })}
          disabled={!isEnabled}
        >
          <span className="icon" aria-hidden="true">＋</span>
          <span>Add</span>
        </button>
      ),
      dragKey: "writing",
      isEnabled,
      helper: isEnabled ? null : "Section disabled. Enable to edit.",
      content: isEnabled ? (
        <>
          {formData.publications.map((entry, index) => (
            <div key={entry.id} className="sub-card">
              <div className="sub-card-header">
                <strong>Publication {index + 1}</strong>
                <div className="inline-actions">
                  <button type="button" className="ghost" onClick={() => moveListItem("publications", index, "up")}>Up</button>
                  <button type="button" className="ghost" onClick={() => moveListItem("publications", index, "down")}>Down</button>
                  <button type="button" className="ghost" onClick={() => removeListItem("publications", index)}>Remove</button>
                </div>
              </div>
              <div className="field-grid">
                <div>
                  <label className="label">Title</label>
                  <input value={entry.title} onChange={(e) => updateListItem("publications", index, { title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Venue</label>
                  <input value={entry.venue} onChange={(e) => updateListItem("publications", index, { venue: e.target.value })} />
                </div>
                <div>
                  <label className="label">Year</label>
                  <input value={entry.year} onChange={(e) => updateListItem("publications", index, { year: e.target.value })} />
                </div>
              </div>
              <label className="label">Notes</label>
              <textarea value={entry.notes} onChange={(e) => updateListItem("publications", index, { notes: e.target.value })} />
            </div>
          ))}
        </>
      ) : (
        <p className="helper">Enable this section to edit the content.</p>
      )
    });
  };

  const renderSection = (key) => {
    switch (key) {
      case "summary":
        return renderSummary();
      case "skills":
        return renderSkills();
      case "languages":
        return renderLanguages();
      case "interests":
        return renderInterests();
      case "experience":
        return renderExperience();
      case "volunteer":
        return renderVolunteer();
      case "honors":
        return renderHonors();
      case "certificates":
        return renderCertificates();
      case "writing":
        return renderWriting();
      case "education":
        return renderEducation();
      default:
        return null;
    }
  };

  const renderPreviewCard = (key, zone = "single") => {
    const isCardDragged = draggedSection === key && draggedSectionZone === zone;
    const isCardTarget =
      dragOverKey === key &&
      dragOverZone === zone &&
      draggedSection &&
      draggedSection !== key &&
      draggedSectionZone === zone;
    const activeOrder = zone === "sidebar"
      ? hipsterSectionOrders.sidebar
      : zone === "main"
        ? hipsterSectionOrders.main
        : currentSectionOrder;
    const cardDropDir = isCardTarget
      ? (activeOrder.indexOf(draggedSection) < activeOrder.indexOf(key) ? " is-drop-from-above" : " is-drop-from-below")
      : "";

    return (
      <div
        key={`preview-${zone}-${key}`}
        id={`preview-card-${zone}-${key}`}
        className={`preview-card${isCardDragged ? " is-dragged" : ""}${isCardTarget ? ` is-drop-target${cardDropDir}` : ""}`}
        onDragOver={(e) => {
          if (!draggedSection || draggedSectionZone !== zone) return;
          e.preventDefault();
          setDragOverKey(key);
          setDragOverZone(zone);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverKey(null);
            setDragOverZone(null);
          }
        }}
        onDrop={() => {
          handleDrop(key, zone);
          setDragOverKey(null);
          setDragOverZone(null);
        }}
      >
        <div className="preview-card-header">
          <div className="preview-card-title">
            <button
              type="button"
              className="drag-handle"
              draggable
              onDragStart={(e) => handleDragStart(e, key, zone)}
              onDragEnd={() => {
                setDraggedSection(null);
                setDraggedSectionZone(null);
                setDragOverKey(null);
                setDragOverZone(null);
              }}
              aria-label="Drag to reorder section"
            >
              <span aria-hidden="true">⋮⋮</span>
              <span aria-hidden="true">⋮⋮</span>
            </button>
            {editingLabelKey === key ? (
              <input
                className="section-label-input"
                value={sectionLabels[key] ?? SECTION_LABELS[key]}
                autoFocus
                onChange={(e) => updateSectionLabel(key, e.target.value)}
                onBlur={() => setEditingLabelKey(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingLabelKey(null); }}
              />
            ) : (
              <button
                type="button"
                className="section-label-btn"
                title="Click to rename section"
                onClick={() => setEditingLabelKey(key)}
              >
                {sectionLabels[key] ?? SECTION_LABELS[key]}
                <Pencil size={12} className="section-label-edit-icon" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="inline-actions">
            <button type="button" className="btn-danger" onClick={() => toggleSectionInReview(key)}>
              <Trash2 size={13} /> Remove
            </button>
            <button type="button" className="secondary btn-sm" onClick={() => togglePreviewEditor(key)}>
              {openPreviewEditors[key] ? <><X size={13} /> Close</> : <><Pencil size={13} /> Edit</>}
            </button>
          </div>
        </div>
        {renderPreviewSection(key) || <p className="helper">No entries.</p>}
        {openPreviewEditors[key] && (
          <div className="preview-editor">
            {renderPreviewEditorSection(key)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="panel-card cv-editor">
      <div className="panel-header">
        <div>
          <p className="eyebrow">CV editor</p>
          <h2>Edit &amp; preview</h2>
        </div>
      </div>

      <div className="cv-step-panel">
        <div className="cv-step-content">
          {!hasJobContext && (
            <p className="helper">No job context provided. Preview will be generic.</p>
          )}

          {renderBasics()}

          <div className="sub-card">
            <div className="sub-card-header">
              <strong className="sub-card-title"><Sparkles size={15} /> Rewrite with AI (optional)</strong>
              <button
                type="button"
                className="ghost icon-button"
                onClick={() => setRewriteOpen((prev) => !prev)}
                aria-expanded={rewriteOpen}
              >
                {rewriteOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span>{rewriteOpen ? "Collapse" : "Expand"}</span>
              </button>
            </div>
            {rewriteOpen && (
              <>
                <p className="helper">
                  Add guidance to adjust wording across all sections, then rewrite using AI.
                </p>
                <textarea
                  rows={4}
                  placeholder="Example: Emphasize impact metrics and leadership. Keep bullets concise."
                  value={rewritePrompt}
                  onChange={(event) => setRewritePrompt(event.target.value)}
                />
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleRewrite}
                    disabled={isRewriting}
                  >
                    <Sparkles size={14} />
                    {isRewriting ? "Rewriting..." : "Rewrite with AI"}
                  </button>
                  <span className="helper">This updates all sections and refreshes the preview.</span>
                </div>
              </>
            )}
          </div>
          {previewPayload ? (
            <>
              <div className={`preview-grid${isHipsterTemplate ? " is-split" : ""}`}>
                {isHipsterTemplate ? (
                  <>
                    <div className="preview-column">
                      <h4 className="preview-column-title">Sidebar</h4>
                      {hipsterSectionOrders.sidebar
                        .filter((key) => enabledSections.has(key))
                        .map((key) => renderPreviewCard(key, "sidebar"))}
                    </div>
                    <div className="preview-column">
                      <h4 className="preview-column-title">Main content</h4>
                      {hipsterSectionOrders.main
                        .filter((key) => enabledSections.has(key))
                        .map((key) => renderPreviewCard(key, "main"))}
                    </div>
                  </>
                ) : (
                  currentSectionOrder
                    .filter((key) => enabledSections.has(key))
                    .map((key) => renderPreviewCard(key, "single"))
                )}
              </div>
              {hiddenSectionKeys.length > 0 && (
                <div className="hidden-sections">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setHiddenSectionsOpen((prev) => !prev)}
                  >
                    {hiddenSectionsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {hiddenSectionsOpen ? "Hide" : "Show"} available sections ({hiddenSectionKeys.length})
                  </button>
                  {hiddenSectionsOpen && (
                    <div className="hidden-sections-list">
                      {hiddenSectionKeys.map((key) => (
                        <div key={`review-hidden-${key}`} className="hidden-section-item">
                          <span>{sectionLabels[key] ?? SECTION_LABELS[key]}</span>
                          <button type="button" className="secondary btn-sm" onClick={() => toggleSectionInReview(key)}>
                            <Plus size={13} /> Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="helper">Generating the preview. This can take a moment.</p>
          )}

          {/* Save profile — collapsible, at bottom of edit panel */}
          <div className="sub-card save-profile-card">
            <div className="sub-card-header">
              <strong className="sub-card-title"><Save size={15} /> Save profile (optional)</strong>
              <button
                type="button"
                className="ghost icon-button"
                onClick={() => setSaveProfileOpen((prev) => !prev)}
                aria-expanded={saveProfileOpen}
              >
                {saveProfileOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span>{saveProfileOpen ? "Collapse" : "Expand"}</span>
              </button>
            </div>
            {saveProfileOpen && (
              <>
                <p className="helper">
                  Save your current CV data under a profile ID so you can reload it later from the home screen.
                  The profile stores all sections and personal information — it does not save the rendered PDF.
                </p>
                <div className="cv-profile-id">
                  <label className="label" htmlFor="profileId">Profile ID</label>
                  <input
                    id="profileId"
                    value={profileId}
                    placeholder="e.g. default, software-engineer-2025"
                    onChange={(e) => {
                      const nextProfileId = e.target.value;
                      setProfileId(nextProfileId);
                      if (nextProfileId.trim() === loadedProfileId.trim()) {
                        setRevision(loadedRevision);
                      } else {
                        setRevision(0);
                      }
                    }}
                  />
                </div>
                <div className="inline-actions" style={{ marginTop: 8 }}>
                  <button className="secondary" onClick={handleSave} disabled={isSaving}>
                    <Save size={14} />
                    {isSaving ? "Saving..." : "Save profile"}
                  </button>
                  <button className="btn-danger" onClick={handleDelete}>
                    <Trash2 size={13} /> Delete profile
                  </button>
                </div>
                {revision > 0 && (
                  <p className="helper save-revision-note">
                    <Check size={13} /> Last saved revision: {revision}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <OverwriteConfirmationModal
        isOpen={overwriteDialog.isOpen}
        targetProfileId={overwriteDialog.pendingTargetProfileId}
        existingRevision={overwriteDialog.diff?.existingRevision ?? 0}
        existingUpdatedAt={overwriteDialog.diff?.existingUpdatedAt}
        totals={overwriteDialog.diff?.totals || { added: 0, removed: 0, updated: 0 }}
        topLevelChanges={overwriteDialog.diff?.topLevelChanges || []}
        sectionChanges={overwriteDialog.diff?.sectionChanges || []}
        suggestedProfileId={overwriteDialog.suggestedProfileId}
        onSuggestedProfileIdChange={(value) => setOverwriteDialog((prev) => ({ ...prev, suggestedProfileId: value }))}
        onConfirmOverwrite={handleConfirmOverwrite}
        onSaveAsNew={handleSaveAsNewFromDialog}
        onCancel={closeOverwriteDialog}
        isBusy={isSaving}
        error={overwriteDialog.error}
      />
    </div>
  );
}
