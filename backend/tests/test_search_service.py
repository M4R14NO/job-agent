import pandas as pd

from app.services.search_service import fetch_jobs


def test_fetch_jobs_converts_50_km_to_31_miles(monkeypatch):
    captured = {}

    def fake_scrape_jobs(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"title": "Engineer"}])

    monkeypatch.setattr("app.services.search_service.scrape_jobs", fake_scrape_jobs)
    fetch_jobs(
        site_name=["indeed"],
        search_term="engineer",
        location="Berlin",
        search_radius_km=50,
        results_wanted=10,
        hours_old=72,
        is_remote=False,
        linkedin_fetch_description=False,
        description_format="markdown",
    )

    assert captured["distance"] == 31


def test_fetch_jobs_converts_100_km_to_62_miles(monkeypatch):
    captured = {}

    def fake_scrape_jobs(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"title": "Engineer"}])

    monkeypatch.setattr("app.services.search_service.scrape_jobs", fake_scrape_jobs)
    fetch_jobs(
        site_name=["indeed"],
        search_term="engineer",
        location="Berlin",
        search_radius_km=100,
        results_wanted=10,
        hours_old=72,
        is_remote=False,
        linkedin_fetch_description=False,
        description_format="markdown",
    )

    assert captured["distance"] == 62


def test_fetch_jobs_converts_0_km_to_0_miles(monkeypatch):
    captured = {}

    def fake_scrape_jobs(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"title": "Engineer"}])

    monkeypatch.setattr("app.services.search_service.scrape_jobs", fake_scrape_jobs)
    fetch_jobs(
        site_name=["indeed"],
        search_term="engineer",
        location="Berlin",
        search_radius_km=0,
        results_wanted=10,
        hours_old=72,
        is_remote=False,
        linkedin_fetch_description=False,
        description_format="markdown",
    )

    assert captured["distance"] == 0


def test_fetch_jobs_passes_none_distance_when_radius_missing(monkeypatch):
    captured = {}

    def fake_scrape_jobs(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"title": "Engineer"}])

    monkeypatch.setattr("app.services.search_service.scrape_jobs", fake_scrape_jobs)
    fetch_jobs(
        site_name=["indeed"],
        search_term="engineer",
        location="Berlin",
        search_radius_km=None,
        results_wanted=10,
        hours_old=72,
        is_remote=False,
        linkedin_fetch_description=False,
        description_format="markdown",
    )

    assert captured["distance"] is None
