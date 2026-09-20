import { NextResponse } from "next/server";
import { createIdea } from "@/lib/ideas";
import { createIdeaSchema } from "@/lib/validation/ideas";

/**
 * Capture endpoint. Reachable with either a dashboard session cookie (PWA) or
 * the INGEST_TOKEN bearer header (Apple Shortcut) — see src/proxy.ts.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const captureKey = request.headers.get("idempotency-key")?.trim() || null;

  const { idea, created } = await createIdea(parsed.data.raw_text, captureKey);

  return NextResponse.json(
    { id: idea.id, created },
    { status: created ? 201 : 200 },
  );
}
