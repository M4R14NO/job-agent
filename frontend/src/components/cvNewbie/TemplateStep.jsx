const TEMPLATE_OPTIONS = [
  {
    id: "awesomecv",
    title: "Template 1 - derived from AwesomeCV",
    description: "Clean, traditional layout with strong section hierarchy.",
    previewSrc: "/template-previews/preview-awesomecv.png"
  },
  {
    id: "hipstercv",
    title: "Template 2 - derived from HipsterCV",
    description: "Modern split layout with sidebar highlights.",
    previewSrc: "/template-previews/preview-hipstercv.png"
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
              <div className="cv-template-meta">
                <h3>{option.title}</h3>
                <p className="helper">{option.description}</p>
              </div>
              <div className="cv-template-preview">
                <img
                  src={option.previewSrc}
                  alt={`${option.title} template preview`}
                  className="cv-template-preview-image"
                  loading="lazy"
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
