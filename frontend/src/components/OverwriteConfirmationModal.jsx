import { AlertTriangle, Save, X } from "lucide-react";
import { useEffect } from "react";

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
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.classList.add("modal-open");
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
            <AlertTriangle size={14} /> Destructive update
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
              {topLevelChanges.length > 0 && (
                <div className="overwrite-diff-group">
                  <h4>Profile fields</h4>
                  <div className="overwrite-diff-list">
                    {topLevelChanges.map((change) => (
                      <div className="overwrite-diff-item" key={`top-${change.key}`}>
                        <div className="overwrite-diff-item-head">
                          {renderChangeBadge("updated")}
                          <strong>{change.label}</strong>
                        </div>
                        <p><span className="overwrite-old">Before:</span> {change.oldValue}</p>
                        <p><span className="overwrite-new">After:</span> {change.newValue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sectionChanges.map((section) => (
                <div className="overwrite-diff-group" key={`section-${section.key}`}>
                  <h4>{section.label}</h4>
                  <div className="overwrite-diff-list">
                    {section.updated.map((change, index) => (
                      <div className="overwrite-diff-item" key={`${section.key}-updated-${index}`}>
                        <div className="overwrite-diff-item-head">
                          {renderChangeBadge("updated")}
                          <strong>{change.title}</strong>
                        </div>
                        <p><span className="overwrite-old">Before:</span> {change.oldValue}</p>
                        <p><span className="overwrite-new">After:</span> {change.newValue}</p>
                        {Array.isArray(change.changes) && change.changes.length > 0 && (
                          <ul className="overwrite-change-lines">
                            {change.changes.map((row, rowIndex) => (
                              <li key={`${section.key}-updated-${index}-row-${rowIndex}`}>
                                <strong>{row.field}:</strong> {row.oldValue} {"->"} {row.newValue}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    {section.added.map((entry, index) => (
                      <div className="overwrite-diff-item" key={`${section.key}-added-${index}`}>
                        <div className="overwrite-diff-item-head">
                          {renderChangeBadge("added")}
                          <strong>New entry</strong>
                        </div>
                        <p><span className="overwrite-new">After:</span> {entry.value}</p>
                        {Array.isArray(entry.details) && entry.details.length > 0 && (
                          <ul className="overwrite-change-lines">
                            {entry.details.map((row, rowIndex) => (
                              <li key={`${section.key}-added-${index}-row-${rowIndex}`}>{row}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    {section.removed.map((entry, index) => (
                      <div className="overwrite-diff-item" key={`${section.key}-removed-${index}`}>
                        <div className="overwrite-diff-item-head">
                          {renderChangeBadge("removed")}
                          <strong>Removed entry</strong>
                        </div>
                        <p><span className="overwrite-old">Before:</span> {entry.value}</p>
                        {Array.isArray(entry.details) && entry.details.length > 0 && (
                          <ul className="overwrite-change-lines">
                            {entry.details.map((row, rowIndex) => (
                              <li key={`${section.key}-removed-${index}-row-${rowIndex}`}>{row}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="overwrite-rename-panel">
          <label className="label" htmlFor="suggestedProfileId">Use a new profile name instead</label>
          <div className="overwrite-rename-actions">
            <input
              id="suggestedProfileId"
              value={suggestedProfileId}
              onChange={(event) => onSuggestedProfileIdChange(event.target.value)}
              placeholder="new-profile-name"
            />
            <button type="button" className="secondary" onClick={onSaveAsNew} disabled={isBusy || !suggestedProfileId.trim()}>
              <Save size={14} /> Save as new profile
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="overwrite-modal-actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={isBusy}>
            <X size={14} /> Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirmOverwrite} disabled={isBusy}>
            <AlertTriangle size={14} /> {isBusy ? "Saving..." : "Overwrite existing profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
