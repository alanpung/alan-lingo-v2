import { createHash } from "crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  getDefaultTemplate,
  interpolateTemplate,
  langCodeToName,
} from "@/lib/prompts";

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

// Memory cache for generated audio to minimize API calls and avoid external storage dependencies
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

export async function generateSpeech(
  text: string,
  language: string,
): Promise<{ url: string; buffer: Buffer }> {
  const normalized = text.trim();
  const hash = createHash("md5").update(`${language}:${normalized.toLowerCase()}`).digest("hex");
  const cacheKey = `${language}/${hash}`;

  const existing = memoryAudioCache.get(cacheKey);
  if (existing) {
    return {
      url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
      buffer: existing.buffer,
    };
  }

  const target_language = langCodeToName[language] || language;
  let customInstructions = "";
  try {
    const ttsTemplate = getDefaultTemplate("tts-instructions");
    customInstructions = interpolateTemplate(ttsTemplate, { target_language });
  } catch {
    customInstructions = `Speak in ${target_language} with clear, native pronunciation. Calm, measured pace for learners.`;
  }

  const prompt = `${customInstructions}\nRead the following text aloud with clear, natural pronunciation. Speak only the exact words provided, saying nothing else:\n\n${normalized}`;

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const base64Data = part?.inlineData?.data;

  if (!base64Data) {
    throw new Error("No audio content returned from Gemini TTS");
  }

  // Gemini returns audio/l16 (raw 16-bit PCM little-endian at 24kHz)
  const wavBuffer = pcmToWav(base64Data, 24000, 1);

  // Store in memory cache
  memoryAudioCache.set(cacheKey, {
    buffer: wavBuffer,
    mimeType: "audio/wav",
  });

  return {
    url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
    buffer: wavBuffer,
  };
}
