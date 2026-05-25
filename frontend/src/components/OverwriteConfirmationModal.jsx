import { AlertTriangle, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function renderChangeBadge(type) {
  if (type === "added") return <span className="overwrite-badge overwrite-badge-added">Added</span>;
  if (type === "removed") return <span className="overwrite-badge overwrite-badge-removed">Removed</span>;
  return <span className="overwrite-badge overwrite-badge-updated">Updated</span>;
}

export default function OverwriteConfirmationModal({
  isOpen,
  targetProfileId,
  existingRevision,
  existingUpdatedAt,
  totals,
  topLevelChanges,
  sectionChanges,
  suggestedProfileId,
  onSuggestedProfileIdChange,
  onConfirmOverwrite,
  onSaveAsNew,
  onCancel,
  isBusy,
  error
}) {
  const [showRenameFlow, setShowRenameFlow] = useState(false);

  const templateLayoutKeys = useMemo(
    () => new Set(["template_id", "section_order", "sidebar_section_order", "main_section_order", "enabled_sections"]),
    []
  );

  const basicProfileChanges = useMemo(
    () => topLevelChanges.filter((change) => !templateLayoutKeys.has(change.key)),
    [topLevelChanges, templateLayoutKeys]
  );

  const templateLayoutChanges = useMemo(
    () => topLevelChanges.filter((change) => templateLayoutKeys.has(change.key)),
    [topLevelChanges, templateLayoutKeys]
  );

  const totalChangeCount = totals.added + totals.removed + totals.updated;
  const templateGroupOpenDefault = templateLayoutChanges.length > 0 && totalChangeCount <= 4;

  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.classList.add("modal-open");
    setShowRenameFlow(false);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCancel?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="overwrite-title">
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal-card overwrite-modal-card">
        <div className="overwrite-modal-header">
          <div>
            <p className="eyebrow">Confirm overwrite</p>
            <h2 id="overwrite-title">Profile already exists: {targetProfileId}</h2>
            <p className="helper">
              Overwriting creates a new revision and replaces the stored data for this profile name.
              Previous values cannot be restored in the current prototype.
            </p>
          </div>
          <span className="overwrite-warning-pill">
            <AlertTriangle size={14} /> See what has changed
          </span>
        </div>

        <div className="overwrite-meta-grid">
          <div className="overwrite-meta-item">
            <span className="label">Existing revision</span>
            <strong>{existingRevision}</strong>
          </div>
          <div className="overwrite-meta-item">
            <span className="label">Last updated</span>
            <strong>{existingUpdatedAt ? new Date(existingUpdatedAt).toLocaleString() : "Unknown"}</strong>
          </div>
          <div className="overwrite-meta-item">
            <span className="label">Changes detected</span>
            <strong>{totals.updated} updated, {totals.added} added, {totals.removed} removed</strong>
          </div>
        </div>

        <div className="overwrite-diff-panel">
          <h3>What will change</h3>
          {topLevelChanges.length === 0 && sectionChanges.length === 0 ? (
            <p className="helper">No meaningful changes detected.</p>
          ) : (
            <>
              {basicProfileChanges.length > 0 && (
                <details className="overwrite-group" open>
                  <summary>
                    <span className="overwrite-group-title">Basic profile information</span>
                    <span className="overwrite-group-meta">{basicProfileChanges.length} change{basicProfileChanges.length === 1 ? "" : "s"}</span>
                  </summary>
                  <div className="overwrite-diff-list">
                    {basicProfileChanges.map((change) => (
                      <div className="overwrite-diff-item" key={`top-basic-${change.key}`}>
                        <div className="overwrite-diff-item-head">
                          {renderChangeBadge("updated")}
                          <strong>{change.label}</strong>
                        </div>
                        <div className="overwrite-compare-grid">
                          <div className="overwrite-compare-col overwrite-compare-col-before">
                            <span className="overwrite-col-label">Before</span>
                            <p>{change.oldValue}</p>
                          </div>
                          <div className="overwrite-compare-col overwrite-compare-col-after">
                            <span className="overwrite-col-label">After</span>
                            <p>{change.newValue}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {templateLayoutChanges.length > 0 && (
                <details className="overwrite-group" open={templateGroupOpenDefault}>
                  <summary>
                    <span className="overwrite-group-title">Template and layout changes</span>
                    <span className="overwrite-group-meta">{templateLayoutChanges.length} change{templateLayoutChanges.length === 1 ? "" : "s"}</span>
                  </summary>
                  <div className="overwrite-diff-list">
                    {templateLayoutChanges.map((change) => (
                      <div className="overwrite-diff-item" key={`top-template-${change.key}`}>
                        <div className="overwrite-diff-item-head">
                          {renderChangeBadge("updated")}
                          <strong>{change.label}</strong>
                        </div>
                        <div className="overwrite-compare-grid">
                          <div className="overwrite-compare-col overwrite-compare-col-before">
                            <span className="overwrite-col-label">Before</span>
                            <p>{change.oldValue}</p>
                          </div>
                          <div className="overwrite-compare-col overwrite-compare-col-after">
                            <span className="overwrite-col-label">After</span>
                            <p>{change.newValue}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {sectionChanges.length > 0 && (
                <details className="overwrite-group" open>
                  <summary>
                    <span className="overwrite-group-title">Section content changes</span>
                    <span className="overwrite-group-meta">{sectionChanges.length} section{sectionChanges.length === 1 ? "" : "s"}</span>
                  </summary>
                  <div className="overwrite-diff-group-list">
                    {sectionChanges.map((section) => {
                      const sectionCount = section.updated.length + section.added.length + section.removed.length;
                      const sectionDefaultOpen = sectionCount <= 3;
                      return (
                        <details className="overwrite-subgroup" key={`section-${section.key}`} open={sectionDefaultOpen}>
                          <summary>
                            <span className="overwrite-subgroup-title">{section.label}</span>
                            <span className="overwrite-group-meta">{sectionCount} change{sectionCount === 1 ? "" : "s"}</span>
                          </summary>
                          <div className="overwrite-diff-list">
                            <div className="overwrite-diff-item">
                              <div className="overwrite-diff-item-head">
                                <strong>Before vs After</strong>
                              </div>
                              <div className="overwrite-compare-grid overwrite-compare-grid-section">
                                <div className="overwrite-compare-col overwrite-compare-col-before">
                                  <span className="overwrite-col-label">Before</span>
                                  <ul className="overwrite-section-list">
                                    {(section.beforeRows || []).map((row, rowIndex) => (
                                      <li
                                        key={`${section.key}-before-${row.idKey}-${rowIndex}`}
                                        className={`overwrite-section-row is-${row.status || "normal"}`}
                                      >
                                        {row.text}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="overwrite-compare-col overwrite-compare-col-after">
                                  <span className="overwrite-col-label">After</span>
                                  <ul className="overwrite-section-list">
                                    {(section.afterRows || []).map((row, rowIndex) => (
                                      <li
                                        key={`${section.key}-after-${row.idKey}-${rowIndex}`}
                                        className={`overwrite-section-row is-${row.status || "normal"}`}
                                      >
                                        {row.text}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        {showRenameFlow && (
          <div className="overwrite-rename-panel">
            <label className="label" htmlFor="suggestedProfileId">Confirm new profile name</label>
            <div className="overwrite-rename-actions">
              <input
                id="suggestedProfileId"
                value={suggestedProfileId}
                onChange={(event) => onSuggestedProfileIdChange(event.target.value)}
                placeholder="new-profile-name"
              />
              <button type="button" className="overwrite-btn overwrite-btn-success" onClick={onSaveAsNew} disabled={isBusy || !suggestedProfileId.trim()}>
                <Save size={14} /> Confirm and save
              </button>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="overwrite-modal-actions">
          <button type="button" className="overwrite-btn overwrite-btn-neutral" onClick={onCancel} disabled={isBusy}>
            <X size={14} /> Cancel
          </button>
          <div className="overwrite-modal-actions-right">
            {!showRenameFlow ? (
              <button
                type="button"
                className="overwrite-btn overwrite-btn-secondary"
                onClick={() => setShowRenameFlow(true)}
                disabled={isBusy}
              >
                <Save size={14} /> Save as new profile
              </button>
            ) : (
              <button
                type="button"
                className="overwrite-btn overwrite-btn-neutral"
                onClick={() => setShowRenameFlow(false)}
                disabled={isBusy}
              >
                <X size={14} /> Back
              </button>
            )}
            <button type="button" className="overwrite-btn overwrite-btn-danger" onClick={onConfirmOverwrite} disabled={isBusy}>
              <AlertTriangle size={14} /> {isBusy ? "Saving..." : "Overwrite existing profile"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
