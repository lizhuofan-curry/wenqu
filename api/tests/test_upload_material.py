from fastapi.testclient import TestClient

from api import index

AUTH = {"Authorization": "Bearer test-token"}


def _enable_authenticated_user(monkeypatch):
    monkeypatch.setattr(
        index,
        "_verify_access_token",
        lambda token: "test-user" if token == "test-token" else None,
    )
    monkeypatch.setattr(index, "_supa_ok", lambda: False)
    monkeypatch.setattr(index, "_consume_ai_quota", lambda _user_id, _action: True)


def test_short_markdown_upload_builds_a_readable_learning_flow(monkeypatch):
    """A valid short upload must not lead the learner to an empty read stage."""
    client = TestClient(index.app)
    original_materials = dict(index.store._materials)
    original_sessions = dict(index.store._sessions)
    original_chunks = dict(index.store._chunks)

    try:
        _enable_authenticated_user(monkeypatch)
        # The Vercel entry point keeps an in-process store while warm.  Start
        # from the built-in material so this regression test is repeatable.
        index.store._materials = {"senet-cvpr-2018": index.SENET_MATERIAL}
        index.store._sessions = {}
        index.store._chunks = {}
        uploaded = client.post(
            "/api/materials/upload",
            headers=AUTH,
            files={
                "file": (
                    "chain-rule.md",
                    (b"# Chain Rule\n\nFor h(x)=f(g(x)), h'(x)=f'(g(x))g'(x). "
                    b"For sin(x^3), the derivative is cos(x^3)*3x^2."),
                    "text/markdown",
                )
            },
        )

        assert uploaded.status_code == 201, uploaded.text
        material = uploaded.json()
        assert len(material["map"]) == 5
        assert len(material["sections"]) == 1
        assert material["sections"][0]["strict_track"]
        assert len(material["questions"]) == 3
        assert material["generation"]["status"] == "fallback"
        assert index.store.get_chunks(material["id"], "test-user")
        assert "embedding" not in index.store.get_chunks(material["id"], "test-user")[0]

        started = client.post(
            "/api/sessions",
            headers=AUTH,
            json={
                "material_id": material["id"],
                "persona_id": "huangfeng",
                "questions": material["questions"],
            },
        )
        assert started.status_code == 201, started.text

        async def fake_ai_evaluation(*_args, **_kwargs):
            return {
                "mastery": 88,
                "headline": "链式法则的外层与内层关系清楚。",
                "question_results": [
                    {
                        "question_id": question["id"],
                        "verdict": "掌握",
                        "score": question.get("max_score", 4),
                        "max_score": question.get("max_score", 4),
                        "misconception_tags": [],
                        "feedback": "测试替身确认了评分接口的结构。",
                    }
                    for question in material["questions"]
                ],
                "retelling": {"score": 5, "max_score": 5, "verdict": "掌握"},
                "misconception_tags": [],
                "next_step": "继续练习更多复合函数。",
                "evaluator": "ai",
            }

        monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only")
        monkeypatch.setattr(index, "evaluate_with_deepseek", fake_ai_evaluation)
        completed = client.post(
            f"/api/sessions/{started.json()['id']}/evaluate",
            headers=AUTH,
            json={
                "answers": [
                    {"question_id": question["id"], "response": "链式法则需要外层导数乘以内层导数。"}
                    for question in material["questions"]
                ],
                "retelling": "先识别外层与内层，再保留内层并乘以内层的导数。",
                "material_id": material["id"],
                "persona_id": "huangfeng",
                "questions": material["questions"],
                "expected_user_id": "test-user",
            },
        )
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "completed"
        assert completed.json()["material_id"] == material["id"]
        assert completed.json()["result"]["mastery"] == 100
        assert completed.json()["result"]["evaluator"] == "ai"
    finally:
        index.store._materials = original_materials
        index.store._sessions = original_sessions
        index.store._chunks = original_chunks


def test_uploaded_material_keeps_source_chunks_without_embedding_call(monkeypatch):
    """A first upload must not queue a second remote embedding request."""
    client = TestClient(index.app)
    original_materials = dict(index.store._materials)
    original_chunks = dict(index.store._chunks)

    def must_not_embed(_texts):
        raise AssertionError("upload must not call the embedding provider")

    try:
        _enable_authenticated_user(monkeypatch)
        index.store._materials = {"senet-cvpr-2018": index.SENET_MATERIAL}
        index.store._chunks = {}
        monkeypatch.setattr(index, "_embed_texts", must_not_embed)
        uploaded = client.post(
            "/api/materials/upload",
            headers=AUTH,
            files={
                "file": (
                    "notes.md",
                    b"# Gradient descent\n\nGradient descent updates parameters in the direction that reduces the loss function.",
                    "text/markdown",
                )
            },
        )

        assert uploaded.status_code == 201, uploaded.text
        material_id = uploaded.json()["id"]
        assert index.store.get_chunks(material_id, "test-user")
    finally:
        index.store._materials = original_materials
        index.store._chunks = original_chunks


def test_local_source_selection_prefers_relevant_excerpt_without_embedding():
    """Scoring evidence selection stays local and favors the answered concept."""
    excerpts = index._select_source_chunks(
        "链式法则需要保留内层并乘以内层导数。",
        [
            {"text": "极限描述函数在某点附近的变化趋势。"},
            {"text": "链式法则要求保留内层函数，并乘以内层的导数。"},
        ],
        top_k=1,
    )

    assert excerpts == ["链式法则要求保留内层函数，并乘以内层的导数。"]


def test_uploaded_material_can_be_deleted_but_builtin_material_is_protected(monkeypatch):
    client = TestClient(index.app)
    original_materials = dict(index.store._materials)
    original_chunks = dict(index.store._chunks)
    try:
        _enable_authenticated_user(monkeypatch)
        index.store._materials = {
            "senet-cvpr-2018": index.SENET_MATERIAL,
            "upload-test-delete": {
                "id": "upload-test-delete",
                "title": "待删除测试材料",
                "source_type": "markdown",
                "_owner_id": "test-user",
            },
        }
        index.store._chunks = {"upload-test-delete": [{"text": "temporary"}]}

        deleted = client.delete("/api/materials/upload-test-delete", headers=AUTH)
        assert deleted.status_code == 200, deleted.text
        assert deleted.json() == {"deleted": "upload-test-delete"}
        assert index.store.get_material("upload-test-delete", "test-user") is None
        assert index.store.get_chunks("upload-test-delete", "test-user") == []

        protected = client.delete("/api/materials/senet-cvpr-2018", headers=AUTH)
        assert protected.status_code == 403, protected.text
    finally:
        index.store._materials = original_materials
        index.store._chunks = original_chunks
