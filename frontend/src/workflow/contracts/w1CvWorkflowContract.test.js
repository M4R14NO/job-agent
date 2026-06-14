import { describe, expect, it } from "vitest";
import {
  W1_CV_ENTRY_STEP,
  canTransitionW1CvEntryStep,
  getW1InvariantViolations,
  getW1WizardStartStep,
  shouldAutoAdaptOnW1Entry
} from "./w1CvWorkflowContract";

describe("w1CvWorkflowContract", () => {
  it("allows canonical transitions and rejects invalid ones", () => {
    expect(canTransitionW1CvEntryStep(W1_CV_ENTRY_STEP.CHOICE, W1_CV_ENTRY_STEP.CREATE)).toBe(true);
    expect(canTransitionW1CvEntryStep(W1_CV_ENTRY_STEP.CHOICE, W1_CV_ENTRY_STEP.BRANCH)).toBe(true);
    expect(canTransitionW1CvEntryStep(W1_CV_ENTRY_STEP.BRANCH_REVIEW, W1_CV_ENTRY_STEP.CREATE)).toBe(false);
  });

  it("opens branch-review at wizard step 5", () => {
    expect(getW1WizardStartStep(W1_CV_ENTRY_STEP.BRANCH_REVIEW)).toBe(5);
  });

  it("never auto-adapts on branch-review entry", () => {
    expect(shouldAutoAdaptOnW1Entry(W1_CV_ENTRY_STEP.BRANCH_REVIEW)).toBe(false);
  });

  it("reports invariant violations for invalid branch-review runtime behavior", () => {
    const violations = getW1InvariantViolations({
      entryStep: W1_CV_ENTRY_STEP.BRANCH_REVIEW,
      wizardStartStep: 3,
      autoAdaptOnEntry: true
    });

    expect(violations).toContain("branch-review must open at wizard step 5.");
    expect(violations).toContain("branch-review cannot auto-run adaptation on entry.");
  });
});
