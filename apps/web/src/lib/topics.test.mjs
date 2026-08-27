import assert from "node:assert/strict";
import {
  ANONYMOUS_TOPIC_OWNER,
  MAX_TOPIC_DESCRIPTION_LENGTH,
  MAX_TOPIC_NAME_LENGTH,
  MAX_TOPICS_PER_OWNER,
  TOPICS_SCHEMA_VERSION,
  addMaterialToTopic,
  createTopic,
  deleteTopic,
  loadTopics,
  removeMaterialFromTopic,
  topicMaterialStatus,
  topicsKey,
  updateTopic,
} from "./topics.ts";

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const base = { name: "注意力机制专题", description: "SENet 与相关论文", color: "#3E5C50" };

assert.notEqual(topicsKey("user-a"), topicsKey("user-b"));
assert.match(topicsKey("a/b"), /a%2Fb$/);
assert.match(topicsKey(null), new RegExp(`${ANONYMOUS_TOPIC_OWNER}$`));
const topic = createTopic(storage, "user-a", base, {
  now: () => "2026-08-25T00:00:00.000Z", createId: () => "topic-1",
});
assert.equal(topic.schema_version, TOPICS_SCHEMA_VERSION);
assert.equal(topic.owner_id, "user-a");
assert.equal(topic.name, base.name);
assert.deepEqual(topic.material_ids, []);
assert.equal(loadTopics(storage, "user-a").length, 1);
assert.equal(loadTopics(storage, "user-b").length, 0);
assert.equal(loadTopics(storage, null).length, 0);
createTopic(storage, null, { name: "匿名专题" }, { createId: () => "anonymous-1" });
assert.equal(loadTopics(storage, null).length, 1);
assert.equal(loadTopics(storage, "user-a").length, 1);

const renamed = updateTopic(storage, "user-a", "topic-1", {
  name: "注意力与重标定", description: null, color: null,
}, { now: () => "2026-08-25T01:00:00.000Z" });
assert.equal(renamed.name, "注意力与重标定");
assert.equal(renamed.description, undefined);
assert.equal(renamed.color, undefined);
assert.equal(renamed.created_at, "2026-08-25T00:00:00.000Z");
assert.equal(renamed.updated_at, "2026-08-25T01:00:00.000Z");
assert.equal(updateTopic(storage, "user-b", "topic-1", { name: "越权" }), null);
assert.equal(deleteTopic(storage, "user-b", "topic-1"), false);
assert.equal(deleteTopic(storage, "user-a", "missing"), false);

const withMaterial = addMaterialToTopic(storage, "user-a", "topic-1", "senet-cvpr-2018", {
  now: () => "2026-08-25T02:00:00.000Z",
});
assert.deepEqual(withMaterial.material_ids, ["senet-cvpr-2018"]);
const deduped = addMaterialToTopic(storage, "user-a", "topic-1", "senet-cvpr-2018");
assert.deepEqual(deduped.material_ids, ["senet-cvpr-2018"]);
assert.equal(deduped.updated_at, "2026-08-25T02:00:00.000Z");
addMaterialToTopic(storage, "user-a", "topic-1", "paper-b");
assert.deepEqual(loadTopics(storage, "user-a")[0].material_ids, ["senet-cvpr-2018", "paper-b"]);
assert.equal(addMaterialToTopic(storage, "user-b", "topic-1", "paper-c"), null);
assert.throws(() => addMaterialToTopic(storage, "user-a", "topic-1", "  "));

const removed = removeMaterialFromTopic(storage, "user-a", "topic-1", "senet-cvpr-2018", {
  now: () => "2026-08-25T03:00:00.000Z",
});
assert.deepEqual(removed.material_ids, ["paper-b"]);
assert.equal(removed.updated_at, "2026-08-25T03:00:00.000Z");
const noop = removeMaterialFromTopic(storage, "user-a", "topic-1", "not-there");
assert.deepEqual(noop.material_ids, ["paper-b"]);
assert.equal(removeMaterialFromTopic(storage, "user-a", "missing-topic", "paper-b"), null);

assert.equal(topicMaterialStatus("paper-b", [{ id: "paper-b" }]), "available");
assert.equal(topicMaterialStatus("paper-b", []), "missing_material");
assert.equal(topicMaterialStatus("deleted-paper", [{ id: "paper-b" }]), "missing_material");

assert.throws(() => createTopic(storage, "user-a", { name: "  " }));
assert.throws(() => createTopic(storage, "user-a", { name: "x".repeat(MAX_TOPIC_NAME_LENGTH + 1) }));
assert.throws(() => updateTopic(storage, "user-a", "topic-1", { name: "" }));
const truncated = createTopic(storage, "user-t", {
  name: "描述截断", description: "x".repeat(MAX_TOPIC_DESCRIPTION_LENGTH + 10),
});
assert.equal(truncated.description.length, MAX_TOPIC_DESCRIPTION_LENGTH);
assert.throws(() => createTopic(storage, "user-a", { name: "ok" }, { createId: () => "topic-1" }));

values.set(topicsKey("broken"), "{not-json");
assert.deepEqual(loadTopics(storage, "broken"), []);
values.set(topicsKey("old"), JSON.stringify({ schema_version: 0, owner_id: "old", topics: [topic] }));
assert.deepEqual(loadTopics(storage, "old"), []);
values.set(topicsKey("mismatch"), JSON.stringify({ schema_version: 1, owner_id: "other", topics: [topic] }));
assert.deepEqual(loadTopics(storage, "mismatch"), []);

const tainted = {
  ...topic,
  id: "tainted-topic",
  owner_id: "tainted",
  description: "  保留描述  ",
  color: "#A1B2C3",
  material_ids: ["mat-1", "mat-1", "", "mat-2", 42, null],
  token: "forbidden-token-sentinel",
  answer_guide: "forbidden-answer-guide-sentinel",
};
values.set(topicsKey("tainted"), JSON.stringify({
  schema_version: 1,
  owner_id: "tainted",
  topics: [tainted],
}));
const sanitizedLoaded = loadTopics(storage, "tainted");
assert.equal(sanitizedLoaded.length, 1);
assert.equal("token" in sanitizedLoaded[0], false);
assert.equal("answer_guide" in sanitizedLoaded[0], false);
assert.equal(sanitizedLoaded[0].color, "#a1b2c3");
assert.deepEqual(sanitizedLoaded[0].material_ids, ["mat-1", "mat-2"]);
assert.equal(JSON.stringify(sanitizedLoaded).includes("forbidden"), false);

const badColor = { ...topic, id: "bad-color", owner_id: "bad", color: "javascript:alert(1)" };
values.set(topicsKey("bad"), JSON.stringify({ schema_version: 1, owner_id: "bad", topics: [badColor] }));
assert.equal(loadTopics(storage, "bad").length, 0);

const limitedValues = new Map();
const limitedStorage = { getItem: (key) => limitedValues.get(key) ?? null,
  setItem: (key, value) => limitedValues.set(key, value) };
limitedValues.set(topicsKey("full"), JSON.stringify({
  schema_version: 1, owner_id: "full",
  topics: Array.from({ length: MAX_TOPICS_PER_OWNER }, (_, index) => ({
    ...topic, id: `topic-${index}`, owner_id: "full",
  })),
}));
assert.throws(() => createTopic(limitedStorage, "full", { name: "超出上限" }));
assert.equal(deleteTopic(storage, "user-a", "topic-1"), true);
assert.deepEqual(loadTopics(storage, "user-a"), []);
assert.equal(loadTopics(storage, null).length, 1);

console.log("topics: 60 assertions passed");
