# Repository structure

```text
.
├─ apps/
│  └─ web/                     # React + TypeScript client
├─ services/
│  └─ api/                     # FastAPI service, AI and persistence
├─ docs/
│  ├─ product/                 # Architecture, UX and V0 definition
│  ├─ progress/                # Versioned progress records
│  ├─ research/
│  │  └─ senet/                # Source notes and learning-pack evidence
│  └─ workflow/                # Durable project workflows
├─ resources/
│  └─ papers/                  # Local source PDFs; ignored by Git
├─ .github/
│  └─ workflows/               # CI automation
├─ AGENTS.md                   # Durable Codex rules
├─ README.md                   # Public repository entrypoint
└─ package.json                # Root developer commands
```

## Rules

- Application code lives only under `apps/` and `services/`.
- Product decisions and research evidence live under `docs/`.
- Every meaningful release adds a new `docs/progress/v.x.md`; old versions are never overwritten.
- `docs/progress/current.md` is the live status snapshot.
- Original papers and private user files stay under `resources/` and are not committed.
- Secrets stay in `.env.local`, which is never committed.

