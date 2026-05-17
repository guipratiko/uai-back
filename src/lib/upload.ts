import fs from "fs";
import path from "path";
import { config } from "../config";

export function getUploadsRoot() {
  return path.resolve(process.cwd(), config.uploadsDir);
}

export function getAvatarsDir() {
  return path.join(getUploadsRoot(), "avatars");
}

export function ensureUploadDirs() {
  fs.mkdirSync(getAvatarsDir(), { recursive: true });
}

export function avatarPublicPath(filename: string) {
  return `/uploads/avatars/${filename}`;
}

export function avatarAbsoluteUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  if (relativePath.startsWith("http")) return relativePath;
  return `${config.apiPublicUrl.replace(/\/$/, "")}${relativePath}`;
}
