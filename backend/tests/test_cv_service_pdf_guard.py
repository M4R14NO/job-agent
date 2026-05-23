from app.services.cv_service import _is_pdf_valid


def test_is_pdf_valid_rejects_too_small_payload():
    pdf_bytes = b"%PDF-1.7\nstartxref\n1\n%%EOF\n"

    assert _is_pdf_valid(pdf_bytes) is False


def test_is_pdf_valid_rejects_non_pdf_header():
    pdf_bytes = b"NOTPDF\n" + (b"A" * 1500) + b"\nstartxref\n1\n%%EOF\n"

    assert _is_pdf_valid(pdf_bytes) is False


def test_is_pdf_valid_rejects_missing_required_markers():
    pdf_bytes = b"%PDF-1.7\n" + (b"A" * 1500) + b"\n%%EOF\n"

    assert _is_pdf_valid(pdf_bytes) is False


def test_is_pdf_valid_accepts_payload_with_required_markers():
    pdf_bytes = b"%PDF-1.7\n" + (b"A" * 1500) + b"\nstartxref\n123\n%%EOF\n"

    assert _is_pdf_valid(pdf_bytes) is True