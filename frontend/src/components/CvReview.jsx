import { useEffect, useMemo, useState } from "react";
import {
  deleteCvProfile,
  previewCvMapping,
  renderCvFromTemplate,
  saveCvProfile,
  validateCvCanonical
} from "../api/llm";

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
      year: entry.year || ""
    })),
    publications: normalizeList(data.publications || [], "pub").map((entry) => ({
      ...entry,
      title: entry.title || "",
      venue: entry.venue || "",
      year: entry.year || "",
      notes: entry.notes || ""
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
    awards: normalizeList(data.awards || [], "award").map((entry) => ({
      ...entry,
      title: entry.title || "",
      issuer: entry.issuer || "",
      year: entry.year || ""
    }))
  };
};

const normalizeSectionOrder = (order) => {
  const base = Array.isArray(order) && order.length ? order : DEFAULT_SECTION_ORDER;
  const filtered = base.filter((section) => SECTION_KEYS.includes(section));
  return filtered.length ? filtered : DEFAULT_SECTION_ORDER;
};

const bulletsToText = (bullets) => bullets.map((bullet) => bullet.text).join("\n");

const textToBullets = (text, prefix) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ id: makeId(prefix), text: line, source_id: null }));

export default function CvReview({
  canonical,
  job,
  templateId,
  docType,
  outputLanguage,
  model,
  lmTimeout
}) {
  const [profileId, setProfileId] = useState(canonical?.profile_id || "default");
  const [revision, setRevision] = useState(canonical?.revision ?? 0);
  const [formData, setFormData] = useState(() => normalizeCanonical(canonical?.data));
  const [sectionOrder, setSectionOrder] = useState(() => normalizeSectionOrder(canonical?.section_order));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewPayload, setPreviewPayload] = useState(null);
  const [draggedSection, setDraggedSection] = useState(null);
  const [expandedSections, setExpandedSections] = useState(() => ({
    basics: true,
    order: true,
    summary: false,
    skills: false,
    languages: false,
    interests: false,
    experience: false,
    volunteer: false,
    honors: false,
    certificates: false,
    writing: false,
    education: false,
    preview: true,
    previewEditor: false
  }));

  const schemaVersion = canonical?.schema_version || "v1";

  useEffect(() => {
    setFormData(normalizeCanonical(canonical?.data));
    setSectionOrder(normalizeSectionOrder(canonical?.section_order));
    setProfileId(canonical?.profile_id || "default");
    setRevision(canonical?.revision ?? 0);
    setPreviewPayload(null);
  }, [canonical]);

  const enabledSections = useMemo(() => new Set(sectionOrder), [sectionOrder]);

  const toggleSection = (key) => {
    setPreviewPayload(null);
    setSectionOrder((current) => {
      if (current.includes(key)) {
        return current.filter((section) => section !== key);
      }
      return [...current, key];
    });
  };

  const moveSection = (key, direction) => {
    setPreviewPayload(null);
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

  const handleDragStart = (event, key) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    setDraggedSection(key);
  };

  const handleDrop = (targetKey) => {
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
    setPreviewPayload(null);
  };

  const updateField = (field, value) => {
    setPreviewPayload(null);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleExpandedSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderCollapsibleSection = ({ key, title, helper, actions, content }) => {
    const isOpen = expandedSections[key];
    return (
      <div className={`section-card ${isOpen ? "is-open" : "is-collapsed"}`}>
        <div className="section-header">
          <div className="section-heading">
            <h3>{title}</h3>
            {helper ? <p className="helper">{helper}</p> : null}
          </div>
          <div className="section-actions">
            {actions}
            <button type="button" className="ghost" onClick={() => toggleExpandedSection(key)}>
              {isOpen ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
        {isOpen ? <div className="section-body">{content}</div> : null}
      </div>
    );
  };

  const updateListItem = (section, index, patch) => {
    setPreviewPayload(null);
    setFormData((prev) => {
      const updated = [...prev[section]];
      updated[index] = { ...updated[index], ...patch };
      return { ...prev, [section]: updated };
    });
  };

  const addListItem = (section, item) => {
    setPreviewPayload(null);
    setFormData((prev) => ({ ...prev, [section]: [...prev[section], item] }));
  };

  const removeListItem = (section, index) => {
    setPreviewPayload(null);
    setFormData((prev) => ({ ...prev, [section]: prev[section].filter((_, idx) => idx !== index) }));
  };

  const moveListItem = (section, index, direction) => {
    setPreviewPayload(null);
    setFormData((prev) => {
      const updated = [...prev[section]];
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= updated.length) return prev;
      [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
      return { ...prev, [section]: updated };
    });
  };

  const handleValidate = async () => {
    setError("");
    try {
      await validateCvCanonical({ schema_version: schemaVersion, data: formData });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    }
  };

  const handleSave = async () => {
    setError("");
    setIsSaving(true);
    try {
      const payload = {
        schema_version: schemaVersion,
        profile_id: profileId,
        revision,
        data: formData,
        section_order: sectionOrder
      };
      const saved = await saveCvProfile(profileId, payload);
      setRevision(saved.revision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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

  const handleRender = async () => {
    setError("");
    if (!model) {
      setError("Select a model to render a CV.");
      return;
    }
    if (!previewPayload) {
      setError("Preview the mapped CV data before rendering.");
      return;
    }
    setIsRendering(true);
    try {
      const { blob, filename } = await renderCvFromTemplate({
        payload: previewPayload,
        doc_type: docType
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed");
    } finally {
      setIsRendering(false);
    }
  };

  const handlePreview = async () => {
    setError("");
    if (!model) {
      setError("Select a model to preview the CV mapping.");
      return;
    }
    setIsPreviewing(true);
    try {
      const result = await previewCvMapping({
        data: formData,
        job_title: job.title,
        company: job.company,
        job_description: job.description,
        job_url: job.job_url,
        model,
        template_id: templateId,
        doc_type: docType,
        lm_timeout: lmTimeout,
        output_language: outputLanguage,
        section_order: sectionOrder
      });
      setPreviewPayload(result.payload || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  const updatePreviewField = (field, value) => {
    setPreviewPayload((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updatePreviewListItem = (section, index, patch) => {
    setPreviewPayload((prev) => {
      if (!prev) return prev;
      const updated = [...(prev[section] || [])];
      updated[index] = { ...updated[index], ...patch };
      return { ...prev, [section]: updated };
    });
  };

  const addPreviewListItem = (section, item) => {
    setPreviewPayload((prev) => {
      if (!prev) return prev;
      return { ...prev, [section]: [...(prev[section] || []), item] };
    });
  };

  const removePreviewListItem = (section, index) => {
    setPreviewPayload((prev) => {
      if (!prev) return prev;
      return { ...prev, [section]: (prev[section] || []).filter((_, idx) => idx !== index) };
    });
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
              {(entry.details || []).map((detail, detailIdx) => (
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
              {(entry.details || []).map((detail, detailIdx) => (
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
              {(writing.details || []).map((detail, detailIdx) => (
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
              {(entry.details || []).map((detail, detailIdx) => (
                <li key={`${entry.degree}-detail-${detailIdx}`}>{detail}</li>
              ))}
            </ul>
          </div>
        ));
      default:
        return null;
    }
  };

  const renderPreviewEditor = () => {
    if (!previewPayload) {
      return <p className="helper">Generate the mapped preview before editing.</p>;
    }

    return (
      <div className="preview-grid">
        {sectionOrder
          .filter((key) => enabledSections.has(key))
          .map((key) => (
            <div key={`edit-${key}`} className="preview-card">
              <h4>{SECTION_LABELS[key]}</h4>
              {key === "summary" && (
                <textarea
                  value={previewPayload.summary || ""}
                  onChange={(event) => updatePreviewField("summary", event.target.value)}
                />
              )}
              {key === "skills" && (
                <div className="preview-stack">
                  {(previewPayload.skills || []).map((skill, idx) => (
                    <div key={`skill-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Skill {idx + 1}</strong>
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
              )}
              {key === "languages" && (
                <div className="preview-stack">
                  {(previewPayload.languages || []).map((lang, idx) => (
                    <div key={`lang-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Language {idx + 1}</strong>
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
              )}
              {key === "interests" && (
                <div className="preview-stack">
                  {(previewPayload.interests || []).map((interest, idx) => (
                    <div key={`interest-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Interest {idx + 1}</strong>
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
              )}
              {key === "experience" && (
                <div className="preview-stack">
                  {(previewPayload.experience || []).map((entry, idx) => (
                    <div key={`exp-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Role {idx + 1}</strong>
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
                          updatePreviewListItem("experience", idx, { details: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })
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
              )}
              {key === "volunteer" && (
                <div className="preview-stack">
                  {(previewPayload.volunteer || []).map((entry, idx) => (
                    <div key={`vol-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Volunteer {idx + 1}</strong>
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
                          updatePreviewListItem("volunteer", idx, { details: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })
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
              )}
              {key === "honors" && (
                <div className="preview-stack">
                  {(previewPayload.honors || []).map((honor, idx) => (
                    <div key={`honor-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Honor {idx + 1}</strong>
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
              )}
              {key === "certificates" && (
                <div className="preview-stack">
                  {(previewPayload.certificates || []).map((cert, idx) => (
                    <div key={`cert-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Certificate {idx + 1}</strong>
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
              )}
              {key === "writing" && (
                <div className="preview-stack">
                  {(previewPayload.writings || []).map((writing, idx) => (
                    <div key={`writing-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Writing {idx + 1}</strong>
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
                          updatePreviewListItem("writings", idx, { details: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })
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
              )}
              {key === "education" && (
                <div className="preview-stack">
                  {(previewPayload.education || []).map((entry, idx) => (
                    <div key={`edu-${idx}`} className="sub-card">
                      <div className="sub-card-header">
                        <strong>Education {idx + 1}</strong>
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
                          updatePreviewListItem("education", idx, { details: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })
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
              )}
            </div>
          ))}
      </div>
    );
  };

  const renderSectionOrder = () =>
    renderCollapsibleSection({
      key: "order",
      title: "Section order",
      helper: "Toggle sections and adjust their order (drag or use arrows).",
      content: (
        <div className="order-list">
          {SECTION_KEYS.map((key) => (
            <div
              key={key}
              className="order-item"
              draggable
              onDragStart={(event) => handleDragStart(event, key)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(key)}
            >
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={enabledSections.has(key)}
                  onChange={() => toggleSection(key)}
                />
                <span>{SECTION_LABELS[key]}</span>
              </label>
              <div className="order-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => moveSection(key, "up")}
                  disabled={!enabledSections.has(key)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => moveSection(key, "down")}
                  disabled={!enabledSections.has(key)}
                >
                  Down
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    });

  const renderBasics = () =>
    renderCollapsibleSection({
      key: "basics",
      title: "Basics",
      helper: "Personal details used in the header.",
      content: (
        <>
          <div className="field-grid">
            <div>
              <label className="label">First name</label>
              <input value={formData.first_name} onChange={(e) => updateField("first_name", e.target.value)} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input value={formData.last_name} onChange={(e) => updateField("last_name", e.target.value)} />
            </div>
            <div>
              <label className="label">Headline</label>
              <input value={formData.headline} onChange={(e) => updateField("headline", e.target.value)} />
            </div>
            <div>
              <label className="label">Location</label>
              <input value={formData.location} onChange={(e) => updateField("location", e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={formData.email} onChange={(e) => updateField("email", e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Links (comma separated)</label>
            <input
              value={formData.links.join(", ")}
              onChange={(e) => updateField("links", e.target.value.split(",").map((item) => item.trim()).filter(Boolean))}
            />
          </div>
        </>
      )
    });

  const renderSummary = () =>
    renderCollapsibleSection({
      key: "summary",
      title: "Summary",
      content: (
        <textarea
          value={formData.summary}
          onChange={(e) => updateField("summary", e.target.value)}
          placeholder="Short professional summary"
        />
      )
    });

  const renderExperience = () =>
    renderCollapsibleSection({
      key: "experience",
      title: "Experience",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("experience", {
            id: makeId("exp"),
            title: "",
            organization: "",
            location: "",
            period: "",
            bullets: []
          })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderEducation = () =>
    renderCollapsibleSection({
      key: "education",
      title: "Education",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("education", {
            id: makeId("edu"),
            degree: "",
            institution: "",
            location: "",
            period: "",
            bullets: []
          })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderSkills = () =>
    renderCollapsibleSection({
      key: "skills",
      title: "Skills",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("skills", { id: makeId("skill"), category: "", items: [] })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderVolunteer = () =>
    renderCollapsibleSection({
      key: "volunteer",
      title: "Volunteer",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("volunteer", {
            id: makeId("vol"),
            role: "",
            organization: "",
            location: "",
            period: "",
            bullets: []
          })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderLanguages = () =>
    renderCollapsibleSection({
      key: "languages",
      title: "Languages",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("languages", { id: makeId("lang"), name: "", level: "" })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderInterests = () =>
    renderCollapsibleSection({
      key: "interests",
      title: "Interests",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("interests", { id: makeId("int"), name: "" })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderHonors = () =>
    renderCollapsibleSection({
      key: "honors",
      title: "Honors & Awards",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("awards", { id: makeId("award"), title: "", issuer: "", year: "" })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderCertificates = () =>
    renderCollapsibleSection({
      key: "certificates",
      title: "Certificates",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("certificates", { id: makeId("cert"), title: "", issuer: "", year: "" })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

  const renderWriting = () =>
    renderCollapsibleSection({
      key: "writing",
      title: "Publications",
      actions: (
        <button
          type="button"
          className="ghost"
          onClick={() => addListItem("publications", { id: makeId("pub"), title: "", venue: "", year: "", notes: "" })}
        >
          Add
        </button>
      ),
      content: (
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
      )
    });

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

  const canRender = Boolean(previewPayload);

  return (
    <div className="panel-card cv-editor">
      <div className="panel-header">
        <div>
          <p className="eyebrow">CV review</p>
          <h2>CV editor</h2>
          <p className="subtitle">Edit sections and set the final order.</p>
        </div>
      </div>

      <div className="field-grid">
        <div>
          <label className="label" htmlFor="profileId">Profile ID</label>
          <input
            id="profileId"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="revision">Revision</label>
          <input id="revision" value={revision} readOnly />
        </div>
      </div>

      {renderBasics()}
      {renderSectionOrder()}
      {sectionOrder.filter((key) => enabledSections.has(key)).map((key) => (
        <div key={key}>{renderSection(key)}</div>
      ))}

      {renderCollapsibleSection({
        key: "preview",
        title: "Mapped CV preview",
        helper: "Preview uses the selected model to map your CV to the template.",
        actions: (
          <button type="button" className="ghost" onClick={handlePreview} disabled={isPreviewing}>
            {isPreviewing ? "Mapping..." : "Preview mapping (LLM call)"}
          </button>
        ),
        content: previewPayload ? (
          <div className="preview-grid">
            {sectionOrder
              .filter((key) => enabledSections.has(key))
              .map((key) => (
                <div key={key} className="preview-card">
                  <h4>{SECTION_LABELS[key]}</h4>
                  {renderPreviewSection(key) || <p className="helper">No entries.</p>}
                </div>
              ))}
          </div>
        ) : (
          <p className="helper">Generate the mapped preview before rendering the PDF.</p>
        )
      })}

      {renderCollapsibleSection({
        key: "previewEditor",
        title: "Adjust mapped values",
        helper: "Edit the mapped payload before rendering. You can re-render after adjusting.",
        content: renderPreviewEditor()
      })}

      {error && <p className="error">{error}</p>}

      <div className="panel-actions">
        <button className="secondary" onClick={handleValidate}>Validate</button>
        <button className="secondary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button className="secondary" onClick={handleDelete}>Delete</button>
        <button onClick={handleRender} disabled={!canRender || isRendering}>
          {isRendering ? "Rendering..." : "Render PDF"}
        </button>
        {!canRender ? <p className="helper">Run preview before rendering a PDF.</p> : null}
      </div>
    </div>
  );
}
