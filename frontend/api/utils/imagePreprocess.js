import sharp from "sharp";
import { isAnalyzeDebugEnabled } from "./analyzeDebug.js";

const SMALL_IMAGE_BYTE_THRESHOLD = 450 * 1024;

export async function preprocessImage(imageBuffer, mimeType) {
  const maxDimension = Number(process.env.ANALYZE_MAX_IMAGE_DIMENSION || 1000);
  const imageQuality = Number(process.env.ANALYZE_IMAGE_QUALITY || 76);
  const normalizedMimeType = mimeType || "image/jpeg";
  const originalBytes = imageBuffer.length;

  try {
    const image = sharp(imageBuffer, { failOn: "none" });
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const largestDimension = Math.max(width, height);
    const isAlreadySmall = originalBytes <= SMALL_IMAGE_BYTE_THRESHOLD && largestDimension <= maxDimension;
    const isEfficientFormat = /image\/(?:jpeg|jpg|webp)/i.test(normalizedMimeType);

    // 450KB JPEG/WebP images at <=1000px are usually already small enough for
    // fast upload while preserving tiny card text. Larger files are resized and
    // recompressed to JPEG quality 76, which keeps collector numbers readable.
    if (isAlreadySmall && isEfficientFormat) {
      return {
        buffer: imageBuffer,
        mimeType: normalizedMimeType,
        optimized: false,
        originalBytes,
        processedBytes: originalBytes,
        reductionPercent: 0,
        skippedReason: "already-small",
        width,
        height,
      };
    }

    const { data: buffer, info } = await image
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: imageQuality,
        mozjpeg: true,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer,
      mimeType: "image/jpeg",
      optimized: true,
      originalBytes,
      processedBytes: buffer.length,
      reductionPercent: Math.max(0, Math.round((1 - buffer.length / originalBytes) * 1000) / 10),
      width: info.width,
      height: info.height,
      originalWidth: width,
      originalHeight: height,
    };
  } catch (error) {
    if (isAnalyzeDebugEnabled()) {
      console.warn("Image preprocessing failed; using original upload.", error);
    }

    return {
      buffer: imageBuffer,
      mimeType: normalizedMimeType,
      optimized: false,
      originalBytes,
      processedBytes: originalBytes,
      reductionPercent: 0,
      skippedReason: "sharp-failed",
    };
  }
}
