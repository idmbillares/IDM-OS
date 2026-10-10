import { z } from "zod";
import { pool } from "@/db/client";
import { requireSession } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { assertCashRead } from "@/modules/financial/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(getAuthProvider());
  assertCashRead(session);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  const photo = (
    await pool.query<{ content: Buffer; mime_type: string }>(
      "SELECT content,mime_type FROM inventory_product_photos WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.content), {
    headers: {
      "Content-Type": photo.mime_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
