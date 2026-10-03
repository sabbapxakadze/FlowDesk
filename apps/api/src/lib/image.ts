import sharp from "sharp";
import { AppError } from "../shared/errors.js";

export const AVATAR_SIZE_PX = 256;
const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp"]);

/**
 * Turns an uploaded picture into the one thing we store: a 256x256 square WebP.
 *
 * Decoding is the validation. The browser-supplied MIME type is only a claim (a text file can be
 * named .png), so this decodes the bytes with sharp and refuses anything that is not really a
 * PNG, JPEG or WebP. Then it applies the camera's rotation, centre-crops to a square and
 * re-encodes; sharp drops metadata (EXIF, GPS) unless asked to keep it, so none of it is stored.
 * The original upload is never kept. A pixel cap stops a small file that decompresses to
 * something enormous.
 */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000 });
    const { format } = await image.metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      throw new AppError("invalid_image", 400, "The photo must be a PNG, JPEG or WebP picture.");
    }
    return await image
      .rotate()
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("invalid_image", 400, "The photo must be a PNG, JPEG or WebP picture.");
  }
}
