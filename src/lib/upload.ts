import fs from "fs";
import path from "path";
import { config } from "../config";

export function getUploadsRoot() {
  return path.resolve(process.cwd(), config.uploadsDir);
}

export function getAvatarsDir() {
  return path.join(getUploadsRoot(), "avatars");
}

export function getHeroDir() {
  return path.join(getUploadsRoot(), "hero");
}

export function ensureUploadDirs() {
  fs.mkdirSync(getAvatarsDir(), { recursive: true });
  fs.mkdirSync(getHeroDir(), { recursive: true });
}

export function avatarPublicPath(filename: string) {
  return `/uploads/avatars/${filename}`;
}

export function heroPublicPath(filename: string) {
  return `/uploads/hero/${filename}`;
}

export function isLocalUpload(relativePath: string | null | undefined): boolean {
  if (!relativePath) return false;
  return relativePath.startsWith("/uploads/");
}

export function deleteLocalUpload(relativePath: string | null | undefined) {
  if (!isLocalUpload(relativePath)) return;
  const full = path.join(getUploadsRoot(), relativePath!.replace(/^\/uploads\//, ""));
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (e) {
    console.warn("[upload] falha ao remover arquivo", full, e);
  }
}

export function assetAbsoluteUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  if (relativePath.startsWith("http")) return relativePath;
  return `${config.apiPublicUrl.replace(/\/$/, "")}${relativePath}`;
}

export function avatarAbsoluteUrl(relativePath: string | null | undefined): string | null {
  return assetAbsoluteUrl(relativePath);
}
