import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function useLayoutInteractionsController(options = {}) {
  const {
    isFindView,
    activeView,
    isW1WizardReviewLayout,
    sidebarWidthKey,
    sidebarMinWidth,
    sidebarMaxWidth,
    reviewPreviewMinWidth,
    reviewEditorMinWidth,
    reviewSplitterWidth
  } = options;

  const [sidebarWidth, setSidebarWidth] = useState(sidebarMinWidth);
  const [reviewPreviewWidth, setReviewPreviewWidth] = useState(null);
  const [createReviewPreviewWidth, setCreateReviewPreviewWidth] = useState(null);

  const isResizingSidebarRef = useRef(false);
  const isResizingReviewRef = useRef(false);
  const isResizingCreateReviewRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(sidebarMinWidth);
  const reviewResizeStartXRef = useRef(0);
  const reviewResizeStartWidthRef = useRef(0);
  const createReviewResizeStartXRef = useRef(0);
  const createReviewResizeStartWidthRef = useRef(0);
  const sidebarWidthRef = useRef(sidebarMinWidth);
  const reviewLayoutRef = useRef(null);
  const createReviewLayoutRef = useRef(null);
  const reviewSectionRef = useRef(null);
  const createReviewSectionRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem(sidebarWidthKey);
    if (!stored) return;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, sidebarMinWidth), sidebarMaxWidth);
    setSidebarWidth(clamped);
  }, [sidebarMaxWidth, sidebarMinWidth, sidebarWidthKey]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    const stopResizeInteractions = () => {
      let released = false;
      if (isResizingSidebarRef.current) {
        isResizingSidebarRef.current = false;
        localStorage.setItem(sidebarWidthKey, String(sidebarWidthRef.current));
        released = true;
      }
      if (isResizingReviewRef.current) {
        isResizingReviewRef.current = false;
        released = true;
      }
      if (isResizingCreateReviewRef.current) {
        isResizingCreateReviewRef.current = false;
        released = true;
      }
      if (released) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    const handleMouseMove = (event) => {
      if (event.buttons === 0) {
        stopResizeInteractions();
        return;
      }

      if (isResizingSidebarRef.current) {
        const delta = event.clientX - resizeStartXRef.current;
        const nextWidth = Math.min(
          Math.max(resizeStartWidthRef.current + delta, sidebarMinWidth),
          sidebarMaxWidth
        );
        setSidebarWidth(nextWidth);
        return;
      }

      if (isResizingReviewRef.current) {
        const layoutRect = reviewLayoutRef.current?.getBoundingClientRect();
        if (!layoutRect) return;
        const delta = event.clientX - reviewResizeStartXRef.current;
        const maxPreviewWidth = Math.max(
          reviewPreviewMinWidth,
          layoutRect.width - reviewEditorMinWidth - reviewSplitterWidth
        );
        const nextPreviewWidth = Math.min(
          Math.max(reviewResizeStartWidthRef.current + delta, reviewPreviewMinWidth),
          maxPreviewWidth
        );
        setReviewPreviewWidth(nextPreviewWidth);
        return;
      }

      if (!isResizingCreateReviewRef.current) return;
      const createLayoutRect = createReviewLayoutRef.current?.getBoundingClientRect();
      if (!createLayoutRect) return;
      const createDelta = event.clientX - createReviewResizeStartXRef.current;
      const createMaxPreviewWidth = Math.max(
        reviewPreviewMinWidth,
        createLayoutRect.width - reviewEditorMinWidth - reviewSplitterWidth
      );
      const nextCreatePreviewWidth = Math.min(
        Math.max(createReviewResizeStartWidthRef.current + createDelta, reviewPreviewMinWidth),
        createMaxPreviewWidth
      );
      setCreateReviewPreviewWidth(nextCreatePreviewWidth);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizeInteractions);
    window.addEventListener("pointerup", stopResizeInteractions);
    window.addEventListener("pointercancel", stopResizeInteractions);
    window.addEventListener("blur", stopResizeInteractions);
    return () => {
      stopResizeInteractions();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizeInteractions);
      window.removeEventListener("pointerup", stopResizeInteractions);
      window.removeEventListener("pointercancel", stopResizeInteractions);
      window.removeEventListener("blur", stopResizeInteractions);
    };
  }, [
    reviewEditorMinWidth,
    reviewPreviewMinWidth,
    reviewSplitterWidth,
    sidebarMaxWidth,
    sidebarMinWidth,
    sidebarWidthKey
  ]);

  const handleSidebarResizeStart = useCallback((event) => {
    if (!isFindView) return;
    isResizingSidebarRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [isFindView]);

  const handleReviewResizeStart = useCallback((event) => {
    if (!isW1WizardReviewLayout || window.matchMedia("(max-width: 960px)").matches) return;
    const layoutRect = reviewLayoutRef.current?.getBoundingClientRect();
    if (!layoutRect) return;

    const currentPreviewWidth = reviewSectionRef.current?.getBoundingClientRect().width
      || reviewPreviewWidth
      || (layoutRect.width * 0.5);

    isResizingReviewRef.current = true;
    reviewResizeStartXRef.current = event.clientX;
    reviewResizeStartWidthRef.current = currentPreviewWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
  }, [isW1WizardReviewLayout, reviewPreviewWidth]);

  const handleCreateReviewResizeStart = useCallback((event) => {
    if (activeView !== "create" || window.matchMedia("(max-width: 960px)").matches) return;
    const layoutRect = createReviewLayoutRef.current?.getBoundingClientRect();
    if (!layoutRect) return;

    const currentPreviewWidth = createReviewSectionRef.current?.getBoundingClientRect().width
      || createReviewPreviewWidth
      || (layoutRect.width * 0.5);

    isResizingCreateReviewRef.current = true;
    createReviewResizeStartXRef.current = event.clientX;
    createReviewResizeStartWidthRef.current = currentPreviewWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
  }, [activeView, createReviewPreviewWidth]);

  const reviewLayoutStyle = useMemo(() => {
    if (!reviewPreviewWidth) return undefined;
    return { "--review-preview-width": `${Math.round(reviewPreviewWidth)}px` };
  }, [reviewPreviewWidth]);

  const createReviewLayoutStyle = useMemo(() => {
    if (!createReviewPreviewWidth) return undefined;
    return { "--create-review-preview-width": `${Math.round(createReviewPreviewWidth)}px` };
  }, [createReviewPreviewWidth]);

  return {
    sidebarWidth,
    reviewLayoutRef,
    reviewSectionRef,
    createReviewLayoutRef,
    createReviewSectionRef,
    reviewLayoutStyle,
    createReviewLayoutStyle,
    handleSidebarResizeStart,
    handleReviewResizeStart,
    handleCreateReviewResizeStart
  };
}
