import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  brandStrategyPack as mockBrandStrategyPack,
  hotspotPacks as mockHotspotPacks,
  hotspotSignals as mockHotspotSignals
} from "@/lib/data/mock";
import {
  DEMO_AUTH_ACCOUNTS,
  DEMO_USERS,
  DEMO_WORKSPACE_INVITE_CODES,
  DEMO_WORKSPACE_INVITES,
  DEMO_WORKSPACE_MEMBERS,
  DEMO_WORKSPACES,
  DemoAuthAccountRecord,
  DemoWorkspaceInviteCodeRecord,
  DemoWorkspaceInviteRecord,
  DemoWorkspaceMemberRecord
} from "@/lib/auth/demo-data";
import { ensurePasswordHashMatches, normalizeStoredPassword } from "@/lib/auth/passwords";
import type { AuditLogRecord } from "@/lib/auth/audit";
import { ViewerUser, ViewerWorkspace } from "@/lib/auth/types";
import { AiRoutingConfig, DEFAULT_AI_ROUTING_CONFIG } from "@/lib/domain/ai-routing";
import {
  BrandStrategyPack,
  HotspotPack,
  HotspotSignal,
  HotspotSyncSnapshot,
  ProductionAsset,
  ProductionDraft,
  ProductionJob,
  PublishJob
} from "@/lib/domain/types";

export interface LocalDataStore {
  brand: BrandStrategyPack;
  hotspots: HotspotSignal[];
  packs: HotspotPack[];
  publishJobs: PublishJob[];
  productionJobs: ProductionJob[];
  productionAssets: ProductionAsset[];
  productionDrafts: ProductionDraft[];
  lastHotspotSync: HotspotSyncSnapshot | null;
  aiRoutingConfig: AiRoutingConfig;
  profiles: ViewerUser[];
  workspaces: ViewerWorkspace[];
  workspaceMembers: DemoWorkspaceMemberRecord[];
  workspaceInvites: DemoWorkspaceInviteRecord[];
  workspaceInviteCodes: DemoWorkspaceInviteCodeRecord[];
  authAccounts: DemoAuthAccountRecord[];
  auditLogs: AuditLogRecord[];
}

const storeDirectory = path.join(process.cwd(), ".runtime");
const storeFile = path.join(storeDirectory, "brand-hotspot-studio.json");
const tempStoreFile = path.join(storeDirectory, "brand-hotspot-studio.tmp.json");

let storeUpdateQueue: Promise<void> = Promise.resolve();
let memoryStore: LocalDataStore | null = null;
let fileStoreAvailable: boolean | null = null;

