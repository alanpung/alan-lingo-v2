import { createHash } from "crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import OpenAI from "openai";
import {
  getDefaultTemplate,
  interpolateTemplate,
  langCodeToName,
} from "@/lib/prompts";
import { detectTextLanguage } from "@/lib/language-detector";
import { db } from "@/lib/db";
import { userMemory, audioCache } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// Memory cache for generated audio to minimize API calls and avoid quota exhaustion
const memoryAudioCache = new Map<string, { buffer: Buffer; mimeType: string }>();

// Convert 24kHz 16-bit mono Little-Endian PCM into standard WAV format
export function pcmToWav(
  pcmBase64OrBuffer: string | Buffer,
  sampleRate = 24000,
  numChannels = 1
): Buffer {
  const pcmBuffer =
    typeof pcmBase64OrBuffer === "string"
      ? Buffer.from(pcmBase64OrBuffer, "base64")
      : pcmBase64OrBuffer;

  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  header.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export function getCachedAudio(key: string): { buffer: Buffer; mimeType: string } | null {
  return memoryAudioCache.get(key) ?? null;
}

/**
 * Check persistent DB audio cache
 */
export async function getPersistentCachedAudio(
  key: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const mem = memoryAudioCache.get(key);
  if (mem) return mem;

  try {
    const rows = await db
      .select()
      .from(audioCache)
      .where(or(eq(audioCache.text, key), eq(audioCache.language, key)))
      .limit(1);

    if (rows.length > 0 && rows[0].r2Key) {
      const raw = rows[0].r2Key;
      let buffer: Buffer | null = null;
      let mimeType = "audio/wav";

      if (raw.startsWith("base64:wav:")) {
        buffer = Buffer.from(raw.slice(11), "base64");
        mimeType = "audio/wav";
      } else if (raw.startsWith("base64:mp3:")) {
        buffer = Buffer.from(raw.slice(11), "base64");
        mimeType = "audio/mpeg";
      } else if (raw.startsWith("base64:")) {
        buffer = Buffer.from(raw.slice(7), "base64");
        mimeType = "audio/wav";
      }

      if (buffer) {
        const item = { buffer, mimeType };
        memoryAudioCache.set(key, item);
        return item;
      }
    }
  } catch (err) {
    console.warn("DB audio cache lookup error:", err);
  }

  return null;
}

export interface GenerateSpeechOptions {
  voiceName?: string;
  instructions?: string;
  userId?: string;
  skipCache?: boolean;
}

// Fallback voice mapping for OpenAI TTS
const GEMINI_TO_OPENAI_VOICE: Record<string, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  Fenrir: "onyx",
  Charon: "fable",
  Zephyr: "alloy",
  Puck: "nova",
  Kore: "shimmer",
  Aoede: "alloy",
  Leda: "shimmer",
  Orus: "echo",
};

