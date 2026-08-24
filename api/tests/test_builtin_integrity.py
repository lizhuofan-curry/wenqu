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
