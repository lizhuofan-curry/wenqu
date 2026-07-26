from __future__ import annotations

from pathlib import Path
from urllib.request import Request, urlopen

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]


def main() -> None:
    values = dotenv_values(ROOT / ".env.local")
    database_url = values.get("POSTGRES_URL_NON_POOLING") or values.get("POSTGRES_URL")
    if not database_url:
        raise RuntimeError("未找到 Supabase 数据库连接。")
    supabase_url = values.get("SUPABASE_URL") or values.get("NEXT_PUBLIC_SUPABASE_URL")
    publishable_key = (
        values.get("SUPABASE_PUBLISHABLE_KEY")
        or values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or values.get("SUPABASE_ANON_KEY")
    )
    if not supabase_url or not publishable_key:
        raise RuntimeError("未找到 Supabase Auth 公开配置。")

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select c.relname, c.relrowsecurity
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public'
                  and c.relname in ('profiles', 'study_records')
                order by c.relname
                """
            )
            tables = cursor.fetchall()
            cursor.execute(
                """
                select policyname
                from pg_policies
                where schemaname = 'public'
                  and tablename in ('profiles', 'study_records')
                order by policyname
                """
            )
            policies = [row[0] for row in cursor.fetchall()]
            cursor.execute(
                """
                select exists (
                  select 1
                  from pg_trigger
                  where tgname = 'on_auth_user_created'
                    and not tgisinternal
                )
                """
            )
            trigger_exists = cursor.fetchone()[0]
            cursor.execute(
                """
                select
                  count(*)::integer,
                  count(*) filter (where email_confirmed_at is not null)::integer
                from auth.users
                """
            )
            total_users, confirmed_users = cursor.fetchone()
            cursor.execute(
                """
                select email_confirmed_at is not null
                from auth.users
                order by created_at desc
                limit 1
                """
            )
            latest_user = cursor.fetchone()
            latest_user_confirmed = bool(latest_user and latest_user[0])

    expected_tables = [("profiles", True), ("study_records", True)]
    expected_policies = {
        "profiles_select_own",
        "profiles_update_own",
        "records_select_own",
        "records_insert_own",
        "records_update_own",
        "records_delete_own",
    }
    if tables != expected_tables:
        raise RuntimeError(f"表或 RLS 状态异常：{tables}")
    if set(policies) != expected_policies:
        raise RuntimeError(f"RLS 策略异常：{policies}")
    if not trigger_exists:
        raise RuntimeError("新用户建档触发器不存在。")

    auth_request = Request(
        f"{supabase_url.rstrip('/')}/auth/v1/settings",
        headers={"apikey": publishable_key},
    )
    with urlopen(auth_request, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"Supabase Auth 状态异常：HTTP {response.status}")

    print(
        "Supabase 验证通过：Auth 可用，2 张表已启用 RLS，"
        "6 条隔离策略和建档触发器均存在。"
    )
    print(f"账号统计：共 {total_users} 个，已确认邮箱 {confirmed_users} 个。")
    print(
        "最新注册账号状态："
        f"{'邮箱已确认' if latest_user_confirmed else '等待邮箱确认'}。"
    )


if __name__ == "__main__":
    main()