function ensureRequiredLocalAccounts(store: LocalDataStore): LocalDataStore {
  const adminProfile = DEMO_USERS.super_admin;
  const adminAccount: DemoAuthAccountRecord = {
    userId: adminProfile.id,
    email: adminProfile.email ?? "admin@local.dev",
    username: "admin",
    password: ensurePasswordHashMatches("qingman0525"),
    passwordSetupRequired: false
  };

  const profiles = store.profiles.some((profile) => profile.id === adminProfile.id)
    ? store.profiles.map((profile) =>
        profile.id !== adminProfile.id
          ? profile
          : {
              ...profile,
              email: adminProfile.email,
              displayName: adminProfile.displayName,
              status: "active"
            }
      )
    : [...store.profiles, clone(adminProfile)];

  const authAccounts = store.authAccounts.some((account) => account.userId === adminAccount.userId)
    ? store.authAccounts.map((account) =>
        account.userId !== adminAccount.userId
          ? account
          : {
              ...account,
              email: adminAccount.email,
              username: adminAccount.username,
              password: ensurePasswordHashMatches("qingman0525", account.password),
              passwordSetupRequired: false
            }
      )
    : [...store.authAccounts, adminAccount];

  return {
    ...store,
    profiles,
    authAccounts
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeById<T extends { id: string }>(defaults: T[], current: T[] | undefined): T[] {
  const merged = new Map<string, T>();

  for (const item of defaults) {
    merged.set(item.id, clone(item));
  }

  for (const item of current ?? []) {
    merged.set(item.id, clone(item));
  }

  return Array.from(merged.values());
}

function buildInitialStore(): LocalDataStore {
  return ensureRequiredLocalAccounts({
    brand: clone(mockBrandStrategyPack),
    hotspots: clone(mockHotspotSignals),
    packs: clone(mockHotspotPacks),
    publishJobs: [],
    productionJobs: [],
    productionAssets: [],
    productionDrafts: [],
    lastHotspotSync: null,
    aiRoutingConfig: clone(DEFAULT_AI_ROUTING_CONFIG),
    profiles: clone(Object.values(DEMO_USERS)),
    workspaces: clone(DEMO_WORKSPACES),
    workspaceMembers: clone(DEMO_WORKSPACE_MEMBERS),
    workspaceInvites: clone(DEMO_WORKSPACE_INVITES),
    workspaceInviteCodes: clone(DEMO_WORKSPACE_INVITE_CODES),
    authAccounts: clone(DEMO_AUTH_ACCOUNTS),
    auditLogs: []
  });
}

function normalizeStore(raw: Partial<LocalDataStore> | null | undefined): LocalDataStore {
  const initial = buildInitialStore();

  return ensureRequiredLocalAccounts({
    brand: raw?.brand ? clone(raw.brand) : initial.brand,
    hotspots: Array.isArray(raw?.hotspots) ? clone(raw.hotspots) : initial.hotspots,
    packs: Array.isArray(raw?.packs) ? clone(raw.packs) : initial.packs,
    publishJobs: Array.isArray(raw?.publishJobs) ? clone(raw.publishJobs) : initial.publishJobs,
    productionJobs: Array.isArray(raw?.productionJobs) ? clone(raw.productionJobs) : initial.productionJobs,
    productionAssets: Array.isArray(raw?.productionAssets) ? clone(raw.productionAssets) : initial.productionAssets,
    productionDrafts: Array.isArray(raw?.productionDrafts) ? clone(raw.productionDrafts) : initial.productionDrafts,
    lastHotspotSync: raw?.lastHotspotSync ? clone(raw.lastHotspotSync) : initial.lastHotspotSync,
    aiRoutingConfig: raw?.aiRoutingConfig
      ? {
          defaultProvider:
            raw.aiRoutingConfig.defaultProvider === "minimax"
              ? raw.aiRoutingConfig.defaultProvider
              : DEFAULT_AI_ROUTING_CONFIG.defaultProvider,
          featureProviderOverrides:
            raw.aiRoutingConfig.featureProviderOverrides &&
            typeof raw.aiRoutingConfig.featureProviderOverrides === "object" &&
            !Array.isArray(raw.aiRoutingConfig.featureProviderOverrides)
              ? clone(raw.aiRoutingConfig.featureProviderOverrides)
              : {},
          featureModelOverrides:
            raw.aiRoutingConfig.featureModelOverrides &&
            typeof raw.aiRoutingConfig.featureModelOverrides === "object" &&
            !Array.isArray(raw.aiRoutingConfig.featureModelOverrides)
              ? clone(raw.aiRoutingConfig.featureModelOverrides)
              : {}
        }
      : initial.aiRoutingConfig,
    profiles: mergeById(initial.profiles, Array.isArray(raw?.profiles) ? raw.profiles : undefined),
    workspaces: mergeById(initial.workspaces, Array.isArray(raw?.workspaces) ? raw.workspaces : undefined),
    workspaceMembers: mergeById(
      initial.workspaceMembers,
      Array.isArray(raw?.workspaceMembers) ? raw.workspaceMembers : undefined
    ),
    workspaceInvites: mergeById(
      initial.workspaceInvites,
      Array.isArray(raw?.workspaceInvites) ? raw.workspaceInvites : undefined
    ),
    workspaceInviteCodes: mergeById(
      initial.workspaceInviteCodes,
      Array.isArray(raw?.workspaceInviteCodes) ? raw.workspaceInviteCodes : undefined
    ),
    authAccounts: mergeById(
      initial.authAccounts.map((account) => ({ ...account, id: account.userId })),
      Array.isArray(raw?.authAccounts)
        ? raw.authAccounts.map((account) => ({ ...account, id: account.userId }))
        : undefined
    ).map(({ id: _id, ...account }) => ({
      ...account,
      password: normalizeStoredPassword(account.password)
    })),
    auditLogs: mergeById(initial.auditLogs, Array.isArray(raw?.auditLogs) ? raw.auditLogs : undefined)
  });
}

async function ensureStoreFile(): Promise<void> {
  try {
    await mkdir(storeDirectory, { recursive: true });

    try {
      await readFile(storeFile, "utf8");
    } catch {
      await writeFile(storeFile, JSON.stringify(buildInitialStore(), null, 2), "utf8");
    }

    fileStoreAvailable = true;
  } catch (error) {
    fileStoreAvailable = false;
    console.warn("[local-store] Falling back to in-memory store", error);
  }
}

export async function readLocalDataStore(): Promise<LocalDataStore> {
  await ensureStoreFile();

  if (fileStoreAvailable === false) {
    if (!memoryStore) {
      memoryStore = buildInitialStore();
    }

    return clone(memoryStore);
  }

  try {
    const content = await readFile(storeFile, "utf8");
    const parsed = JSON.parse(content) as Partial<LocalDataStore>;
    return normalizeStore(parsed);
  } catch {
    const initial = buildInitialStore();

    try {
      await writeFile(storeFile, JSON.stringify(initial, null, 2), "utf8");
      fileStoreAvailable = true;
      return initial;
    } catch (error) {
      fileStoreAvailable = false;
      console.warn("[local-store] Failed to rebuild local store file, using memory store", error);
      memoryStore = initial;
      return clone(initial);
    }
  }
}

export async function writeLocalDataStore(store: LocalDataStore): Promise<LocalDataStore> {
  const normalized = normalizeStore(store);
  await ensureStoreFile();

  if (fileStoreAvailable === false) {
    memoryStore = clone(normalized);
    return clone(normalized);
  }

  try {
    await writeFile(tempStoreFile, JSON.stringify(normalized, null, 2), "utf8");
    await rename(tempStoreFile, storeFile);
    fileStoreAvailable = true;
    return normalized;
  } catch (error) {
    fileStoreAvailable = false;
    memoryStore = clone(normalized);
    console.warn("[local-store] Failed to persist local store file, using memory store", error);
    return clone(normalized);
  }
}

export async function updateLocalDataStore(
  updater: (store: LocalDataStore) => LocalDataStore | Promise<LocalDataStore>
): Promise<LocalDataStore> {
  let resolveQueue: (() => void) | undefined;
  const previous = storeUpdateQueue;

  storeUpdateQueue = new Promise<void>((resolve) => {
    resolveQueue = resolve;
  });

  await previous;

  try {
    const current = await readLocalDataStore();
    const next = await updater(current);
    return await writeLocalDataStore(next);
  } finally {
    resolveQueue?.();
  }
}
