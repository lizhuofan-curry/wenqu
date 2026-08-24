from __future__ import annotations

from pathlib import Path
from urllib.request import Request, urlopen

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]


def _normalize_expression(value: str | None) -> str:
    return "".join((value or "").lower().split())


def _assert_owner_expression(
    expression: str | None,
    *,
    policy_name: str,
    owner_column: str,
) -> None:
    normalized = _normalize_expression(expression)
    owner_comparison = (
        f"={owner_column}" in normalized or f"{owner_column}=" in normalized
    )
    if "auth.uid()" not in normalized or not owner_comparison:
        raise RuntimeError(
            f"RLS 策略 {policy_name} 未按当前账号限制 {owner_column}：{expression}"
        )


def main() -> None:
    values = dotenv_values(ROOT / ".env.local")
    database_url = values.get("POSTGRES_URL_NON_POOLING") or values.get(
        "POSTGRES_URL"
    )
    if not database_url:
        raise RuntimeError("未找到 Supabase 数据库连接。")
    supabase_url = values.get("SUPABASE_URL") or values.get(
        "NEXT_PUBLIC_SUPABASE_URL"
    )
    publishable_key = (
        values.get("SUPABASE_PUBLISHABLE_KEY")
        or values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or values.get("SUPABASE_ANON_KEY")
    )
    if not supabase_url or not publishable_key:
        raise RuntimeError("未找到 Supabase Auth 公开配置。")

    with psycopg.connect(database_url) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute("set transaction read only")
                cursor.execute(
                    """
                    select c.relname, c.relrowsecurity, c.relforcerowsecurity
                    from pg_class c
                    join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public'
                      and c.relname in (
                        'profiles',
                        'study_records',
                        'materials',
                        'ai_quota_usage'
                      )
                    order by c.relname
                    """
                )
                tables = cursor.fetchall()
                cursor.execute(
                    """
                    select tablename, policyname, roles, cmd, qual, with_check
                    from pg_policies
                    where schemaname = 'public'
                      and tablename in (
                        'profiles',
                        'study_records',
                        'materials',
                        'ai_quota_usage'
                      )
                    order by tablename, policyname
                    """
                )
                policies = cursor.fetchall()
                cursor.execute(
                    """
                    select data_type, is_nullable
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'materials'
                      and column_name = 'user_id'
                    """
                )
                materials_owner_column = cursor.fetchone()
                cursor.execute(
                    """
                    select confdeltype
                    from pg_constraint
                    where conrelid = 'public.materials'::regclass
                      and conname = 'materials_user_id_fkey'
                      and contype = 'f'
                    """
                )
                materials_owner_fk = cursor.fetchone()
                cursor.execute(
                    """
                    select pg_get_constraintdef(oid)
                    from pg_constraint
                    where conrelid = 'public.materials'::regclass
                      and conname = 'materials_reserved_id_check'
                      and contype = 'c'
                    """
                )
                materials_reserved_id_constraint = cursor.fetchone()
                cursor.execute(
                    """
                    select indexname
                    from pg_indexes
                    where schemaname = 'public'
                      and tablename = 'materials'
                    """
                )
                material_indexes = {row[0] for row in cursor.fetchall()}
                cursor.execute(
                    """
                    select conname, pg_get_constraintdef(oid)
                    from pg_constraint
                    where conrelid = 'public.ai_quota_usage'::regclass
                      and conname in (
                        'ai_quota_usage_action_check',
                        'ai_quota_usage_count_check'
                      )
                    order by conname
                    """
                )
                quota_constraints = dict(cursor.fetchall())
                cursor.execute(
                    """
                    select indexname
                    from pg_indexes
                    where schemaname = 'public'
                      and tablename = 'ai_quota_usage'
                    """
                )
                quota_indexes = {row[0] for row in cursor.fetchall()}
                cursor.execute(
                    """
                    select p.prosecdef, p.proconfig, owner_role.rolname
                    from pg_proc p
                    join pg_roles owner_role on owner_role.oid = p.proowner
                    where p.oid = to_regprocedure(
                      'public.consume_ai_quota(uuid,text)'
                    )
                    """
                )
                quota_function = cursor.fetchone()
                cursor.execute(
                    """
                    select
                      coalesce(grantee_role.rolname, 'PUBLIC') as grantee,
                      acl.privilege_type
                    from pg_proc p
                    cross join lateral aclexplode(
                      coalesce(p.proacl, acldefault('f', p.proowner))
                    ) acl
                    left join pg_roles grantee_role
                      on grantee_role.oid = acl.grantee
                    where p.oid = to_regprocedure(
                      'public.consume_ai_quota(uuid,text)'
                    )
                    """
                )
                quota_function_acl = set(cursor.fetchall())
                cursor.execute(
                    """
                    select
                      coalesce(grantee_role.rolname, 'PUBLIC') as grantee,
                      acl.privilege_type
                    from pg_class c
                    cross join lateral aclexplode(
                      coalesce(c.relacl, acldefault('r', c.relowner))
                    ) acl
                    left join pg_roles grantee_role
                      on grantee_role.oid = acl.grantee
                    where c.oid = 'public.ai_quota_usage'::regclass
                    """
                )
                quota_table_acl = set(cursor.fetchall())
                cursor.execute(
                    """
                    select
                      has_table_privilege('anon', 'public.materials', 'SELECT'),
                      has_table_privilege(
                        'authenticated', 'public.materials', 'SELECT'
                      ),
                      has_table_privilege(
                        'authenticated', 'public.materials', 'INSERT'
                      ),
                      has_table_privilege(
                        'authenticated', 'public.materials', 'UPDATE'
                      ),
                      has_table_privilege(
                        'authenticated', 'public.materials', 'DELETE'
                      ),
                      has_table_privilege(
                        'service_role', 'public.materials', 'SELECT'
                      ),
                      has_table_privilege(
                        'service_role', 'public.materials', 'INSERT'
                      ),
                      has_table_privilege(
                        'service_role', 'public.materials', 'UPDATE'
                      ),
                      has_table_privilege(
                        'service_role', 'public.materials', 'DELETE'
                      )
                    """
                )
                material_privileges = cursor.fetchone()
                cursor.execute(
                    """
                    select
                      coalesce(grantee_role.rolname, 'PUBLIC') as grantee,
                      acl.privilege_type
                    from pg_class c
                    cross join lateral aclexplode(
                      coalesce(c.relacl, acldefault('r', c.relowner))
                    ) acl
                    left join pg_roles grantee_role
                      on grantee_role.oid = acl.grantee
                    where c.oid = 'public.study_records'::regclass
                      and coalesce(grantee_role.rolname, 'PUBLIC') in (
                        'PUBLIC', 'anon', 'authenticated', 'service_role'
                      )
                    """
                )
                study_record_privileges = set(cursor.fetchall())
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
                      count(*) filter (
                        where email_confirmed_at is not null
                      )::integer
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

    expected_tables = [
        ("ai_quota_usage", True, True),
        ("materials", True, True),
        ("profiles", True, True),
        ("study_records", True, True),
    ]
    if tables != expected_tables:
        raise RuntimeError(f"表或 RLS/Force RLS 状态异常：{tables}")

    expected_policies = {
        ("profiles", "profiles_select_own"): ("SELECT", "id", True, False),
        ("profiles", "profiles_update_own"): ("UPDATE", "id", True, True),
        ("study_records", "records_select_own"): (
            "SELECT",
            "user_id",
            True,
            False,
        ),
        ("materials", "materials_select_own"): (
            "SELECT",
            "user_id",
            True,
            False,
        ),
        ("materials", "materials_insert_own"): (
            "INSERT",
            "user_id",
            False,
            True,
        ),
        ("materials", "materials_update_own"): (
            "UPDATE",
            "user_id",
            True,
            True,
        ),
        ("materials", "materials_delete_own"): (
            "DELETE",
            "user_id",
            True,
            False,
        ),
    }
    actual_policy_keys = {(row[0], row[1]) for row in policies}
    if actual_policy_keys != set(expected_policies):
        raise RuntimeError(f"RLS 策略集合异常：{sorted(actual_policy_keys)}")
    for table, name, roles, command, using, with_check in policies:
        expected_command, owner_column, needs_using, needs_check = expected_policies[
            (table, name)
        ]
        if roles != ["authenticated"] or command != expected_command:
            raise RuntimeError(
                f"RLS 策略 {name} 的角色或操作异常：{roles}, {command}"
            )
        if needs_using:
            _assert_owner_expression(
                using,
                policy_name=name,
                owner_column=owner_column,
            )
        elif using is not None:
            raise RuntimeError(f"RLS 策略 {name} 不应设置 USING：{using}")
        if needs_check:
            _assert_owner_expression(
                with_check,
                policy_name=name,
                owner_column=owner_column,
            )
        elif with_check is not None:
            raise RuntimeError(f"RLS 策略 {name} 不应设置 WITH CHECK：{with_check}")

    if materials_owner_column != ("uuid", "YES"):
        raise RuntimeError(f"materials.user_id 列异常：{materials_owner_column}")
    if materials_owner_fk != ("c",):
        raise RuntimeError(
            f"materials.user_id 外键或级联删除异常：{materials_owner_fk}"
        )
    if (
        materials_reserved_id_constraint is None
        or "senet-cvpr-2018" not in materials_reserved_id_constraint[0]
    ):
        raise RuntimeError(
            f"materials 保留 ID 约束异常：{materials_reserved_id_constraint}"
        )
    if "materials_user_id_idx" not in material_indexes:
        raise RuntimeError("materials.user_id 缺少所有者索引。")
    if "ai_quota_usage_pkey" not in quota_indexes:
        raise RuntimeError("AI 配额表缺少原子扣减所需的唯一主键。")
    action_constraint = quota_constraints.get("ai_quota_usage_action_check", "")
    if not all(
        action in action_constraint
        for action in ("evaluate", "upload", "regenerate")
    ):
        raise RuntimeError(f"AI 配额 action 白名单异常：{action_constraint}")
    if "usage_count >= 0" not in quota_constraints.get(
        "ai_quota_usage_count_check", ""
    ):
        raise RuntimeError("AI 配额计数非负约束不存在。")

    if quota_function is None:
        raise RuntimeError("AI 配额原子消费函数不存在。")
    function_is_security_definer, function_config, function_owner = quota_function
    if not function_is_security_definer or not any(
        setting.startswith("search_path=") for setting in (function_config or [])
    ):
        raise RuntimeError("AI 配额函数缺少 security definer 或固定 search_path。")
    function_execute_grantees = {
        grantee for grantee, privilege in quota_function_acl if privilege == "EXECUTE"
    }
    if "service_role" not in function_execute_grantees:
        raise RuntimeError("service_role 没有 AI 配额函数执行权限。")
    forbidden_function_grantees = {"PUBLIC", "anon", "authenticated"}
    unexpected_function_grantees = function_execute_grantees & forbidden_function_grantees
    if unexpected_function_grantees:
        raise RuntimeError(
            f"AI 配额函数错误暴露给：{sorted(unexpected_function_grantees)}"
        )
    allowed_function_grantees = {function_owner, "service_role"}
    if not function_execute_grantees <= allowed_function_grantees:
        raise RuntimeError(
            f"AI 配额函数存在额外执行者：{sorted(function_execute_grantees)}"
        )

    quota_table_grantees = {grantee for grantee, _privilege in quota_table_acl}
    forbidden_quota_table_grantees = {
        "PUBLIC",
        "anon",
        "authenticated",
        "service_role",
    }
    unexpected_quota_table_grantees = (
        quota_table_grantees & forbidden_quota_table_grantees
    )
    if unexpected_quota_table_grantees:
        raise RuntimeError(
            "AI 配额表存在绕过 RPC 的直接权限："
            f"{sorted(unexpected_quota_table_grantees)}"
        )
    if material_privileges != (
        False,
        False,
        False,
        False,
        False,
        True,
        True,
        True,
        True,
    ):
        raise RuntimeError(f"materials 表权限异常：{material_privileges}")
    expected_study_record_privileges = {
        ("authenticated", "SELECT"),
        ("service_role", "SELECT"),
        ("service_role", "INSERT"),
    }
    if study_record_privileges != expected_study_record_privileges:
        raise RuntimeError(
            "study_records 表权限异常："
            f"{sorted(study_record_privileges)}"
        )
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
        "Supabase 验证通过：Auth 可用，4 张表启用并强制 RLS，"
        "7 条账号隔离策略、服务端独占档案写入、材料所有者索引与 AI 原子配额均正常。"
    )
    print(f"账号统计：共 {total_users} 个，已确认邮箱 {confirmed_users} 个。")
    print(
        "最新注册账号状态："
        f"{'邮箱已确认' if latest_user_confirmed else '等待邮箱确认'}。"
    )


if __name__ == "__main__":
    main()
