import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const assetsRoot = path.join(process.cwd(), ".runtime", "production-assets");

function sanitizeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9-_./]+/g, "-");
  return normalized.replace(/\/+/g, "/").replace(/^-|-$/g, "") || "asset";
}

export function buildProductionAssetRelativePath(...segments: string[]): string {
  return segments.map(sanitizeSegment).join("/");
}

export function buildProductionAssetUrl(relativePath: string): string {
  return `/api/production/assets/${relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function resolveProductionAssetPath(relativePath: string): string {
  const absolutePath = path.resolve(assetsRoot, relativePath);
  const rootWithSlash = `${assetsRoot}${path.sep}`;

  if (absolutePath !== assetsRoot && !absolutePath.startsWith(rootWithSlash)) {
    throw new Error("非法资产路径");
  }

  return absolutePath;
}

export async function writeProductionAssetBuffer(relativePath: string, buffer: Buffer): Promise<string> {
  const absolutePath = resolveProductionAssetPath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return absolutePath;
}

export async function readProductionAssetBuffer(relativePath: string): Promise<Buffer> {
  const absolutePath = resolveProductionAssetPath(relativePath);
  return readFile(absolutePath);
}

export function getProductionAssetContentType(relativePath: string): string {
  const extension = path.extname(relativePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".mp4") {
    return "video/mp4";
  }

  if (extension === ".mp3") {
    return "audio/mpeg";
  }

  if (extension === ".wav") {
    return "audio/wav";
  }

  if (extension === ".srt") {
    return "text/plain; charset=utf-8";
  }

  return "application/octet-stream";
}
