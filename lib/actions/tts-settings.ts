"use server";

import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { generateSpeech } from "@/lib/tts";
import {
  VOICE_STYLE_PRESETS,
  type VoiceSettingsData,
} from "@/lib/tts-config";

export async function getVoiceSettings(): Promise<VoiceSettingsData> {
  const session = await getSession();
  if (!session) {
    return {
      voiceName: "Kore",
      presetId: "default",
      customInstructions: VOICE_STYLE_PRESETS[0].template,
      isAdmin: false,
    };
  }

  const isAdmin = isAdminEmail(session.user.email);
  if (!isAdmin) {
    return {
      voiceName: "Kore",
      presetId: "default",
      customInstructions: VOICE_STYLE_PRESETS[0].template,
      isAdmin: false,
    };
  }

  const records = await db
    .select()
    .from(userMemory)
    .where(eq(userMemory.userId, session.user.id));

  const map = new Map(records.map((r) => [r.key, r.value]));

  const voiceName = map.get("tts:voice") || "Kore";
  const presetId = map.get("tts:preset") || "default";
  const customInstructions =
    map.get("prompt:tts-instructions") ||
    VOICE_STYLE_PRESETS.find((p) => p.id === presetId)?.template ||
    VOICE_STYLE_PRESETS[0].template;

  return {
    voiceName,
    presetId,
    customInstructions,
    isAdmin,
  };
}

export async function saveVoiceSettings({
  voiceName,
  presetId,
  customInstructions,
}: {
  voiceName: string;
  presetId: string;
  customInstructions?: string;
}) {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) {
    throw new Error("Unauthorized: Only authors and admins can customize audio voices.");
  }

  // Save voice selection
  await db
    .insert(userMemory)
    .values({
      userId: session.user.id,
      key: "tts:voice",
      value: voiceName,
    })
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value: voiceName, updatedAt: new Date() },
    });

  // Save preset selection
  await db
    .insert(userMemory)
    .values({
      userId: session.user.id,
      key: "tts:preset",
      value: presetId,
    })
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value: presetId, updatedAt: new Date() },
    });

  // Save instruction template
  const instructionToSave =
    presetId === "custom"
      ? customInstructions || ""
      : VOICE_STYLE_PRESETS.find((p) => p.id === presetId)?.template || VOICE_STYLE_PRESETS[0].template;

  await db
    .insert(userMemory)
    .values({
      userId: session.user.id,
      key: "prompt:tts-instructions",
      value: instructionToSave,
    })
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value: instructionToSave, updatedAt: new Date() },
    });

  return { success: true };
}

export async function previewVoiceAudio({
  voiceName,
  instructions,
  sampleText,
  language = "en",
}: {
  voiceName: string;
  instructions?: string;
  sampleText?: string;
  language?: string;
}): Promise<{ url: string }> {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) {
    throw new Error("Unauthorized");
  }

  const text =
    sampleText ||
    "Hello! Welcome to AlanLingo. Master new languages with intelligence, confidence, and natural flow.";

  const result = await generateSpeech(text, language, {
    voiceName,
    instructions,
    skipCache: true,
  });

  return { url: result.url };
}
