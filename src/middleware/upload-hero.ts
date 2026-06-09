import crypto from "crypto";
import path from "path";
import multer from "multer";
import { AppError } from "../lib/errors";
import { ensureUploadDirs, getHeroDir } from "../lib/upload";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDirs();
    cb(null, getHeroDir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : ".jpg";
    cb(null, `hero-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${safeExt}`);
  },
});

export const uploadHeroImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) {
      cb(null, true);
      return;
    }
    cb(new AppError(400, "Use imagem JPEG, PNG ou WebP"));
  },
}).fields([
  { name: "imageDesktop", maxCount: 1 },
  { name: "imageMobile", maxCount: 1 },
]);
