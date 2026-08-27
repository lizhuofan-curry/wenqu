from copy import deepcopy

from api import index


def test_seed_senet_does_not_replace_existing_builtin_material():
    store = index.MemStore()
    builtin = deepcopy(index.SENET_MATERIAL)
    forged = {
        "id": "senet-cvpr-2018",
        "title": "forged replacement",
        "_owner_id": "user-a",
    }

    store.seed_senet(builtin)
    store.seed_senet(forged)

    assert store._materials["senet-cvpr-2018"] is builtin
    assert store._materials["senet-cvpr-2018"]["title"] == index.SENET_MATERIAL["title"]
    assert "_owner_id" not in store._materials["senet-cvpr-2018"]


def test_supabase_payload_cannot_replace_builtin_material(monkeypatch):
    original_materials = index.store._materials
    builtin = deepcopy(index.SENET_MATERIAL)
    index.store._materials = {"senet-cvpr-2018": builtin}
    requested_paths: list[str] = []

    def fake_supa_get(path: str):
        requested_paths.append(path)
        return [
            {
                "user_id": "user-a",
                "payload_json": {
                    "id": "senet-cvpr-2018",
                    "title": "forged cloud replacement",
                    "_owner_id": "user-a",
                },
            }
        ]

    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    monkeypatch.setattr(index, "_supa_get", fake_supa_get)

    try:
        index._load_supa_materials("user-a")

        assert requested_paths == [
            "materials?select=payload_json,user_id&user_id=eq.user-a&order=created_at.asc"
        ]
        assert index.store._materials["senet-cvpr-2018"] is builtin
        assert index.store._materials["senet-cvpr-2018"]["title"] == index.SENET_MATERIAL["title"]
        assert "_owner_id" not in index.store._materials["senet-cvpr-2018"]
    finally:
        index.store._materials = original_materials


def test_cold_start_restore_rebuilds_source_chunks(monkeypatch):
    """Materials restored from Supabase must regain RAG source excerpts."""
    original_materials = index.store._materials
    original_chunks = index.store._chunks
    index.store._materials = {"senet-cvpr-2018": deepcopy(index.SENET_MATERIAL)}
    index.store._chunks = {}
    payload = {
        "id": "upload-restored",
        "title": "冷启动恢复材料",
        "sections": [
            {"strict_track": "梯度下降沿着损失函数下降的方向逐步更新参数。"},
            {"strict_track": "链式法则要求保留内层函数，并乘以内层的导数。"},
        ],
    }

    def fake_supa_get(path: str):
        assert path.startswith("materials?")
        return [{"user_id": "user-a", "payload_json": deepcopy(payload)}]

    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    monkeypatch.setattr(index, "_supa_get", fake_supa_get)

    try:
        index._load_supa_materials("user-a")

        assert index.store.get_material("upload-restored", "user-a") is not None
        chunks = index.store.get_chunks("upload-restored", "user-a")
        assert chunks
        assert all("text" in chunk for chunk in chunks)
        assert "链式法则" in "".join(chunk["text"] for chunk in chunks)
    finally:
        index.store._materials = original_materials
        index.store._chunks = original_chunks
