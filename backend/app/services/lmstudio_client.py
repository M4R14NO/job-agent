import os
from typing import Any

import httpx
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI


LMSTUDIO_BASE_URL = os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234")
LMSTUDIO_TIMEOUT = float(os.getenv("LMSTUDIO_TIMEOUT", "30"))
LMSTUDIO_EMBEDDING_MODEL = os.getenv("LMSTUDIO_EMBEDDING_MODEL", "text-embedding-3-small")


def _get_client(timeout: float | None = None) -> httpx.Client:
    return httpx.Client(base_url=LMSTUDIO_BASE_URL, timeout=timeout or LMSTUDIO_TIMEOUT)


def _to_langchain_messages(messages: list[dict[str, str]]) -> list[SystemMessage | HumanMessage | AIMessage]:
    converted: list[SystemMessage | HumanMessage | AIMessage] = []
    for message in messages:
        role = (message.get("role") or "user").strip().lower()
        content = message.get("content") or ""
        if role == "system":
            converted.append(SystemMessage(content=content))
        elif role == "assistant":
            converted.append(AIMessage(content=content))
        else:
            converted.append(HumanMessage(content=content))
    return converted


def _normalize_response_format_for_lmstudio(response_format: dict | None) -> dict | None:
    """LM Studio does not accept OpenAI's legacy json_object mode.

    Keep schema-mode formatting when explicitly requested and otherwise rely on
    prompt-level JSON instructions.
    """
    if not response_format:
        return None
    fmt_type = str(response_format.get("type") or "").strip().lower()
    if fmt_type in {"json_schema", "text"}:
        return response_format
    return None


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
    response_format: dict | None = None,
    timeout: float | None = None,
) -> str:
    llm = ChatOpenAI(
        model=model,
        base_url=f"{LMSTUDIO_BASE_URL}/v1",
        api_key=os.getenv("LMSTUDIO_API_KEY", "lm-studio"),
        temperature=temperature,
        timeout=timeout or LMSTUDIO_TIMEOUT,
        max_tokens=max_tokens,
    )
    normalized_response_format = _normalize_response_format_for_lmstudio(response_format)
    if normalized_response_format:
        llm = llm.bind(response_format=normalized_response_format)

    result = llm.invoke(_to_langchain_messages(messages))
    content = result.content
    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, list):
        text = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        ).strip()
    else:
        text = str(content).strip()

    if not text:
        raise ValueError("LMStudio response content is empty")
    return text


def safe_request(fn, *args, **kwargs) -> tuple[Any | None, str | None]:
    try:
        return fn(*args, **kwargs), None
    except Exception as exc:
        return None, str(exc)
