import { useMemo, useState } from "react";
import {
  deleteCvProfile,
  renderCvFromCanonical,
  saveCvProfile,
  validateCvCanonical
} from "../api/llm";

export default function CvReview({
  canonical,
  job,
  templateId,
  docType,
  model,
  lmTimeout,
  onClose
}) {
  const [profileId, setProfileId] = useState(canonical?.profile_id || "default");
  const [revision, setRevision] = useState(canonical?.revision ?? 0);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(canonical?.data || {}, null, 2));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  const schemaVersion = canonical?.schema_version || "v1";

  const parsedData = useMemo(() => {
    try {
      return JSON.parse(jsonText);
    } catch (err) {
      return null;
    }
  }, [jsonText]);

  const handleValidate = async () => {
    setError("");
    if (!parsedData) {
      setError("Invalid JSON in canonical data.");
      return;
    }
    try {
      await validateCvCanonical({ schema_version: schemaVersion, data: parsedData });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    }
  };

  const handleSave = async () => {
    setError("");
    if (!parsedData) {
      setError("Invalid JSON in canonical data.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        schema_version: schemaVersion,
        profile_id: profileId,
        revision,
        data: parsedData
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
    if (!parsedData) {
      setError("Invalid JSON in canonical data.");
      return;
    }
    if (!model) {
      setError("Select a model to render a CV.");
      return;
    }
    setIsRendering(true);
    try {
      const { blob, filename } = await renderCvFromCanonical({
        data: parsedData,
        job_title: job.title,
        company: job.company,
        job_description: job.description,
        job_url: job.job_url,
        model,
        template_id: templateId,
        doc_type: docType,
        lm_timeout: lmTimeout
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

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">CV review</p>
            <h2>Canonical CV data</h2>
            <p className="subtitle">Review and edit before rendering.</p>
          </div>
          <button className="secondary" onClick={onClose}>Close</button>
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

        <label className="label" htmlFor="canonicalJson">Canonical JSON</label>
        <textarea
          id="canonicalJson"
          className="code-area"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="secondary" onClick={handleValidate}>Validate</button>
          <button className="secondary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button className="secondary" onClick={handleDelete}>Delete</button>
          <button onClick={handleRender} disabled={isRendering}>
            {isRendering ? "Rendering..." : "Render PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
