export const W1_JOB_ACTION = Object.freeze({
  NONE: "none",
  CV: "cv",
  COVER: "cover"
});

export const W1_CV_ENTRY_STEP = Object.freeze({
  CHOICE: "choice",
  CREATE: "create",
  BRANCH: "branch",
  BRANCH_REVIEW: "branch-review"
});

const W1_CV_ALLOWED_TRANSITIONS = Object.freeze({
  [W1_CV_ENTRY_STEP.CHOICE]: new Set([
    W1_CV_ENTRY_STEP.CREATE,
    W1_CV_ENTRY_STEP.BRANCH
  ]),
  [W1_CV_ENTRY_STEP.CREATE]: new Set([
    W1_CV_ENTRY_STEP.CHOICE,
    W1_CV_ENTRY_STEP.BRANCH_REVIEW
  ]),
  [W1_CV_ENTRY_STEP.BRANCH]: new Set([
    W1_CV_ENTRY_STEP.CHOICE,
    W1_CV_ENTRY_STEP.BRANCH_REVIEW
  ]),
  [W1_CV_ENTRY_STEP.BRANCH_REVIEW]: new Set([
    W1_CV_ENTRY_STEP.CHOICE,
    W1_CV_ENTRY_STEP.BRANCH
  ])
});

const ENTRY_STEPS = new Set(Object.values(W1_CV_ENTRY_STEP));
const JOB_ACTIONS = new Set(Object.values(W1_JOB_ACTION));

export const isValidW1CvEntryStep = (step) => ENTRY_STEPS.has(step);

export const isValidW1JobAction = (action) => JOB_ACTIONS.has(action);

export const canTransitionW1CvEntryStep = (fromStep, toStep) => {
  if (!isValidW1CvEntryStep(fromStep) || !isValidW1CvEntryStep(toStep)) {
    return false;
  }
  if (fromStep === toStep) return true;
  return W1_CV_ALLOWED_TRANSITIONS[fromStep]?.has(toStep) || false;
};

export const getW1WizardStartStep = (entryStep) => {
  if (entryStep === W1_CV_ENTRY_STEP.BRANCH_REVIEW) {
    return 5;
  }
  return 1;
};

export const shouldAutoAdaptOnW1Entry = (entryStep) => {
  if (entryStep === W1_CV_ENTRY_STEP.BRANCH_REVIEW) {
    return false;
  }
  return false;
};

export const getW1InvariantViolations = ({ entryStep, wizardStartStep, autoAdaptOnEntry }) => {
  const violations = [];

  if (entryStep === W1_CV_ENTRY_STEP.BRANCH_REVIEW && wizardStartStep !== 5) {
    violations.push("branch-review must open at wizard step 5.");
  }

  if (entryStep === W1_CV_ENTRY_STEP.BRANCH_REVIEW && autoAdaptOnEntry) {
    violations.push("branch-review cannot auto-run adaptation on entry.");
  }

  return violations;
};
