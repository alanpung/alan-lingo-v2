import { NextRequest, NextResponse } from "next/server";
import { generateSpeech, getCachedAudio } from "@/lib/tts";
import { getAudio } from "@/lib/r2";
import { getSession } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  // 1. Check in-memory Gemini TTS cache first
  const memoryCached = getCachedAudio(key);
  if (memoryCached) {
    return new NextResponse(new Uint8Array(memoryCached.buffer), {
      headers: {
        "Content-Type": memoryCached.mimeType || "audio/wav",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // 2. Check Cloudflare R2 if configured
  const buffer = await getAudio(key);
  if (buffer) {
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  return new NextResponse(null, { status: 404 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, language, voice, instructions } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (!language || typeof language !== "string") {
      return NextResponse.json(
        { error: "language is required" },
        { status: 400 }
      );
    }
    if (text.length > 4096) {
      return NextResponse.json(
        { error: "text must be under 4096 characters" },
        { status: 400 }
      );
    }

    let userId: string | undefined = undefined;
    try {
      const session = await getSession();
      if (session?.user?.id) {
        userId = session.user.id;
      }
    } catch {
      // Ignore session errors
    }

    const { url } = await generateSpeech(text, language, {
      voiceName: voice,
      instructions,
      userId,
    });
    return NextResponse.json({ url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "TTS generation failed";
    console.error("TTS generation error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
