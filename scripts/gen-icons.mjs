/**
 * Regenerates the PWA / favicon PNGs from the source SVGs.
 *
 *   npm i --no-save sharp && node scripts/gen-icons.mjs
 *
 * Sources:
 *   public/logo-mark.svg     - rounded app mark  -> purpose "any"
 *   public/icon-maskable.svg - full-bleed square -> purpose "maskable"
 */
import sharp from "sharp";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mark = readFileSync(resolve(root, "public/logo-mark.svg"));
const maskable = readFileSync(resolve(root, "public/icon-maskable.svg"));

const jobs = [
  [mark, 192, "public/icon-192.png"],
  [mark, 512, "public/icon-512.png"],
  [maskable, 192, "public/icon-192-maskable.png"],
  [maskable, 512, "public/icon-512-maskable.png"],
  [mark, 180, "src/app/apple-icon.png"],
];

for (const [buf, size, out] of jobs) {
  await sharp(buf, { density: 384 }).resize(size, size).png().toFile(resolve(root, out));
  console.log(out, statSync(resolve(root, out)).size, "bytes");
}
