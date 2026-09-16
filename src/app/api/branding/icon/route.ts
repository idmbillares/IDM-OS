import { getCurrentAppIcon } from "@/modules/branding/service";

const fallbackIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#111111"/><circle cx="20" cy="24" r="12" fill="#ffffff"/><circle cx="20" cy="24" r="4" fill="#111111"/><circle cx="34" cy="14" r="6" fill="#f97316"/></svg>`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const icon = await getCurrentAppIcon();

  return new Response(icon ? new Uint8Array(icon.bytes) : fallbackIcon, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "sandbox",
      "Content-Type": icon?.mimeType ?? "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
