import json

from app.services import cv_storage


def test_default_profile_store_falls_back_to_home_store_with_profiles(tmp_path, monkeypatch):
    runtime_store = tmp_path / "runtime" / "profiles" / "cv_profiles.json"
    runtime_store.parent.mkdir(parents=True, exist_ok=True)
    runtime_store.write_text('{"profiles": []}', encoding="utf-8")

    home = tmp_path / "home"
    home_store = home / ".job-agent" / "profiles" / "cv_profiles.json"
    home_store.parent.mkdir(parents=True, exist_ok=True)
    home_store.write_text(
        json.dumps({"profiles": [{"profile_id": "cv_latest"}]}),
        encoding="utf-8",
    )

    monkeypatch.setenv("CV_PROFILE_STORE", str(runtime_store))
    monkeypatch.delenv("CV_TMP_DIR", raising=False)
    monkeypatch.setattr(cv_storage, "_user_home", lambda: home)

    resolved = cv_storage._default_profile_store()

    assert resolved == str(home_store)


def test_default_profile_store_supports_directory_in_cv_profile_store(tmp_path, monkeypatch):
    directory = tmp_path / "profiles_dir"
    directory.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("CV_PROFILE_STORE", str(directory))
    monkeypatch.delenv("CV_TMP_DIR", raising=False)

    resolved = cv_storage._default_profile_store()

    assert resolved == str(directory / "cv_profiles.json")
