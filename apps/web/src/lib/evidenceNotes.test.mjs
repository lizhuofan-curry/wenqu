import assert from "node:assert/strict";
import {
  ANONYMOUS_EVIDENCE_OWNER,
  EVIDENCE_NOTES_SCHEMA_VERSION,
  MAX_EVIDENCE_NOTE_LENGTH,
  MAX_EVIDENCE_NOTES_PER_OWNER,
  createEvidenceNote,
  deleteEvidenceNote,
  evidenceNotesKey,
  exportEvidenceNotesJson,
  exportEvidenceNotesMarkdown,
  evidenceNoteLocationStatus,
  loadEvidenceNotes,
  sanitizeEvidenceFilename,
  updateEvidenceNote,
} from "./evidenceNotes.ts";

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const base = {
  material_id: "senet-cvpr-2018", material_title: "SENet / CVPR 2018",
  material_revision: "revision-a", section_id: "scale", section_title: "Scale",
  content_kind: "learner_statement", content: " 这是我的原话，空格也保留。 ",
  source: { label: "CVPR 2018 PDF", detail: "第 3 页，公式 4",
    excerpt: "Scale multiplies channel weights.", verified: true, score: 99 },
};

assert.notEqual(evidenceNotesKey("user-a"), evidenceNotesKey("user-b"));
assert.match(evidenceNotesKey("a/b"), /a%2Fb$/);
assert.match(evidenceNotesKey(null), new RegExp(`${ANONYMOUS_EVIDENCE_OWNER}$`));
const note = createEvidenceNote(storage, "user-a", base, {
  now: () => "2026-08-25T00:00:00.000Z", createId: () => "note-1",
});
assert.equal(note.schema_version, EVIDENCE_NOTES_SCHEMA_VERSION);
assert.equal(note.owner_id, "user-a");
assert.equal(note.content, base.content);
assert.equal(note.status, "not_applicable");
assert.equal("verified" in note.source, false);
assert.equal("score" in note.source, false);
assert.equal(loadEvidenceNotes(storage, "user-a").length, 1);
assert.equal(loadEvidenceNotes(storage, "user-b").length, 0);
assert.equal(loadEvidenceNotes(storage, null).length, 0);
createEvidenceNote(storage, null, { ...base, content: "匿名笔记" }, { createId: () => "anonymous-1" });
assert.equal(loadEvidenceNotes(storage, null).length, 1);
assert.equal(loadEvidenceNotes(storage, "user-a").length, 1);

const updated = updateEvidenceNote(storage, "user-a", "note-1", {
  content_kind: "question_or_hypothesis", content: "这是不是一个假设？",
}, { now: () => "2026-08-25T01:00:00.000Z" });
assert.equal(updated.status, "pending");
assert.equal(updated.created_at, "2026-08-25T00:00:00.000Z");
assert.equal(updated.updated_at, "2026-08-25T01:00:00.000Z");
assert.equal(updateEvidenceNote(storage, "user-b", "note-1", { content: "越权" }), null);
assert.equal(deleteEvidenceNote(storage, "user-b", "note-1"), false);
assert.equal(deleteEvidenceNote(storage, "user-a", "missing"), false);

assert.equal(evidenceNoteLocationStatus(updated, [
  { id: base.material_id, revision: "revision-a", sectionIds: ["scale"] },
]), "available");
assert.equal(evidenceNoteLocationStatus(updated, []), "missing_material");
assert.equal(evidenceNoteLocationStatus(updated, [
  { id: base.material_id, revision: "revision-b", sectionIds: ["scale"] },
]), "stale_location");
assert.equal(evidenceNoteLocationStatus(updated, [
  { id: base.material_id, revision: "revision-a", sectionIds: ["squeeze"] },
]), "stale_location");
assert.throws(() => createEvidenceNote(storage, "user-a", { ...base, content: "  " }));
assert.throws(() => createEvidenceNote(storage, "user-a", {
  ...base, content: "x".repeat(MAX_EVIDENCE_NOTE_LENGTH + 1),
}));
assert.throws(() => createEvidenceNote(storage, "user-a", { ...base, content_kind: "answer" }));
assert.throws(() => createEvidenceNote(storage, "user-a", base, { createId: () => "note-1" }));

