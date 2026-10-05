import { inflateSync } from "node:zlib";
import { ValidationError } from "@/lib/errors";
import { maxAppIconBytes, maxAppIconDimension } from "./contracts";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate structure, checksums and the complete raster, with bounded inflation. */
export function validateIconPng(bytes: Buffer, mimeType: string) {
  const invalid = () =>
    new ValidationError("El PNG está corrupto o su contenido no se puede decodificar.");
  if (
    mimeType !== "image/png" ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new ValidationError("Formato incorrecto: selecciona una imagen PNG.");
  if (bytes.length > maxAppIconBytes)
    throw new ValidationError("El archivo supera el máximo de 512 KB.");
  let width = 0,
    height = 0,
    rowBytes = 0,
    offset = 8,
    ended = false,
    dataEnded = false;
  let bitsPerPixel = 0,
    interlaced = false;
  const data: Buffer[] = [];
  let needsPalette = false,
    hasPalette = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) throw invalid();
    const kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4))
      throw invalid();
    if (offset === 8) {
      if (kind !== "IHDR" || size !== 13) throw invalid();
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const depth = chunk[8],
        color = chunk[9];
      needsPalette = color === 3;
      const depths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
      if (
        !width ||
        !height ||
        width > maxAppIconDimension ||
        height > maxAppIconDimension ||
        width !== height
      )
        throw new ValidationError(
          "Dimensiones incorrectas: el PNG debe ser cuadrado, entre 1 × 1 y 512 × 512 px.",
        );
      if (
        !depths[color]?.includes(depth) ||
        chunk[10] !== 0 ||
        chunk[11] !== 0 ||
        chunk[12] > 1
      )
        throw invalid();
      bitsPerPixel = channels[color] * depth;
      interlaced = chunk[12] === 1;
      rowBytes = Math.ceil((width * bitsPerPixel) / 8);
    } else if (kind === "IDAT") {
      if (dataEnded || (needsPalette && !hasPalette)) throw invalid();
      data.push(chunk);
    } else if (kind === "IEND") {
      if (size !== 0 || end !== bytes.length || !data.length) throw invalid();
      ended = true;
    } else {
      if (kind === "PLTE") {
        if (hasPalette || data.length || size === 0 || size % 3 !== 0 || size > 768)
          throw invalid();
        hasPalette = true;
      }
      if (
        kind === "IHDR" ||
        kind === "acTL" ||
        (/^[A-Z]/.test(kind) && kind !== "PLTE")
      )
        throw invalid();
      if (data.length) dataEnded = true;
    }
    offset = end;
  }
  if (!ended || offset !== bytes.length) throw invalid();
  try {
    // Adam7 passes have their own scanline filters; empty passes contain no data.
    const passes = interlaced
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
          .map(([x, y, dx, dy]) => ({
            rows: Math.max(0, Math.ceil((height - y) / dy)),
            columns: Math.max(0, Math.ceil((width - x) / dx)),
          }))
          .filter((p) => p.rows && p.columns)
          .map((p) => ({
            rows: p.rows,
            rowBytes: Math.ceil((p.columns * bitsPerPixel) / 8),
          }))
      : [{ rows: height, rowBytes }];
    const expected = passes.reduce((sum, p) => sum + p.rows * (p.rowBytes + 1), 0);
    const raster = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
    if (raster.length !== expected) throw invalid();
    let position = 0;
    for (const pass of passes)
      for (let row = 0; row < pass.rows; row++) {
        if (raster[position] > 4) throw invalid();
        position += pass.rowBytes + 1;
      }
  } catch {
    throw invalid();
  }
  return { width, height };
}
