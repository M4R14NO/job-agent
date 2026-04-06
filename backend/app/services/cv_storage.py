import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from ..schemas.search import CvCanonicalProfile


DEFAULT_PROFILE_STORE = os.getenv("CV_PROFILE_STORE") or str(
    Path(os.getenv("CV_TMP_DIR", "/tmp/job-agent-tex")) / "profiles" / "cv_profiles.json"
)


class RevisionMismatchError(Exception):
    pass


@dataclass
class CvProfileStore:
    path: Path

    def _load_raw(self) -> dict:
        if not self.path.exists():
            return {"profiles": []}
        content = self.path.read_text(encoding="utf-8")
        if not content.strip():
            return {"profiles": []}
        data = json.loads(content)
        if not isinstance(data, dict):
            return {"profiles": []}
        return data

    def _write_raw(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", delete=False, dir=str(self.path.parent), encoding="utf-8") as tmp:
            json.dump(data, tmp, ensure_ascii=True, indent=2)
            tmp_path = Path(tmp.name)
        tmp_path.replace(self.path)

    def list_profiles(self) -> list[CvCanonicalProfile]:
        data = self._load_raw()
        profiles = data.get("profiles", []) if isinstance(data, dict) else []
        items = []
        for item in profiles:
            try:
                items.append(CvCanonicalProfile.model_validate(item))
            except ValidationError:
                continue
        return items

    def get_profile(self, profile_id: str) -> CvCanonicalProfile | None:
        for profile in self.list_profiles():
            if profile.profile_id == profile_id:
                return profile
        return None

    def save_profile(self, profile: CvCanonicalProfile, *, expected_revision: int | None = None) -> CvCanonicalProfile:
        data = self._load_raw()
        profiles = data.get("profiles", []) if isinstance(data, dict) else []
        updated = []
        found = False
        for item in profiles:
            if not isinstance(item, dict):
                continue
            if item.get("profile_id") == profile.profile_id:
                found = True
                current_revision = int(item.get("revision", 0))
                if expected_revision is not None and current_revision != expected_revision:
                    raise RevisionMismatchError("Profile revision does not match")
                updated.append(profile.model_dump())
            else:
                updated.append(item)
        if not found:
            if expected_revision not in (None, 0):
                raise RevisionMismatchError("Profile revision does not match")
            updated.append(profile.model_dump())
        data["profiles"] = updated
        self._write_raw(data)
        return profile

    def delete_profile(self, profile_id: str) -> None:
        data = self._load_raw()
        profiles = data.get("profiles", []) if isinstance(data, dict) else []
        data["profiles"] = [item for item in profiles if isinstance(item, dict) and item.get("profile_id") != profile_id]
        self._write_raw(data)


def get_profile_store() -> CvProfileStore:
    return CvProfileStore(path=Path(DEFAULT_PROFILE_STORE))
