import os
from typing import Any

import httpx


LMSTUDIO_BASE_URL = os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234")
LMSTUDIO_TIMEOUT = float(os.getenv("LMSTUDIO_TIMEOUT", "30"))
LMSTUDIO_EMBEDDING_MODEL = os.getenv("LMSTUDIO_EMBEDDING_MODEL", "text-embedding-3-small")


def _get_client() -> httpx.Client:
    return httpx.Client(base_url=LMSTUDIO_BASE_URL, timeout=LMSTUDIO_TIMEOUT)


def list_models() -> list[str]:
    with _get_client() as client:
        response = client.get("/v1/models")
        response.raise_for_status()
        payload = response.json()

    data = payload.get("data", []) if isinstance(payload, dict) else []
    return [item.get("id") for item in data if isinstance(item, dict) and item.get("id")]


def create_embeddings(texts: list[str], model: str | None = None) -> list[list[float]]:
    if not texts:
        return []

    with _get_client() as client:
        response = client.post(
            "/v1/embeddings",
            json={
                "model": model or LMSTUDIO_EMBEDDING_MODEL,
                "input": texts,
            },
        )
        response.raise_for_status()
        payload = response.json()

    data = payload.get("data", []) if isinstance(payload, dict) else []
    embeddings = []
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("embedding"), list):
            embeddings.append(item["embedding"])
    return embeddings


def chat_completion(
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.2,
    max_tokens: int = 600,
) -> str:
    with _get_client() as client:
        response = client.post(
            "/v1/chat/completions",
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, dict):
        raise ValueError("LMStudio response is not a JSON object")

    choices = payload.get("choices", [])
    if not choices:
        raise ValueError("LMStudio response has no choices")

    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message", {}) if isinstance(first.get("message"), dict) else {}
    content = message.get("content") if isinstance(message, dict) else ""
    reasoning = message.get("reasoning_content") if isinstance(message, dict) else ""
    if not content:
        content = first.get("text") if isinstance(first.get("text"), str) else ""
    if not content and reasoning:
        raise ValueError("LMStudio returned reasoning-only content; pick a non-reasoning model or disable reasoning")
    if not content:
        raise ValueError("LMStudio response content is empty")
    return content


def safe_request(fn, *args, **kwargs) -> tuple[Any | None, str | None]:
    try:
        return fn(*args, **kwargs), None
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        return None, str(exc)
