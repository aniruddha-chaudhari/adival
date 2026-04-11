import screenshot from "screenshot-desktop";
import { Jimp } from "jimp";

const DEFAULT_MAX_BYTES = 2_000_000;
const MIN_MAX_BYTES = 200_000;
const MAX_MAX_BYTES = 10_000_000;
const RESIZE_STEP = 0.9;
const MIN_DIMENSION = 320;

export type ScreenSnapshotResult = {
  mimeType: "image/png";
  data: string;
  width: number;
  height: number;
  timestamp: string;
};

export function resolveMaxBytes(rawValue?: number): number {
  if (rawValue === undefined) {
    return DEFAULT_MAX_BYTES;
  }

  if (!Number.isInteger(rawValue)) {
    throw new Error("maxBytes must be an integer");
  }

  if (rawValue < MIN_MAX_BYTES || rawValue > MAX_MAX_BYTES) {
    throw new Error(
      `maxBytes must be between ${MIN_MAX_BYTES} and ${MAX_MAX_BYTES}`,
    );
  }

  return rawValue;
}

export async function captureScreenSnapshot(
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<ScreenSnapshotResult> {
  const sourceBuffer = await screenshot({ format: "png" });
  let image = await Jimp.read(sourceBuffer);

  if (!image.bitmap.width || !image.bitmap.height) {
    throw new Error("Captured screenshot is missing image dimensions.");
  }

  let width = image.bitmap.width;
  let height = image.bitmap.height;
  let encoded = await image.getBuffer("image/png");

  while (
    encoded.byteLength > maxBytes &&
    width > MIN_DIMENSION &&
    height > MIN_DIMENSION
  ) {
    width = Math.max(MIN_DIMENSION, Math.floor(width * RESIZE_STEP));
    height = Math.max(MIN_DIMENSION, Math.floor(height * RESIZE_STEP));
    image = image.resize({ w: width, h: height });
    encoded = await image.getBuffer("image/png");
  }

  if (encoded.byteLength > maxBytes) {
    throw new Error(
      `Screenshot could not be reduced below ${maxBytes} bytes safely.`,
    );
  }

  if (!image.bitmap.width || !image.bitmap.height) {
    throw new Error("Processed screenshot is missing image dimensions.");
  }

  return {
    mimeType: "image/png",
    data: encoded.toString("base64"),
    width: image.bitmap.width,
    height: image.bitmap.height,
    timestamp: new Date().toISOString(),
  };
}
