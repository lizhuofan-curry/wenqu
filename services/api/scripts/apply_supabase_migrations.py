from __future__ import annotations

import hashlib
from pathlib import Path

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT / ".env.local"
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"


def load_database_url() -> str:
    values = dotenv_values(ENV_FILE)
    database_url = values.get("POSTGRES_URL_NON_POOLING") or values.get("POSTGRES_URL")
    if not database_url:
        raise RuntimeError("未在 .env.local 中找到 Supabase 数据库连接。")
    return database_url


def main() -> None:
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        raise RuntimeError("没有找到可执行的 Supabase 迁移文件。")

    applied = 0
    with psycopg.connect(load_database_url(), autocommit=False) as connection:
        with connection.cursor() as cursor:
            cursor.execute("create schema if not exists wenqu_migrations")
            cursor.execute(
                """
                create table if not exists wenqu_migrations.schema_migrations (
                  version text primary key,
                  checksum text not null,
                  applied_at timestamptz not null default now()
                )
                """
            )
            connection.commit()

            for migration_file in migration_files:
                sql = migration_file.read_text(encoding="utf-8")
                checksum = hashlib.sha256(sql.encode("utf-8")).hexdigest()
                cursor.execute(
                    "select checksum from wenqu_migrations.schema_migrations where version = %s",
                    (migration_file.stem,),
                )
                row = cursor.fetchone()
                if row:
                    if row[0] != checksum:
                        raise RuntimeError(
                            f"已执行迁移 {migration_file.name} 的内容发生变化，请新建迁移。"
                        )
                    print(f"跳过已执行迁移：{migration_file.name}")
                    continue

                cursor.execute(sql)
                cursor.execute(
                    """
                    insert into wenqu_migrations.schema_migrations (version, checksum)
                    values (%s, %s)
                    """,
                    (migration_file.stem, checksum),
                )
                connection.commit()
                applied += 1
                print(f"已执行迁移：{migration_file.name}")

    print(f"迁移完成：新执行 {applied} 个版本。")


if __name__ == "__main__":
    main()
