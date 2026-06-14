from fastapi.testclient import TestClient

from app import main


client = TestClient(main.app)


def test_health_reports_scraping_disabled_by_default(monkeypatch):
    monkeypatch.delenv(main.SCRAPING_ENABLED_ENV_VAR, raising=False)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "scraping_enabled": False}


def test_health_reports_scraping_enabled_when_flag_set(monkeypatch):
    monkeypatch.setenv(main.SCRAPING_ENABLED_ENV_VAR, "true")

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "scraping_enabled": True}


def test_search_returns_503_when_scraping_disabled(monkeypatch):
    monkeypatch.delenv(main.SCRAPING_ENABLED_ENV_VAR, raising=False)

    called = {"fetch_jobs": False}

    def fail_fetch_jobs(**kwargs):
        called["fetch_jobs"] = True
        raise AssertionError("fetch_jobs should not be called when scraping is disabled")

    monkeypatch.setattr(main, "fetch_jobs", fail_fetch_jobs)

    response = client.post("/search", json={"resume_text": "resume"})

    assert response.status_code == 503
    assert response.json() == {"detail": main.SCRAPING_DISABLED_DETAIL}
    assert called["fetch_jobs"] is False


def test_linkedin_enrich_returns_503_when_scraping_disabled(monkeypatch):
    monkeypatch.delenv(main.SCRAPING_ENABLED_ENV_VAR, raising=False)

    called = {"enrich": False}

    def fail_enrich(*args, **kwargs):
        called["enrich"] = True
        raise AssertionError("fetch_linkedin_job_details should not be called when scraping is disabled")

    monkeypatch.setattr(main, "fetch_linkedin_job_details", fail_enrich)

    response = client.post(
        "/search/linkedin/enrich",
        json={"jobs": [{"job_url": "https://www.linkedin.com/jobs/view/1234567890/"}]},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": main.SCRAPING_DISABLED_DETAIL}
    assert called["enrich"] is False


def test_search_works_when_scraping_enabled(monkeypatch):
    monkeypatch.setenv(main.SCRAPING_ENABLED_ENV_VAR, "1")

    jobs = [{"title": "Engineer", "job_url": "https://example.com/job"}]

    def fake_fetch_jobs(**kwargs):
        return jobs

    def fake_score_jobs(**kwargs):
        return jobs, False, 0, None, None, None, None

    monkeypatch.setattr(main, "fetch_jobs", fake_fetch_jobs)
    monkeypatch.setattr(main, "score_jobs", fake_score_jobs)

    response = client.post("/search", json={"resume_text": "resume"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "Search completed"
    assert len(payload["jobs"]) == 1


def test_linkedin_enrich_works_when_scraping_enabled(monkeypatch):
    monkeypatch.setenv(main.SCRAPING_ENABLED_ENV_VAR, "true")

    def fake_enrich(jobs, timeout_seconds=8.0):
        return [
            main.LinkedInEnrichItem(
                job_url="https://www.linkedin.com/jobs/view/1234567890/",
                job_id="1234567890",
                description="desc",
                description_html="<p>desc</p>",
                status="ok",
                error=None,
            )
        ]

    monkeypatch.setattr(main, "fetch_linkedin_job_details", fake_enrich)

    response = client.post(
        "/search/linkedin/enrich",
        json={"jobs": [{"job_url": "https://www.linkedin.com/jobs/view/1234567890/"}]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["status"] == "ok"
