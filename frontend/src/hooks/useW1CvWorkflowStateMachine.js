import { useCallback, useMemo, useState } from "react";
import {
  W1_CV_ENTRY_STEP,
  W1_JOB_ACTION,
  W1_REVIEW_NAV,
  canTransitionW1CvEntryStep,
  isValidW1CvEntryStep,
  isValidW1JobAction,
  isValidW1ReviewNav
} from "../workflow/contracts/w1CvWorkflowContract";

export default function useW1CvWorkflowStateMachine(options = {}) {
  const {
    selectedJob = null,
    emptyApplicationContext = {},
    createEmptyLoadedProfileSnapshot,
    pdfPreviewRequestVersionRef,
    setSelectedJob,
    setCvReview,
    setIsJobReviewReadOnly,
    setActiveView,
    setCvPreviewPayload,
    setPdfPreviewUrl,
    clearPreviewTracking,
    clearPreviewTrackingRef,
    clearCreatePreviewStateRef,
    setCvEntryError,
    setNewProfileId,
    setApplicationContext,
    setSelectedProfileId,
    setLoadedProfileSnapshot,
    setResumeText,
    setIsDraftProfileActive,
    setDraftProfileId,
    setIsSidebarOpen,
    scrollToJobDetails,
    scrollToProfiles,
    scrollToReview
  } = options;

  const [activeJobAction, setActiveJobActionState] = useState(W1_JOB_ACTION.NONE);
  const [jobCvEntryStep, setJobCvEntryStepState] = useState(W1_CV_ENTRY_STEP.CHOICE);
  const [activeReviewNav, setActiveReviewNavState] = useState(W1_REVIEW_NAV.REVIEW);

  const setActiveJobAction = useCallback((nextAction) => {
    if (!isValidW1JobAction(nextAction)) return;
    setActiveJobActionState(nextAction);
  }, []);

  const setJobCvEntryStep = useCallback((nextStep) => {
    if (!isValidW1CvEntryStep(nextStep)) return;
    setJobCvEntryStepState((prevStep) => {
      if (canTransitionW1CvEntryStep(prevStep, nextStep)) {
        return nextStep;
      }
      return prevStep;
    });
  }, []);

  const forceJobCvEntryStep = useCallback((nextStep) => {
    if (!isValidW1CvEntryStep(nextStep)) return;
    setJobCvEntryStepState(nextStep);
  }, []);

  const setActiveReviewNav = useCallback((nextNav) => {
    if (!isValidW1ReviewNav(nextNav)) return;
    setActiveReviewNavState(nextNav);
  }, []);

  const resetW1CvWorkflow = useCallback(() => {
    setActiveJobActionState(W1_JOB_ACTION.NONE);
    setJobCvEntryStepState(W1_CV_ENTRY_STEP.CHOICE);
    setActiveReviewNavState(W1_REVIEW_NAV.REVIEW);
  }, []);

  const clearReviewArtifacts = useCallback(() => {
    if (pdfPreviewRequestVersionRef?.current != null) {
      pdfPreviewRequestVersionRef.current += 1;
    }
    setCvReview?.(null);
    setIsJobReviewReadOnly?.(false);
    setCvPreviewPayload?.(null);
    setPdfPreviewUrl?.(null);
    if (typeof clearPreviewTracking === "function") {
      clearPreviewTracking();
    } else {
      clearPreviewTrackingRef?.current?.();
    }
  }, [
    pdfPreviewRequestVersionRef,
    setCvReview,
    setIsJobReviewReadOnly,
    setCvPreviewPayload,
    setPdfPreviewUrl,
    clearPreviewTracking,
    clearPreviewTrackingRef
  ]);

  const initializeJobCvContext = useCallback((job) => {
    if (!job) return;
    setCvEntryError?.("");
    setActiveJobActionState(W1_JOB_ACTION.CV);
    setJobCvEntryStepState(W1_CV_ENTRY_STEP.CHOICE);
    clearCreatePreviewStateRef?.current?.();
    clearReviewArtifacts();

    const mergedContext = {
      ...emptyApplicationContext,
      company: job?.company || "",
      application_status: "",
      application_date: "",
      job_title: job?.title || "",
      job_description: job?.description || "",
      job_url: job?.job_url || ""
    };

    setNewProfileId?.("");
    setApplicationContext?.(mergedContext);
    setSelectedProfileId?.("");
    setLoadedProfileSnapshot?.(createEmptyLoadedProfileSnapshot?.() || null);
    setCvReview?.(null);
    setIsJobReviewReadOnly?.(false);
  }, [
    createEmptyLoadedProfileSnapshot,
    emptyApplicationContext,
    clearReviewArtifacts,
    setApplicationContext,
    setCvEntryError,
    setCvReview,
    setIsJobReviewReadOnly,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setSelectedProfileId,
    clearCreatePreviewStateRef
  ]);

  const handleSelectJob = useCallback((job) => {
    clearReviewArtifacts();
    setSelectedJob?.(job);
    setActiveView?.("find");
    setActiveJobActionState(W1_JOB_ACTION.NONE);
    setJobCvEntryStepState(W1_CV_ENTRY_STEP.CHOICE);
  }, [clearReviewArtifacts, setActiveView, setSelectedJob]);

  const handleChooseCreateJobCv = useCallback(() => {
    const mergedContext = {
      ...emptyApplicationContext,
      company: selectedJob?.company || "",
      application_status: "",
      application_date: "",
      job_title: selectedJob?.title || "",
      job_description: selectedJob?.description || "",
      job_url: selectedJob?.job_url || ""
    };

    setJobCvEntryStepState(W1_CV_ENTRY_STEP.CREATE);
    setSelectedProfileId?.("");
    setNewProfileId?.("");
    setResumeText?.("");
    setIsDraftProfileActive?.(false);
    setDraftProfileId?.("");
    setApplicationContext?.(mergedContext);
    setLoadedProfileSnapshot?.(createEmptyLoadedProfileSnapshot?.() || null);
    setCvReview?.(null);
    setIsJobReviewReadOnly?.(false);
  }, [
    createEmptyLoadedProfileSnapshot,
    emptyApplicationContext,
    selectedJob,
    setApplicationContext,
    setCvReview,
    setDraftProfileId,
    setIsDraftProfileActive,
    setIsJobReviewReadOnly,
    setLoadedProfileSnapshot,
    setNewProfileId,
    setResumeText,
    setSelectedProfileId
  ]);

  const handleChooseBranchJobCv = useCallback(() => {
    setJobCvEntryStepState(W1_CV_ENTRY_STEP.BRANCH);
    setIsDraftProfileActive?.(false);
    setDraftProfileId?.("");
    setCvReview?.(null);
    setIsJobReviewReadOnly?.(false);
  }, [setCvReview, setDraftProfileId, setIsDraftProfileActive, setIsJobReviewReadOnly]);

  const handleBackToResults = useCallback(() => {
    clearReviewArtifacts();
    setSelectedJob?.(null);
    setActiveView?.("find");
    setActiveJobActionState(W1_JOB_ACTION.NONE);
    setJobCvEntryStepState(W1_CV_ENTRY_STEP.CHOICE);
  }, [clearReviewArtifacts, setActiveView, setSelectedJob]);

  const handleSetView = useCallback((view) => {
    setActiveView?.(view);
    setSelectedJob?.(null);
    setJobCvEntryStepState(W1_CV_ENTRY_STEP.CHOICE);
    setIsSidebarOpen?.(false);
  }, [setActiveView, setSelectedJob, setIsSidebarOpen]);

  const handleSwitchJobAction = useCallback(() => {
    if (activeJobAction === W1_JOB_ACTION.COVER) {
      initializeJobCvContext(selectedJob);
      return;
    }

    clearReviewArtifacts();
    setJobCvEntryStepState(W1_CV_ENTRY_STEP.CHOICE);
    setActiveJobActionState(W1_JOB_ACTION.COVER);
  }, [activeJobAction, clearReviewArtifacts, initializeJobCvContext, selectedJob]);

  const handleOpenJobDetailsPanel = useCallback(() => {
    setActiveReviewNavState(W1_REVIEW_NAV.DETAILS);
    scrollToJobDetails?.();
  }, [scrollToJobDetails]);

  const handleOpenProfileBrowserPanel = useCallback(() => {
    setActiveReviewNavState(W1_REVIEW_NAV.PROFILES);
    scrollToProfiles?.();
  }, [scrollToProfiles]);

  const handleOpenCvReviewSection = useCallback(() => {
    setActiveReviewNavState(W1_REVIEW_NAV.REVIEW);
    scrollToReview?.();
  }, [scrollToReview]);

  const selectReviewNav = useCallback(() => {
    setActiveReviewNavState(W1_REVIEW_NAV.REVIEW);
  }, []);

  const selectDetailsNav = useCallback(() => {
    setActiveReviewNavState(W1_REVIEW_NAV.DETAILS);
  }, []);

  const selectProfilesNav = useCallback(() => {
    setActiveReviewNavState(W1_REVIEW_NAV.PROFILES);
  }, []);

  const activateCvReviewStep = useCallback((entryStep = W1_CV_ENTRY_STEP.REVIEW) => {
    const targetStep = isValidW1CvEntryStep(entryStep)
      ? entryStep
      : W1_CV_ENTRY_STEP.REVIEW;
    setActiveJobActionState(W1_JOB_ACTION.CV);
    setJobCvEntryStepState(targetStep);
  }, []);

  const activateCvReview = useCallback(() => {
    activateCvReviewStep(W1_CV_ENTRY_STEP.REVIEW);
  }, [activateCvReviewStep]);

  const activateCvBranchReview = useCallback(() => {
    activateCvReviewStep(W1_CV_ENTRY_STEP.BRANCH_REVIEW);
  }, [activateCvReviewStep]);

  const value = useMemo(() => ({
    activeJobAction,
    jobCvEntryStep,
    activeReviewNav,
    setActiveJobAction,
    setJobCvEntryStep,
    forceJobCvEntryStep,
    setActiveReviewNav,
    resetW1CvWorkflow,
    clearReviewArtifacts,
    initializeJobCvContext,
    handleSelectJob,
    handleChooseCreateJobCv,
    handleChooseBranchJobCv,
    handleBackToResults,
    handleSetView,
    handleSwitchJobAction,
    handleOpenJobDetailsPanel,
    handleOpenProfileBrowserPanel,
    handleOpenCvReviewSection,
    selectReviewNav,
    selectDetailsNav,
    selectProfilesNav,
    activateCvReviewStep,
    activateCvReview,
    activateCvBranchReview
  }), [
    activeJobAction,
    jobCvEntryStep,
    activeReviewNav,
    setActiveJobAction,
    setJobCvEntryStep,
    forceJobCvEntryStep,
    setActiveReviewNav,
    resetW1CvWorkflow,
    clearReviewArtifacts,
    initializeJobCvContext,
    handleSelectJob,
    handleChooseCreateJobCv,
    handleChooseBranchJobCv,
    handleBackToResults,
    handleSetView,
    handleSwitchJobAction,
    handleOpenJobDetailsPanel,
    handleOpenProfileBrowserPanel,
    handleOpenCvReviewSection,
    selectReviewNav,
    selectDetailsNav,
    selectProfilesNav,
    activateCvReviewStep,
    activateCvReview,
    activateCvBranchReview
  ]);

  return value;
}
