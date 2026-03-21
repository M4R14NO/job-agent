import { useState } from "react";

export default function App() {
  const [resumeText, setResumeText] = useState("");
  const [wishes, setWishes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [location, setLocation] = useState("");
  const [resultsWanted, setResultsWanted] = useState(10);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    setIsLoading(true);
    setError("");
    setResponse(null);

    try {
      const res = await fetch("http://localhost:8000/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText.trim(),
          wishes: wishes.trim() || null,
          search_term: searchTerm.trim() || null,
          location: location.trim() || null,
          results_wanted: resultsWanted
        })
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Local-only prototype</p>
          <h1>Job Agent</h1>
          <p className="subtitle">
            Paste your resume text to start a search and ranking flow.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="field-grid">
          <div>
            <label htmlFor="searchTerm" className="label">
              Search term
            </label>
            <input
              id="searchTerm"
              placeholder="e.g. backend engineer"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="location" className="label">
              Location
            </label>
            <input
              id="location"
              placeholder="e.g. Berlin"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="results" className="label">
              Results wanted
            </label>
            <input
              id="results"
              type="number"
              min={1}
              max={50}
              value={resultsWanted}
              onChange={(event) =>
                setResultsWanted(Number(event.target.value))
              }
            />
          </div>
        </div>

        <label htmlFor="resume" className="label">
          Resume text
        </label>
        <textarea
          id="resume"
          rows={10}
          placeholder="Paste plain text from your resume here..."
          value={resumeText}
          onChange={(event) => setResumeText(event.target.value)}
        />
        <label htmlFor="wishes" className="label">
          Job wishes (optional)
        </label>
        <textarea
          id="wishes"
          rows={4}
          placeholder="Preferred titles, skills, industries, or constraints..."
          value={wishes}
          onChange={(event) => setWishes(event.target.value)}
        />

        <button
          className="primary"
          disabled={!resumeText.trim() || isLoading}
          onClick={handleSearch}
        >
          {isLoading ? "Running..." : "Run search"}
        </button>

        {error && <p className="error">{error}</p>}
        {response && (
          <pre className="response">{JSON.stringify(response, null, 2)}</pre>
        )}
      </section>
    </div>
  );
}
