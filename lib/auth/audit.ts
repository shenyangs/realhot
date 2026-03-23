import { randomUUID } from "node:crypto";
import { readLocalDataStore, updateLocalDataStore } from "@/lib/data/local-store";
import { getSupabaseServerClient } from "@/lib/supabase/client";

export interface AuditLogPayload {
  [key: string]: unknown;
}

export interface AuditLogRecord {
  id: string;
  workspaceId?: string;
  workspaceName?: string;
  actorUserId?: string;
  actorDisplayName: string;
  actorEmail?: string;
  entityType: string;
  entityId?: string;
  action: string;
  payload: AuditLogPayload;
  createdAt: string;
}

export interface AuditLogWriteInput {
  workspaceId?: string | null;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  actorEmail?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  payload?: AuditLogPayload;
  createdAt?: string;
}

export interface AuditLogQueryInput {
  actorUserId?: string;
  workspaceId?: string;
  action?: string;
  limit?: number;
}

interface AuditLogRow {
  id: string;
  workspace_id: string | null;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: AuditLogPayload | null;
  created_at: string;
}

function shouldDeduplicate(action: string) {
  return action.endsWith("_viewed");
}

export async function writeAuditLog(input: AuditLogWriteInput) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const payload = input.payload ?? {};
  const supabase = getSupabaseServerClient();
  const actorUserId = input.actorUserId ?? null;
  const entityId = input.entityId ?? null;

  if (shouldDeduplicate(input.action)) {
    if (supabase && actorUserId && entityId) {
      const { data: latest } = await supabase
        .from("audit_logs")
        .select("created_at")
        .eq("actor_user_id", actorUserId)
        .eq("entity_id", entityId)
        .eq("action", input.action)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ created_at: string }>();

      if (latest?.created_at) {
        const distance = Date.parse(createdAt) - Date.parse(latest.created_at);

        if (!Number.isNaN(distance) && distance < 2 * 60 * 1000) {
          return;
        }
      }
    }

    if (!supabase && actorUserId && entityId) {
      const store = await readLocalDataStore();
      const latest = store.auditLogs.find(
        (log) => log.actorUserId === actorUserId && log.entityId === entityId && log.action === input.action
      );

      if (latest?.createdAt) {
        const distance = Date.parse(createdAt) - Date.parse(latest.createdAt);

        if (!Number.isNaN(distance) && distance < 2 * 60 * 1000) {
          return;
        }
      }
    }
  }

  if (supabase) {
    await supabase.from("audit_logs").insert({
      workspace_id: input.workspaceId ?? null,
      actor_user_id: actorUserId,
      entity_type: input.entityType,
      entity_id: entityId,
      action: input.action,
      payload,
      created_at: createdAt
    });

    return;
  }

  await updateLocalDataStore((store) => ({
    ...store,
    auditLogs: [
      {
        id: randomUUID(),
        workspaceId: input.workspaceId ?? undefined,
        actorUserId: input.actorUserId ?? undefined,
        actorDisplayName: input.actorDisplayName ?? "系统",
        actorEmail: input.actorEmail ?? undefined,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        action: input.action,
        payload,
        createdAt
      },
      ...store.auditLogs
    ]
  }));
}

export async function listPlatformAuditLogs(input: AuditLogQueryInput = {}): Promise<AuditLogRecord[]> {
  const limit = Math.max(20, Math.min(300, input.limit ?? 120));
  const supabase = getSupabaseServerClient();

  if (supabase) {
    let query = supabase
      .from("audit_logs")
      .select("id, workspace_id, actor_user_id, entity_type, entity_id, action, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (input.actorUserId) {
      query = query.eq("actor_user_id", input.actorUserId);
    }

    if (input.workspaceId) {
      query = query.eq("workspace_id", input.workspaceId);
    }

    if (input.action) {
      query = query.ilike("action", `%${input.action.trim()}%`);
    }

    const { data } = await query.returns<AuditLogRow[]>();
    const rows = data ?? [];
    const actorIds = Array.from(new Set(rows.map((row) => row.actor_user_id).filter((value): value is string => Boolean(value))));
    const workspaceIds = Array.from(new Set(rows.map((row) => row.workspace_id).filter((value): value is string => Boolean(value))));

    const [{ data: profiles }, { data: workspaces }] = await Promise.all([
      actorIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", actorIds)
            .returns<Array<{ id: string; display_name: string; email: string | null }>>()
        : Promise.resolve({ data: [] as Array<{ id: string; display_name: string; email: string | null }> }),
      workspaceIds.length > 0
        ? supabase
            .from("workspaces")
            .select("id, name")
            .in("id", workspaceIds)
            .returns<Array<{ id: string; name: string }>>()
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> })
    ]);

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const workspaceMap = new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace.name]));

    return rows.map((row) => {
      const actor = row.actor_user_id ? profileMap.get(row.actor_user_id) : null;

      return {
        id: row.id,
        workspaceId: row.workspace_id ?? undefined,
        workspaceName: row.workspace_id ? workspaceMap.get(row.workspace_id) : undefined,
        actorUserId: row.actor_user_id ?? undefined,
        actorDisplayName: actor?.display_name ?? "未识别用户",
        actorEmail: actor?.email ?? undefined,
        entityType: row.entity_type,
        entityId: row.entity_id ?? undefined,
        action: row.action,
        payload: row.payload ?? {},
        createdAt: row.created_at
      };
    });
  }

  const store = await readLocalDataStore();

  return store.auditLogs
    .filter((log) => (input.actorUserId ? log.actorUserId === input.actorUserId : true))
    .filter((log) => (input.workspaceId ? log.workspaceId === input.workspaceId : true))
    .filter((log) => (input.action ? log.action.toLowerCase().includes(input.action.trim().toLowerCase()) : true))
    .slice(0, limit)
    .map((log) => ({
      ...log,
      workspaceName: log.workspaceId
        ? store.workspaces.find((workspace) => workspace.id === log.workspaceId)?.name
        : undefined
    }));
}
