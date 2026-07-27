import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const venvDir = join(root, "services", "api", ".venv");

const candidates = [
  join(venvDir, "Scripts", "python.exe"),
  join(venvDir, "Scripts", "python3.exe"),
  join(venvDir, "bin", "python"),
  join(venvDir, "bin", "python3"),
];

let python = null;
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    python = candidate;
    break;
  }
}

if (!python) {
  console.error("找不到 Python 虚拟环境。请先创建 venv：");
  console.error("  cd services/api && python -m venv .venv && pip install -r requirements.txt");
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync(python, args, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