export async function generateSpeech(
  text: string,
  language: string,
  options?: GenerateSpeechOptions
): Promise<{ url: string; buffer: Buffer; mimeType: string }> {
  const normalized = text.trim();
  const resolvedLang = detectTextLanguage(normalized, { targetLanguage: language });
  const target_language = langCodeToName[resolvedLang] || resolvedLang;

  let selectedVoice = options?.voiceName;
  let customInstructions = options?.instructions;

  // 1. If not explicitly provided, check database for user or owner/global preferences
  if (!selectedVoice || !customInstructions) {
    try {
      // First check user's personal settings if provided
      if (options?.userId) {
        const records = await db
          .select()
          .from(userMemory)
          .where(eq(userMemory.userId, options.userId));
        const map = new Map(records.map((r) => [r.key, r.value]));
        if (!selectedVoice && map.has("tts:voice")) {
          selectedVoice = map.get("tts:voice");
        }
        if (!customInstructions && map.has("prompt:tts-instructions")) {
          customInstructions = map.get("prompt:tts-instructions");
        }
      }

      // If still not set, load the Global Default Voice configured by the author/owner
      if (!selectedVoice || !customInstructions) {
        const globalRecords = await db
          .select()
          .from(userMemory)
          .where(
            or(
              eq(userMemory.key, "global:tts:voice"),
              eq(userMemory.key, "global:prompt:tts-instructions"),
              eq(userMemory.key, "tts:voice"),
              eq(userMemory.key, "prompt:tts-instructions")
            )
          );
        const globalMap = new Map(globalRecords.map((r) => [r.key, r.value]));
        if (!selectedVoice) {
          selectedVoice = globalMap.get("global:tts:voice") || globalMap.get("tts:voice");
        }
        if (!customInstructions) {
          customInstructions =
            globalMap.get("global:prompt:tts-instructions") ||
            globalMap.get("prompt:tts-instructions");
        }
      }
    } catch {
      // Fallback silently if DB lookup fails
    }
  }

  const effectiveVoice = selectedVoice || "Kore";

  if (!customInstructions) {
    try {
      const ttsTemplate = getDefaultTemplate("tts-instructions");
      customInstructions = interpolateTemplate(ttsTemplate, { target_language });
    } catch {
      customInstructions = `Speak in ${target_language} with clear, native pronunciation. Calm, measured pace for learners.`;
    }
  } else {
    customInstructions = interpolateTemplate(customInstructions, { target_language });
  }

  const hash = createHash("md5")
    .update(`${resolvedLang}:${effectiveVoice}:${customInstructions}:${normalized.toLowerCase()}`)
    .digest("hex");
  const cacheKey = `${resolvedLang}/${effectiveVoice}/${hash}`;

  // 2. Check memory cache first
  const existing = memoryAudioCache.get(cacheKey);
  if (existing && !options?.skipCache) {
    return {
      url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
      buffer: existing.buffer,
      mimeType: existing.mimeType,
    };
  }

  // 3. Check persistent database cache (survives restarts/deployments forever)
  if (!options?.skipCache) {
    const dbCached = await getPersistentCachedAudio(cacheKey);
    if (dbCached) {
      return {
        url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
        buffer: dbCached.buffer,
        mimeType: dbCached.mimeType,
      };
    }
  }

  // 4. Model fallback chain:
  // 1. gemini-3.8-flash-tts
  // 2. gemini-3.8-flash-lite-tts
  // 3. OpenAI TTS (if key exists)
  const geminiModels = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
  let lastError: unknown = null;

  const ai = getGeminiClient();

  for (const model of geminiModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: normalized,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: effectiveVoice },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Data = part?.inlineData?.data;

      if (base64Data) {
        // Gemini returns raw 24kHz 16-bit PCM little-endian
        const wavBuffer = pcmToWav(base64Data, 24000, 1);

        memoryAudioCache.set(cacheKey, {
          buffer: wavBuffer,
          mimeType: "audio/wav",
        });

        // Persist permanently in database so Gemini is NEVER called again for this phrase
        try {
          await db
            .insert(audioCache)
            .values({
              text: cacheKey,
              language: resolvedLang,
              r2Key: `base64:wav:${wavBuffer.toString("base64")}`,
            })
            .onConflictDoUpdate({
              target: [audioCache.text, audioCache.language],
              set: { r2Key: `base64:wav:${wavBuffer.toString("base64")}` },
            });
        } catch (dbErr) {
          console.warn("Could not write audio to database cache:", dbErr);
        }

        return {
          url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
          buffer: wavBuffer,
          mimeType: "audio/wav",
        };
      }
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`TTS attempt with model ${model} failed (${errMsg}), trying next...`);
    }
  }

  // 5. Fallback to OpenAI TTS if available
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const openAiVoice = GEMINI_TO_OPENAI_VOICE[effectiveVoice] || "alloy";
      const mp3Response = await openai.audio.speech.create({
        model: "tts-1",
        voice: openAiVoice,
        input: normalized,
      });

      const arrayBuffer = await mp3Response.arrayBuffer();
      const mp3Buffer = Buffer.from(arrayBuffer);

      memoryAudioCache.set(cacheKey, {
        buffer: mp3Buffer,
        mimeType: "audio/mpeg",
      });

      // Persist permanently in database
      try {
        await db
          .insert(audioCache)
          .values({
            text: cacheKey,
            language: resolvedLang,
            r2Key: `base64:mp3:${mp3Buffer.toString("base64")}`,
          })
          .onConflictDoUpdate({
            target: [audioCache.text, audioCache.language],
            set: { r2Key: `base64:mp3:${mp3Buffer.toString("base64")}` },
          });
      } catch (dbErr) {
        console.warn("Could not write audio to database cache:", dbErr);
      }

      return {
        url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
        buffer: mp3Buffer,
        mimeType: "audio/mpeg",
      };
    } catch (openAiErr) {
      console.error("OpenAI TTS fallback failed:", openAiErr);
    }
  }

  // If all server TTS options fail, rethrow with descriptive message
  const message =
    lastError instanceof Error
      ? lastError.message
      : "Audio service temporarily rate-limited. Falling back to browser speech synthesis.";
  throw new Error(message);
}
