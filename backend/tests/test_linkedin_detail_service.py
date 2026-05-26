from app.services import linkedin_detail_service
import httpx


def test_parse_linkedin_job_id_from_url():
    url = "https://www.linkedin.com/jobs/view/1234567890/?trackingId=abc"
    assert linkedin_detail_service.parse_linkedin_job_id(url) == "1234567890"


def test_fetch_linkedin_job_details_skips_duplicate_urls(monkeypatch):
    calls = []

    class FakeResponse:
        text = '<div class="show-more-less-html__markup">Line 1<br/>Line 2</div>'

        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def get(self, url):
            calls.append(url)
            return FakeResponse()

    monkeypatch.setattr(linkedin_detail_service.httpx, "Client", FakeClient)

    jobs = [
        {"job_url": "https://www.linkedin.com/jobs/view/1234567890/"},
        {"job_url": "https://www.linkedin.com/jobs/view/1234567890/?trackingId=dup"},
    ]

    results = linkedin_detail_service.fetch_linkedin_job_details(jobs)

    assert len(calls) == 1
    assert len(results) == 2
    assert results[0].status == "ok"
    assert results[0].description == "Line 1\nLine 2"
    assert results[1].status == "skipped_duplicate"


def test_fetch_linkedin_job_details_marks_timeout(monkeypatch):
    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def get(self, url):
            raise httpx.ReadTimeout("timed out")

    monkeypatch.setattr(linkedin_detail_service.httpx, "Client", FakeClient)

    results = linkedin_detail_service.fetch_linkedin_job_details([
        {"job_url": "https://www.linkedin.com/jobs/view/1234567890/"}
    ])

    assert len(results) == 1
    assert results[0].status == "timeout"


def test_fetch_linkedin_job_details_marks_http_error(monkeypatch):
    request = httpx.Request("GET", "https://www.linkedin.com/jobs/view/1234567890/")

    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def get(self, url):
            response = httpx.Response(429, request=request)
            raise httpx.HTTPStatusError("too many requests", request=request, response=response)

    monkeypatch.setattr(linkedin_detail_service.httpx, "Client", FakeClient)

    results = linkedin_detail_service.fetch_linkedin_job_details([
        {"job_url": "https://www.linkedin.com/jobs/view/1234567890/"}
    ])

    assert len(results) == 1
    assert results[0].status == "http_error"
    assert results[0].error == "HTTP 429"