values.set(evidenceNotesKey("broken"), "{not-json");
assert.deepEqual(loadEvidenceNotes(storage, "broken"), []);
values.set(evidenceNotesKey("old"), JSON.stringify({ schema_version: 0, owner_id: "old", notes: [note] }));
assert.deepEqual(loadEvidenceNotes(storage, "old"), []);
values.set(evidenceNotesKey("mismatch"), JSON.stringify({ schema_version: 1, owner_id: "other", notes: [note] }));
assert.deepEqual(loadEvidenceNotes(storage, "mismatch"), []);

const tainted = {
  ...note,
  id: "tainted-note",
  owner_id: "tainted",
  score: "forbidden-score-sentinel",
  answer_guide: "forbidden-answer-guide-sentinel",
  token: "forbidden-token-sentinel",
  source: {
    ...note.source,
    hidden_rubric: "forbidden-rubric-sentinel",
  },
};
values.set(evidenceNotesKey("tainted"), JSON.stringify({
  schema_version: 1,
  owner_id: "tainted",
  notes: [tainted],
}));
const sanitizedLoaded = loadEvidenceNotes(storage, "tainted");
assert.equal(sanitizedLoaded.length, 1);
assert.equal("score" in sanitizedLoaded[0], false);
assert.equal("answer_guide" in sanitizedLoaded[0], false);
assert.equal("token" in sanitizedLoaded[0], false);
assert.equal("hidden_rubric" in sanitizedLoaded[0].source, false);
const taintedExport = exportEvidenceNotesJson([tainted], "tainted");
assert.equal(taintedExport.content.includes("forbidden-score-sentinel"), false);
assert.equal(taintedExport.content.includes("forbidden-answer-guide-sentinel"), false);
assert.equal(taintedExport.content.includes("forbidden-token-sentinel"), false);
assert.equal(taintedExport.content.includes("forbidden-rubric-sentinel"), false);

const jsonExport = exportEvidenceNotesJson([updated], "SENet: cards?", "2026-08-25T02:00:00.000Z");
const jsonPayload = JSON.parse(jsonExport.content);
assert.equal(jsonExport.filename, "SENet- cards-.json");
assert.equal("owner_id" in jsonPayload.notes[0], false);
assert.equal(JSON.stringify(jsonPayload).includes("score"), false);
assert.equal(JSON.stringify(jsonPayload).includes("answer_guide"), false);
assert.equal(JSON.stringify(jsonPayload).includes("diagnostic"), false);

const markdownExport = exportEvidenceNotesMarkdown(
  [{ ...updated, content: "<script>alert(1)</script>" }], "SENet / 笔记", "2026-08-25T02:00:00.000Z",
);
assert.equal(markdownExport.filename, "SENet - 笔记.md");
assert.match(markdownExport.content, /来源快照（未认证）/);
assert.doesNotMatch(markdownExport.content, /<script>/);
assert.equal(sanitizeEvidenceFilename("  <>:\"/\\|?*  "), "evidence-notes");

const limitedValues = new Map();
const limitedStorage = { getItem: (key) => limitedValues.get(key) ?? null,
  setItem: (key, value) => limitedValues.set(key, value) };
limitedValues.set(evidenceNotesKey("full"), JSON.stringify({
  schema_version: 1, owner_id: "full",
  notes: Array.from({ length: MAX_EVIDENCE_NOTES_PER_OWNER }, (_, index) => ({
    ...note, id: `note-${index}`, owner_id: "full",
  })),
}));
assert.throws(() => createEvidenceNote(limitedStorage, "full", base));
assert.equal(deleteEvidenceNote(storage, "user-a", "note-1"), true);
assert.deepEqual(loadEvidenceNotes(storage, "user-a"), []);
assert.equal(loadEvidenceNotes(storage, null).length, 1);

console.log("evidence-notes: 50 assertions passed");
