import { useCallback, useMemo, useState } from "react";
import {
  deleteCvProfile,
  getCvProfile,
  listCvProfiles,
  saveCvProfile
} from "../api/llm";

const DEFAULT_CANONICAL_SCHEMA_VERSION = "v1";

const buildExportFilename = () => {
  const datePart = new Date().toISOString().slice(0, 10);
  return `cv-profiles-${datePart}.json`;
};

const downloadJson = (payload, filename) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function useCvProfilesController(options = {}) {
  const {
    setCvProfiles,
    selectedProfileId,
    setSelectedProfileId,
    syncRerankProfileSelection,
    handleProfilesDeletedFromSearch,
    setCvEntryError,
    onDeletedActiveProfile,
    canonicalSchemaVersion = DEFAULT_CANONICAL_SCHEMA_VERSION,
    onProfilesRefreshed
  } = options;

  const [profilesError, setProfilesError] = useState("");
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [isProfileBulkActionBusy, setIsProfileBulkActionBusy] = useState(false);

  const loadProfiles = useCallback(async (preferredProfileId = "") => {
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const data = await listCvProfiles();
      const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
      setCvProfiles(profiles);
      syncRerankProfileSelection?.(profiles);
      setSelectedProfileId((prev) => {
        if (!profiles.length) return "";
        if (preferredProfileId && profiles.some((profile) => profile.profile_id === preferredProfileId)) {
          return preferredProfileId;
        }
        if (prev && profiles.some((profile) => profile.profile_id === prev)) {
          return prev;
        }
        return profiles[0]?.profile_id || "";
      });
      onProfilesRefreshed?.(profiles);
      return profiles;
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Failed to load profiles");
      return [];
    } finally {
      setProfilesLoading(false);
    }
  }, [onProfilesRefreshed, setCvProfiles, setSelectedProfileId, syncRerankProfileSelection]);

  const handleDeleteProfiles = useCallback(async (profileIds = []) => {
    const ids = Array.from(new Set((profileIds || []).filter(Boolean)));
    if (!ids.length) return;

    setIsProfileBulkActionBusy(true);
    setCvEntryError?.("");
    try {
      const failedIds = [];
      for (const id of ids) {
        try {
          await deleteCvProfile(id);
        } catch (_err) {
          failedIds.push(id);
        }
      }

      const deletedIds = ids.filter((id) => !failedIds.includes(id));
      if (deletedIds.length) {
        setCvProfiles((prev) => prev.filter((profile) => !deletedIds.includes(profile.profile_id)));
      }

      if (deletedIds.includes(selectedProfileId)) {
        onDeletedActiveProfile?.();
      }

      handleProfilesDeletedFromSearch?.(deletedIds);
      await loadProfiles();

      if (!failedIds.length) {
        setCvEntryError?.(`Deleted ${deletedIds.length} profile(s).`);
      } else {
        setCvEntryError?.(
          `Deleted ${deletedIds.length} profile(s). Failed to delete ${failedIds.length}: ${failedIds.join(", ")}`
        );
      }
    } catch (err) {
      setCvEntryError?.(err instanceof Error ? err.message : "Failed to delete selected profiles.");
    } finally {
      setIsProfileBulkActionBusy(false);
    }
  }, [handleProfilesDeletedFromSearch, loadProfiles, onDeletedActiveProfile, selectedProfileId, setCvEntryError, setCvProfiles]);

  const handleExportProfiles = useCallback(async (profileIds = []) => {
    const ids = Array.from(new Set((profileIds || []).filter(Boolean)));
    if (!ids.length) return;

    setIsProfileBulkActionBusy(true);
    setCvEntryError?.("");
    try {
      const listed = await listCvProfiles();
      const allProfiles = Array.isArray(listed?.profiles) ? listed.profiles : [];
      const profileById = new Map(
        allProfiles
          .filter((profile) => profile?.profile_id)
          .map((profile) => [profile.profile_id, profile])
      );
      const exported = ids
        .map((id) => profileById.get(id))
        .filter(Boolean);
      const failedIds = ids.filter((id) => !profileById.has(id));

      if (!exported.length) {
        throw new Error("No profiles could be exported.");
      }

      downloadJson(
        {
          profiles: exported
        },
        buildExportFilename()
      );

      if (!failedIds.length) {
        setCvEntryError?.(`Exported ${exported.length} profile(s).`);
      } else {
        setCvEntryError?.(
          `Exported ${exported.length} profile(s). Failed to export ${failedIds.length}: ${failedIds.join(", ")}`
        );
      }
    } catch (err) {
      setCvEntryError?.(err instanceof Error ? err.message : "Failed to export profiles.");
    } finally {
      setIsProfileBulkActionBusy(false);
    }
  }, [setCvEntryError]);

  const handleImportProfiles = useCallback(async ({ profiles = [], overwriteExisting = true } = {}) => {
    const incomingProfiles = Array.isArray(profiles) ? profiles : [];
    if (!incomingProfiles.length) return;

    const resolveImportedProfileId = (profile) =>
      String(
        profile?.profile_id
        || profile?.profileId
        || profile?.id
        || profile?.name
        || ""
      ).trim();

    const normalizeImportedProfile = ({ profilePayload, profileId, existing }) => {
      const candidate = profilePayload?.profile && typeof profilePayload.profile === "object"
        ? profilePayload.profile
        : profilePayload;

      const normalizedData = candidate?.data && typeof candidate.data === "object" && !Array.isArray(candidate.data)
        ? candidate.data
        : (existing?.data || {});

      const normalizedAudit = candidate?.audit && typeof candidate.audit === "object" && !Array.isArray(candidate.audit)
        ? candidate.audit
        : (existing?.audit || {});

      return {
        schema_version: candidate?.schema_version || existing?.schema_version || canonicalSchemaVersion,
        profile_id: profileId,
        revision: existing ? (existing.revision ?? 0) : 0,
        template_id: candidate?.template_id || existing?.template_id || "awesomecv",
        data: normalizedData,
        company: candidate?.company ?? existing?.company ?? null,
        application_status: candidate?.application_status ?? existing?.application_status ?? null,
        application_date: candidate?.application_date ?? existing?.application_date ?? null,
        job_title: candidate?.job_title ?? existing?.job_title ?? null,
        job_description: candidate?.job_description ?? existing?.job_description ?? null,
        job_url: candidate?.job_url ?? existing?.job_url ?? null,
        theme_color: candidate?.theme_color ?? existing?.theme_color ?? null,
        show_profile_image: typeof candidate?.show_profile_image === "boolean"
          ? candidate.show_profile_image
          : (existing?.show_profile_image ?? true),
        header_text_align: candidate?.header_text_align ?? existing?.header_text_align ?? "right",
        header_title_size: candidate?.header_title_size ?? existing?.header_title_size ?? "Huge",
        header_subtitle_size: candidate?.header_subtitle_size ?? existing?.header_subtitle_size ?? "Large",
        parent_profile_id: candidate?.parent_profile_id ?? existing?.parent_profile_id ?? null,
        lineage_root_profile_id: candidate?.lineage_root_profile_id ?? existing?.lineage_root_profile_id ?? profileId,
        lineage_depth: Number.isFinite(candidate?.lineage_depth)
          ? Number(candidate.lineage_depth)
          : (existing?.lineage_depth ?? 0),
        branch_reason: candidate?.branch_reason ?? existing?.branch_reason ?? null,
        section_order: Array.isArray(candidate?.section_order)
          ? candidate.section_order
          : (existing?.section_order || []),
        sidebar_section_order: Array.isArray(candidate?.sidebar_section_order)
          ? candidate.sidebar_section_order
          : (existing?.sidebar_section_order || []),
        main_section_order: Array.isArray(candidate?.main_section_order)
          ? candidate.main_section_order
          : (existing?.main_section_order || []),
        section_labels: candidate?.section_labels && typeof candidate.section_labels === "object" && !Array.isArray(candidate.section_labels)
          ? candidate.section_labels
          : (existing?.section_labels || undefined),
        audit: normalizedAudit
      };
    };

    setIsProfileBulkActionBusy(true);
    setCvEntryError?.("");
    try {
      const uniqueById = new Map();
      incomingProfiles.forEach((profile) => {
        const id = resolveImportedProfileId(profile);
        if (!id) return;
        uniqueById.set(id, { ...profile, profile_id: id });
      });

      const stats = {
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0
      };

      for (const [profileId, profilePayload] of uniqueById.entries()) {
        let existing = null;
        try {
          existing = await getCvProfile(profileId);
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          if (!message.includes("status 404")) {
            throw err;
          }
        }

        if (existing && !overwriteExisting) {
          stats.skipped += 1;
          continue;
        }

        const savePayload = normalizeImportedProfile({
          profilePayload,
          profileId,
          existing
        });

        try {
          await saveCvProfile(profileId, savePayload);
          if (existing) {
            stats.updated += 1;
          } else {
            stats.created += 1;
          }
        } catch (_err) {
          stats.failed += 1;
        }
      }

      await loadProfiles();
      setCvEntryError?.(
        `Import done. Created: ${stats.created}, updated: ${stats.updated}, skipped: ${stats.skipped}, failed: ${stats.failed}.`
      );
    } catch (err) {
      setCvEntryError?.(err instanceof Error ? err.message : "Failed to import profiles.");
    } finally {
      setIsProfileBulkActionBusy(false);
    }
  }, [canonicalSchemaVersion, loadProfiles, setCvEntryError]);

  return useMemo(() => ({
    profilesError,
    profilesLoading,
    isProfileBulkActionBusy,
    loadProfiles,
    handleDeleteProfiles,
    handleExportProfiles,
    handleImportProfiles
  }), [
    profilesError,
    profilesLoading,
    isProfileBulkActionBusy,
    loadProfiles,
    handleDeleteProfiles,
    handleExportProfiles,
    handleImportProfiles
  ]);
}
