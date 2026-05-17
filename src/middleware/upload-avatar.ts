import fs from "fs";
import path from "path";
import multer from "multer";
import { AppError } from "../lib/errors";
import { ensureUploadDirs, getAvatarsDir } from "../lib/upload";

ensureUploadDirs();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDirs();
    cb(null, getAvatarsDir());
  },
  filename: (req, file, cb) => {
    const userId = (req as { user?: { sub: string } }).user?.sub;
    if (!userId) return cb(new AppError(401, "Não autenticado") as unknown as Error, "");
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${userId}${safeExt}`);
  },
});

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError(400, "Formato inválido. Use JPG, PNG ou WebP.") as unknown as Error);
    }
    cb(null, true);
  },
}).single("avatar");

export function removeAvatarFiles(userId: string, keepFilename?: string) {
  const dir = getAvatarsDir();
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(userId) && file !== keepFilename) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}
