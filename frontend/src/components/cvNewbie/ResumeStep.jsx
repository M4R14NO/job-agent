import { useState } from "react";

const EXAMPLE_CV_TEXT = `PROFILE
Name: Alex Rivers
Headline: Senior Machine Learning Engineer
Summary: 8+ years delivering production AI systems and measurable impact.

CONTACT
Email: alex.rivers@example.com
Phone: +49 151 0000 0000
Location: Munich, Germany
Links: github.com/alexrivers, linkedin.com/in/alexrivers

EXPERIENCE
2022-01 to Present | Principal ML Engineer | Northstar AI GmbH | Munich, Germany
- Led retrieval and ranking platform serving 2M+ requests/day.
- Improved recommendation CTR by 18% with hybrid architecture.

EDUCATION
M.Sc. Computer Science | Technical University of Munich | 2018

SKILLS
Machine Learning: ranking systems, NLP, recommendation systems
Programming: Python, TypeScript, SQL
`;

export default function ResumeStep({ resumeText, onResumeTextChange, hasDraft }) {
  const [showExample, setShowExample] = useState(false);

  return (
    <div className="cv-step-content">
      {hasDraft ? (
        <div className="cv-step-note">
          Draft already generated. Update this text and regenerate to refresh the draft.
        </div>
      ) : null}
      <div className="cv-step-field">
        <label htmlFor="cvNewbieText" className="label">CV text</label>
        <textarea
          id="cvNewbieText"
          rows={16}
          value={resumeText}
          onChange={(event) => onResumeTextChange(event.target.value)}
          placeholder="Paste your resume text here. Include dates and time spans."
        />
        <p className="helper">Keep sections labeled so the parser can map your content reliably.</p>
        <button
          type="button"
          className="secondary cv-example-toggle"
          onClick={() => setShowExample((prev) => !prev)}
        >
          {showExample ? "Hide example" : "Show example"}
        </button>
        {showExample ? (
          <div className="example-box">{EXAMPLE_CV_TEXT}</div>
        ) : null}
      </div>
    </div>
  );
}
