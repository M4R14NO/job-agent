export default function CvIdModal({
  isOpen,
  title,
  helperText,
  inputLabel = "CV id",
  inputId = "cv-id-input",
  value,
  onChange,
  onCancel,
  onConfirm,
  error,
  isBusy = false,
  confirmLabel = "Save"
}) {
  if (!isOpen) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cv-id-modal-title">
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="cv-id-modal-title">{title}</h2>
        </div>
        {helperText ? <p className="helper">{helperText}</p> : null}
        <div>
          <label htmlFor={inputId} className="label">{inputLabel}</label>
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="inline-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="secondary cv-action-remap"
            onClick={onConfirm}
            disabled={isBusy || !String(value || "").trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
