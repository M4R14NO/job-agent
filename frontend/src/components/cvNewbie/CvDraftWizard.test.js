import { describe, it, expect } from "vitest";
import { buildParseCvCanonicalPayload } from "./CvDraftWizard";

describe("buildParseCvCanonicalPayload", () => {
  it("keeps job context optional when fields are empty", () => {
    const payload = buildParseCvCanonicalPayload({
      resumeText: "Senior engineer with 8 years of experience",
      selectedModel: "model-a",
      lmTimeout: 120,
      cvOutputLanguage: "english",
      applicationContext: {
        job_title: "",
        company: "",
        job_description: "",
        job_url: "",
      },
    });

    expect(payload.resume_text).toBe("Senior engineer with 8 years of experience");
    expect(payload.model).toBe("model-a");
    expect(payload.output_language).toBe("english");
    expect(payload.job_title).toBeUndefined();
    expect(payload.company).toBeUndefined();
    expect(payload.job_description).toBeUndefined();
    expect(payload.job_url).toBeUndefined();
  });

  it("passes through provided manual job context values", () => {
    const payload = buildParseCvCanonicalPayload({
      resumeText: "Backend developer",
      selectedModel: "model-b",
      lmTimeout: 90,
      cvOutputLanguage: "german",
      applicationContext: {
        job_title: "Senior Backend Engineer",
        company: "Acme GmbH",
        job_description: "Build APIs and improve reliability",
        job_url: "https://jobs.example.com/123",
      },
    });

    expect(payload.job_title).toBe("Senior Backend Engineer");
    expect(payload.company).toBe("Acme GmbH");
    expect(payload.job_description).toContain("Build APIs");
    expect(payload.job_url).toBe("https://jobs.example.com/123");
  });
});
