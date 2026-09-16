import { z } from "zod";

export const maxAppIconBytes = 512 * 1024;
export const maxAppIconDimension = 512;
export const appIconMimeType = "image/png";

export const appIconUploadMetadataSchema = z.object({
  mimeType: z.literal(appIconMimeType),
  byteSize: z.number().int().positive().max(maxAppIconBytes),
});

export type BrandingSnapshot = {
  hasCustomIcon: boolean;
  revision: number;
};
