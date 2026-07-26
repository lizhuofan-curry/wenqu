from __future__ import annotations

from types import SimpleNamespace

from pydantic import BaseModel

from app import ai


class TinyResult(BaseModel):
    answer: str


class FakeChatCompletions:
    def __init__(self) -> None:
        self.kwargs: dict | None = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        message = SimpleNamespace(content='{"answer":"ok"}')
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def test_deepseek_structured_completion_uses_json_mode(monkeypatch):
    completions = FakeChatCompletions()
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=completions),
    )
    monkeypatch.setattr(
        ai,
        "_provider",
        lambda: ("deepseek", client, "deepseek-v4-flash"),
    )

    result, provider = ai._structured_completion(
        TinyResult,
        instructions="返回 JSON。",
        prompt="测试",
        max_tokens=100,
    )

    assert result.answer == "ok"
    assert provider == "deepseek"
    assert completions.kwargs is not None
    assert completions.kwargs["model"] == "deepseek-v4-flash"
    assert completions.kwargs["response_format"] == {"type": "json_object"}
