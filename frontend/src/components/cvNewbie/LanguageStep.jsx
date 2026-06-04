export default function LanguageStep({ cvOutputLanguage, onCvOutputLanguageChange, hasDraft }) {
  return (
    <div className="cv-step-content">
      {hasDraft ? (
        <div className="cv-step-note">
          Draft already generated. Regenerate after changing the output language.
        </div>
      ) : null}
      <div className="cv-step-field">
        <label htmlFor="cvNewbieLanguage" className="label">Output language</label>
        <select
          id="cvNewbieLanguage"
          value={cvOutputLanguage}
          onChange={(event) => onCvOutputLanguageChange(event.target.value)}
        >
          <option value="english">English</option>
          <option value="german">German</option>
        </select>
        <p className="helper">Choose the language for headings and output text.</p>
      </div>
    </div>
  );
}
