import { useEffect, useRef } from "react";

const EXAMPLE_CV_TEXT = `PROFILE
Name: Alex Rivers
Headline: Senior Machine Learning Engineer | Applied AI Systems
Summary: 8+ years delivering production AI systems, MLOps workflows, and measurable product impact.

CONTACT
Email: alex.rivers@example.com
Phone: +49 151 0000 0000
Location: Munich, Germany
Links: github.com/alexrivers, linkedin.com/in/alexrivers

EXPERIENCE
2022-01 to Present | Principal ML Engineer | Northstar AI GmbH | Munich, Germany
- Led retrieval and ranking platform serving 2M+ requests/day with 99.95% uptime.
- Improved recommendation CTR by 18% through hybrid embedding plus keyword architecture.
- Mentored 6 engineers and established model release quality gates.

2019-04 to 2021-12 | Senior Data Scientist | Helios Analytics | Berlin, Germany
- Built forecasting services that reduced inventory misses by 24%.
- Introduced feature store conventions and model registry governance.

EDUCATION
M.Sc. Computer Science | Technical University of Munich | 2018
B.Sc. Information Engineering | University of Stuttgart | 2016

SKILLS
Machine Learning: ranking systems, NLP, recommendation systems, experimentation
Programming: Python, TypeScript, SQL, Bash
Platforms: AWS, Docker, Kubernetes, Airflow, Postgres

LANGUAGES
German (C1), English (C2), Spanish (B1)

VOLUNTEER
Mentor | Data4Good Munich | 2021-Present
- Run monthly workshops on practical ML project setup.

HONORS
Top 10 Finalist | European ML Challenge | 2023
Dean's List | TU Munich | 2016-2018

CERTIFICATES
AWS Certified Machine Learning Specialty | AWS | 2024
TensorFlow Developer Certificate | Google | 2022

WRITING
"Efficient Ranking with Hybrid Signals" | Applied AI Review | 2024
"Reliable Offline Evaluation in Recommenders" | MLOps Journal | 2023

INTERESTS
Trail running, analog photography, open-source developer tooling

STRENGTHS
Cross-functional leadership, system thinking, pragmatic delivery

HOBBIES
Rock climbing, chess, espresso brewing

PROJECTS
Open-source feature drift monitor for tabular models (github.com/alexrivers/drift-watch)
`;

export default function ResumeStep({ resumeText, onResumeTextChange, showExample }) {
  const canCopyExample = !resumeText.trim();
  const exampleColumnRef = useRef(null);

  useEffect(() => {
    if (!showExample) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1080px)").matches) return;

    requestAnimationFrame(() => {
      exampleColumnRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [showExample]);

  return (
    <div className="cv-step-content">
      <div className={`cv-resume-layout${showExample ? " is-example-open" : ""}`}>
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
        </div>

        {showExample ? (
          <aside className="cv-example-column" aria-label="CV text example" ref={exampleColumnRef}>
            <div className="cv-example-column-header">
              <h3>Example CV text</h3>
              {canCopyExample ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onResumeTextChange(EXAMPLE_CV_TEXT)}
                >
                  Copy to CV text
                </button>
              ) : null}
            </div>
            <pre className="cv-example-box">{EXAMPLE_CV_TEXT}</pre>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
