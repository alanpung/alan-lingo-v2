"use server";

import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { generateSpeech } from "@/lib/tts";

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  gender: "masculine" | "feminine" | "neutral";
  tag: string;
}

export const AVAILABLE_VOICES: VoiceOption[] = [
  {
    id: "Fenrir",
    name: "Fenrir",
    description: "Deep, resonant, and authoritative masculine tone (Visionary / Elon style cadence)",
    gender: "masculine",
    tag: "Deep & Powerful",
  },
  {
    id: "Charon",
    name: "Charon",
    description: "Deep, solemn, grounded, and dramatic orator tone (Commanding / Trump style cadence)",
    gender: "masculine",
    tag: "Deep Orator",
  },
  {
    id: "Zephyr",
    name: "Zephyr",
    description: "Smooth, natural conversational, modern, and engaging tone",
    gender: "masculine",
    tag: "Natural & Smooth",
  },
  {
    id: "Puck",
    name: "Puck",
    description: "High energy, expressive, vibrant, and enthusiastic tone",
    gender: "masculine",
    tag: "Energetic",
  },
  {
    id: "Kore",
    name: "Kore",
    description: "Calm, articulate, measured pedagogical educator (Standard Default)",
    gender: "feminine",
    tag: "Pedagogical",
  },
  {
    id: "Aoede",
    name: "Aoede",
    description: "Warm, melodic, expressive, and friendly tone",
    gender: "feminine",
    tag: "Warm & Melodic",
  },
  {
    id: "Leda",
    name: "Leda",
    description: "Clear, balanced, crisp, and calm presentation",
    gender: "feminine",
    tag: "Crisp & Balanced",
  },
  {
    id: "Orus",
    name: "Orus",
    description: "Sharp, confident, punchy, and direct articulation",
    gender: "masculine",
    tag: "Direct & Sharp",
  },
];

export const VOICE_STYLE_PRESETS: { id: string; name: string; template: string; description: string }[] = [
  {
    id: "default",
    name: "Standard Educator",
    description: "Clear, native pronunciation with calm, measured pacing for learners.",
    template: "Speak in {target_language} with clear, native pronunciation. Calm, measured pace for learners.",
  },
  {
    id: "deep_tech",
    name: "Tech Visionary (Elon Musk Style)",
    description: "Deep, thoughtful, direct, and analytical tone with deliberate pauses and natural rhythm.",
    template: "Speak in {target_language} in a deep, direct, thoughtful, and analytical tone with deliberate pauses, conversational cadence, and clear articulation.",
  },
  {
    id: "orator",
    name: "Bold Orator (Donald Trump Style)",
    description: "Bold, confident, punchy, dramatic inflection, and expressive emphasis.",
    template: "Speak in {target_language} with a bold, authoritative, dramatic, and highly confident orator delivery with strong emphasis and energetic cadence.",
  },
  {
    id: "energetic",
    name: "Dynamic & Enthusiastic",
    description: "High-energy, lively, upbeat, and encouraging conversational cadence.",
    template: "Speak in {target_language} with high energy, lively natural expression, vibrant cadence, and warm enthusiasm.",
  },
  {
    id: "custom",
    name: "Custom Prompt Instructions",
    description: "Write your own customized prompt instructions for the Gemini TTS model.",
    template: "",
  },
];

export interface VoiceSettingsData {
  voiceName: string;
  presetId: string;
  customInstructions: string;
  isAdmin: boolean;
}

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
