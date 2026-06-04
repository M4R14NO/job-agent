const TEMPLATE_OPTIONS = [
  {
    id: "awesomecv",
    title: "AwesomeCV",
    description: "Clean, traditional layout with strong section hierarchy.",
    accent: "#C0392B"
  },
  {
    id: "hipstercv",
    title: "HipsterCV",
    description: "Modern split layout with sidebar highlights.",
    accent: "#496E8C"
  }
];

export default function TemplateStep({ cvTemplateId, onCvTemplateIdChange, hasDraft }) {
  return (
    <div className="cv-step-content">
      {hasDraft ? (
        <div className="cv-step-note">
          You already generated a draft. Change the template and regenerate to update the CV.
        </div>
      ) : null}
      <div className="cv-template-grid">
        {TEMPLATE_OPTIONS.map((option) => {
          const isSelected = cvTemplateId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`cv-template-card${isSelected ? " is-selected" : ""}`}
              onClick={() => onCvTemplateIdChange(option.id)}
              aria-pressed={isSelected}
            >
              <div className="cv-template-preview" style={{ borderColor: option.accent }}>
                <div className="cv-template-preview-bar" style={{ background: option.accent }} />
                <div className="cv-template-preview-lines">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="cv-template-meta">
                <h3>{option.title}</h3>
                <p className="helper">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
