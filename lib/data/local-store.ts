import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  brandStrategyPack as mockBrandStrategyPack,
  hotspotPacks as mockHotspotPacks,
  hotspotSignals as mockHotspotSignals
} from "@/lib/data/mock";
import { BrandStrategyPack, HotspotPack, HotspotSignal, PublishJob } from "@/lib/domain/types";

export interface LocalDataStore {
  brand: BrandStrategyPack;
  hotspots: HotspotSignal[];
  packs: HotspotPack[];
  publishJobs: PublishJob[];
}

const storeDirectory = path.join(process.cwd(), ".runtime");
const storeFile = path.join(storeDirectory, "brand-hotspot-studio.json");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildInitialStore(): LocalDataStore {
  return {
    brand: clone(mockBrandStrategyPack),
    hotspots: clone(mockHotspotSignals),
    packs: clone(mockHotspotPacks),
    publishJobs: []
  };
}

function normalizeStore(raw: Partial<LocalDataStore> | null | undefined): LocalDataStore {
  const initial = buildInitialStore();

  return {
    brand: raw?.brand ? clone(raw.brand) : initial.brand,
    hotspots: Array.isArray(raw?.hotspots) ? clone(raw.hotspots) : initial.hotspots,
    packs: Array.isArray(raw?.packs) ? clone(raw.packs) : initial.packs,
    publishJobs: Array.isArray(raw?.publishJobs) ? clone(raw.publishJobs) : initial.publishJobs
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
  await writeFile(storeFile, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function updateLocalDataStore(
  updater: (store: LocalDataStore) => LocalDataStore | Promise<LocalDataStore>
): Promise<LocalDataStore> {
  const current = await readLocalDataStore();
  const next = await updater(current);
  return writeLocalDataStore(next);
}
