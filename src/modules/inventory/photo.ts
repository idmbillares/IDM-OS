import "server-only";
import { createHash } from "node:crypto";
import { ValidationError } from "@/lib/errors";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function readProductPhoto(file: File | null | undefined) {
  if (!file || file.size === 0) return null;
  if (file.type !== "image/png" || file.size > 2_097_152)
    throw new ValidationError("La fotografía debe ser PNG y medir máximo 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new ValidationError("El archivo no es una imagen PNG válida.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || width > 3000 || height < 1 || height > 3000)
    throw new ValidationError(
      "La fotografía debe medir entre 1 y 3000 píxeles por lado.",
    );
  return {
    bytes,
    width,
    height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
