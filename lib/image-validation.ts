export type ValidImage = { type: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number };

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
const u16be = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];
const u16le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u24le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
const u32be = (bytes: Uint8Array, offset: number) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;

export function validateImage(bytes: Uint8Array): ValidImage {
  if (bytes.length < 30) throw new Error("The image file is incomplete.");
  let result: ValidImage | null = null;

  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && ascii(bytes, 12, 4) === "IHDR") {
    result = { type: "image/png", width: u32be(bytes, 16), height: u32be(bytes, 20) };
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        result = { type: "image/jpeg", height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) };
        break;
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const segmentLength = u16be(bytes, offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const variant = ascii(bytes, 12, 4);
    if (variant === "VP8X") result = { type: "image/webp", width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
    if (variant === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) result = { type: "image/webp", width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    if (variant === "VP8L" && bytes[20] === 0x2f) {
      const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
      result = { type: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }

  if (!result || !result.width || !result.height) throw new Error("Use a valid PNG, JPEG, or WebP image.");
  if (result.width > 10_000 || result.height > 10_000 || result.width * result.height > 25_000_000) throw new Error("That image is too large to process safely.");
  return result;
}
