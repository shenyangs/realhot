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
import { ViewerUser, ViewerWorkspace } from "@/lib/auth/types";
import { BrandStrategyPack, HotspotPack, HotspotSignal, HotspotSyncSnapshot, PublishJob } from "@/lib/domain/types";

export interface LocalDataStore {
  brand: BrandStrategyPack;
  hotspots: HotspotSignal[];
  packs: HotspotPack[];
  publishJobs: PublishJob[];
  lastHotspotSync: HotspotSyncSnapshot | null;
  profiles: ViewerUser[];
  workspaces: ViewerWorkspace[];
  workspaceMembers: DemoWorkspaceMemberRecord[];
  workspaceInvites: DemoWorkspaceInviteRecord[];
  workspaceInviteCodes: DemoWorkspaceInviteCodeRecord[];
  authAccounts: DemoAuthAccountRecord[];
}

const storeDirectory = path.join(process.cwd(), ".runtime");
const storeFile = path.join(storeDirectory, "brand-hotspot-studio.json");
const tempStoreFile = path.join(storeDirectory, "brand-hotspot-studio.tmp.json");

let storeUpdateQueue: Promise<void> = Promise.resolve();

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
  return {
    brand: clone(mockBrandStrategyPack),
    hotspots: clone(mockHotspotSignals),
    packs: clone(mockHotspotPacks),
    publishJobs: [],
    lastHotspotSync: null,
    profiles: clone(Object.values(DEMO_USERS)),
    workspaces: clone(DEMO_WORKSPACES),
    workspaceMembers: clone(DEMO_WORKSPACE_MEMBERS),
    workspaceInvites: clone(DEMO_WORKSPACE_INVITES),
    workspaceInviteCodes: clone(DEMO_WORKSPACE_INVITE_CODES),
    authAccounts: clone(DEMO_AUTH_ACCOUNTS)
  };
}

function normalizeStore(raw: Partial<LocalDataStore> | null | undefined): LocalDataStore {
  const initial = buildInitialStore();

  return {
    brand: raw?.brand ? clone(raw.brand) : initial.brand,
    hotspots: Array.isArray(raw?.hotspots) ? clone(raw.hotspots) : initial.hotspots,
    packs: Array.isArray(raw?.packs) ? clone(raw.packs) : initial.packs,
    publishJobs: Array.isArray(raw?.publishJobs) ? clone(raw.publishJobs) : initial.publishJobs,
    lastHotspotSync: raw?.lastHotspotSync ? clone(raw.lastHotspotSync) : initial.lastHotspotSync,
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
    ).map(({ id: _id, ...account }) => account)
  };
}

async function ensureStoreFile(): Promise<void> {
  await mkdir(storeDirectory, { recursive: true });

  try {
    await readFile(storeFile, "utf8");
  } catch {
    await writeFile(storeFile, JSON.stringify(buildInitialStore(), null, 2), "utf8");
  }
}

export async function readLocalDataStore(): Promise<LocalDataStore> {
  await ensureStoreFile();

  try {
    const content = await readFile(storeFile, "utf8");
    const parsed = JSON.parse(content) as Partial<LocalDataStore>;
    return normalizeStore(parsed);
  } catch {
    const initial = buildInitialStore();
    await writeFile(storeFile, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
}

export async function writeLocalDataStore(store: LocalDataStore): Promise<LocalDataStore> {
  const normalized = normalizeStore(store);
  await ensureStoreFile();
  await writeFile(tempStoreFile, JSON.stringify(normalized, null, 2), "utf8");
  await rename(tempStoreFile, storeFile);
  return normalized;
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
