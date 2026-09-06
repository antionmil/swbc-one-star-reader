/**
 * Apple's artwork URLs carry the size in the path, so any size can be asked
 * for by rewriting the last segment.
 *
 * The stored URL is the 100-pixel JPEG the lookup endpoint hands back, and the
 * shelf draws icons at up to 150 CSS pixels — 300 real ones on a retina
 * screen. Upscaling a 100-pixel JPEG by three is exactly as bad as it sounds.
 *
 * WebP rather than PNG or JPEG, measured on a real icon:
 *   100×100 jpg   4.3 KB   (what was being stretched)
 *   384×384 webp  8.4 KB   ← this
 *   512×512 jpg  25.9 KB
 *   384×384 png  82.7 KB
 * Twenty icons on the shelf is 168 KB as WebP and 1.6 MB as PNG.
 */
export function artwork(url: string | null | undefined, px: number): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+bb\.(?:jpg|png|webp)$/i, `/${px}x${px}bb.webp`);
}
