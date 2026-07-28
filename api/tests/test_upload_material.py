from fastapi.testclient import TestClient

from api import index


def test_short_markdown_upload_builds_a_readable_learning_flow(monkeypatch):
    """A valid short upload must not lead the learner to an empty read stage."""
    client = TestClient(index.app)
    original_materials = dict(index.store._materials)
    original_sessions = dict(index.store._sessions)
    original_chunks = dict(index.store._chunks)

    try:
        # The Vercel entry point keeps an in-process store while warm.  Start
        # from the built-in material so this regression test is repeatable.
        index.store._materials = {"senet-cvpr-2018": index.SENET_MATERIAL}
        index.store._sessions = {}
        index.store._chunks = {}
        uploaded = client.post(
            "/api/materials/upload",
            files={
                "file": (
                    "chain-rule.md",
                    b"# Chain Rule\n\nFor h(x)=f(g(x)), h'(x)=f'(g(x))g'(x). "
                    b"For sin(x^3), the derivative is cos(x^3)*3x^2.",
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

        started = client.post(
            "/api/sessions",
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
            json={
                "answers": [
                    {"question_id": question["id"], "response": "链式法则需要外层导数乘以内层导数。"}
                    for question in material["questions"]
                ],
                "retelling": "先识别外层与内层，再保留内层并乘以内层的导数。",
                "material_id": material["id"],
                "persona_id": "huangfeng",
                "questions": material["questions"],
            },
        )
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "completed"
        assert completed.json()["material_id"] == material["id"]
        assert completed.json()["result"]["mastery"] == 88
    finally:
        index.store._materials = original_materials
        index.store._sessions = original_sessions
        index.store._chunks = original_chunks
