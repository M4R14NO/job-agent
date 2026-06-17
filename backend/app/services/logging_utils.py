import uuid
from typing import Any


_SENSITIVE_VALUE_KEYS = {
    "canonical_payload",
    "email",
    "job_description",
    "phone",
    "profile_image",
    "raw_resume_text",
    "resume_text",
    "text",
}


def build_pii_safe_log_extra(
    *,
    error: Exception,
    payload: Any = None,
    request_id: str | None = None,
    profile_id: str | None = None,
) -> dict[str, Any]:
    """Build structured metadata without user-provided values.

    This intentionally logs types, key names, and counts only.
    """
    extra: dict[str, Any] = {
        "request_id": request_id or uuid.uuid4().hex,
        "error_class": error.__class__.__name__,
    }
    if isinstance(profile_id, str) and profile_id.strip():
        extra["profile_id"] = profile_id.strip()

    if isinstance(payload, dict):
        keys = sorted(str(key) for key in payload.keys())
        extra["payload_type"] = "dict"
        extra["payload_key_count"] = len(keys)
        extra["payload_keys"] = keys[:30]
        sensitive_keys_present = sorted(key for key in keys if key in _SENSITIVE_VALUE_KEYS)
        if sensitive_keys_present:
            extra["sensitive_keys_present"] = sensitive_keys_present
    elif isinstance(payload, list):
        extra["payload_type"] = "list"
        extra["payload_item_count"] = len(payload)
    elif payload is not None:
        extra["payload_type"] = type(payload).__name__

    return extra
