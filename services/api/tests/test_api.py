from __future__ import annotations

from fastapi.testclient import TestClient

from app import main
from app.store import Store


def make_client(tmp_path, monkeypatch) -> TestClient:
    test_store = Store(tmp_path / "test.db")
    monkeypatch.setattr(main, "store", test_store)
    return TestClient(main.app)


def test_health_and_builtin_material(tmp_path, monkeypatch):
    with make_client(tmp_path, monkeypatch) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"
        assert health.json()["version"] == "v.5"

        materials = client.get("/api/materials")
        assert materials.status_code == 200
        assert materials.json()[0]["id"] == "senet-cvpr-2018"

        material = client.get("/api/materials/senet-cvpr-2018")
        assert material.status_code == 200
        assert len(material.json()["questions"]) == 3
        assert "answer_guide" not in material.text


def test_complete_senet_learning_loop(tmp_path, monkeypatch):
    with make_client(tmp_path, monkeypatch) as client:
        session = client.post(
            "/api/sessions",
            json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
        )
        assert session.status_code == 201
        session_id = session.json()["id"]

        result = client.post(
            f"/api/sessions/{session_id}/evaluate",
            json={
                "answers": [
                    {
                        "question_id": "q1",
                        "response": "全局平均池化给每个通道一个全局统计，但丢失空间位置信息。",
                    },
                    {
                        "question_id": "q2",
                        "response": "1×1×256 → 16 → 256 → 32×32×256",
                    },
                    {
                        "question_id": "q3",
                        "response": "选择 B，残差分支先经过 SE，再与 identity 相加。",
                    },
                ],
                "retelling": (
                    "SENet 显式学习通道关系。Squeeze 用全局平均池化压缩每个通道的空间信息。"
                    "Excitation 通过全连接和 sigmoid 生成权重并缩放特征。"
                    "在 ResNet 中 residual 分支先经过 SE，再与 identity 相加。"
                ),
            },
        )
        assert result.status_code == 200
        body = result.json()
        assert body["status"] == "completed"
        assert body["result"]["mastery"] >= 80
        assert body["result"]["evaluator"] == "rules"

        archive = client.get("/api/archive")
        assert archive.status_code == 200
        assert archive.json()[0]["material_title"] == "Squeeze-and-Excitation Networks"


def test_reject_unsupported_upload(tmp_path, monkeypatch):
    with make_client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/materials/upload",
            files={"file": ("notes.txt", b"hello", "text/plain")},
        )
        assert response.status_code == 400
