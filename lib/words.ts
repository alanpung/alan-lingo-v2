import { GoogleGenAI, Type } from "@google/genai";
import { db } from "@/lib/db";
import { dictionaryWord, wordCache } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { langCodeToName } from "@/lib/prompts";

export interface WordEntry {
  word: string;
  pos: string;
  cefr_level: string;
  english_translation: string;
  example_sentence_native: string;
  example_sentence_english: string;
  gender: string;
  useful_for_flashcard?: boolean;
  word_frequency?: number;
  goethe_b1_wordlist?: boolean;
}

export type WordLookupResult = {
  found: boolean;
  source?: "dictionary" | "ai";
  word: string;
  translation?: string;
  pos?: string | null;
  gender?: string | null;
  cefrLevel?: string | null;
  exampleNative?: string | null;
  exampleEnglish?: string | null;
};

// In-memory cache for ultra-fast lookup and offline resilience
const memoryWordCache = new Map<string, WordLookupResult>();

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

export async function aiLookup(
  word: string,
  language: string,
): Promise<WordLookupResult | null> {
  const normalizedWord = word.toLowerCase().trim();
  const cacheKey = `${language}:${normalizedWord}`;

  const inMemory = memoryWordCache.get(cacheKey);
  if (inMemory) return inMemory;

  // Try DB cache if database is reachable
  try {
    const cached = await db
      .select()
      .from(wordCache)
      .where(
        and(eq(wordCache.word, normalizedWord), eq(wordCache.language, language)),
      )
      .limit(1);

    if (cached.length > 0) {
      const c = cached[0];
      const result: WordLookupResult = {
        found: true,
        source: "ai",
        word: c.baseForm || normalizedWord,
        translation: c.translation,
        pos: c.pos || null,
        gender: c.gender || null,
        cefrLevel: c.cefrLevel || null,
        exampleNative: c.exampleNative || null,
        exampleEnglish: c.exampleEnglish || null,
      };
      memoryWordCache.set(cacheKey, result);
      return result;
    }
  } catch {
    // Database connection optional, continue to AI lookup
  }

  try {
    const target_language = langCodeToName[language] || language;
    const prompt = `Analyze this ${target_language} word for a language learner. Provide base dictionary form, English translation, part of speech, grammatical gender (if applicable or null), CEFR level (A1, A2, B1, B2, C1, C2), a simple native example sentence, and its English translation. Word: "${word}"`;

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            baseForm: { type: Type.STRING },
            translation: { type: Type.STRING },
            pos: { type: Type.STRING },
            gender: { type: Type.STRING, nullable: true },
            cefrLevel: { type: Type.STRING },
            exampleNative: { type: Type.STRING },
            exampleEnglish: { type: Type.STRING },
          },
          required: [
            "baseForm",
            "translation",
            "pos",
            "cefrLevel",
            "exampleNative",
            "exampleEnglish",
          ],
        },
      },
    });

    if (!response.text) return null;
    const analysis = JSON.parse(response.text);

    const result: WordLookupResult = {
      found: true,
      source: "ai",
      word: analysis.baseForm || word,
      translation: analysis.translation,
      pos: analysis.pos || null,
      gender: analysis.gender || null,
      cefrLevel: analysis.cefrLevel || null,
      exampleNative: analysis.exampleNative || null,
      exampleEnglish: analysis.exampleEnglish || null,
    };

    memoryWordCache.set(cacheKey, result);

    // Save to DB cache in background if DB is up
    db.insert(wordCache)
      .values({
        word: normalizedWord,
        language,
        baseForm: analysis.baseForm || normalizedWord,
        translation: analysis.translation,
        pos: analysis.pos || null,
        gender: analysis.gender || null,
        cefrLevel: analysis.cefrLevel || null,
        exampleNative: analysis.exampleNative || null,
        exampleEnglish: analysis.exampleEnglish || null,
      })
      .onConflictDoNothing()
      .catch(() => {});

    return result;
  } catch (err) {
    console.error("AI lookup error:", err);
    return null;
  }
}

export async function lookupWord(
  word: string,
  language: string,
): Promise<WordLookupResult> {
  const cleanWord = word.trim().toLowerCase();
  const cacheKey = `${language}:${cleanWord}`;

  const inMemory = memoryWordCache.get(cacheKey);
  if (inMemory) return inMemory;

  // 1. Try dictionary database if available
  try {
    const [entry] = await db
      .select()
      .from(dictionaryWord)
      .where(
        and(
          eq(dictionaryWord.word, cleanWord),
          eq(dictionaryWord.language, language),
        ),
      )
      .limit(1);

    if (entry) {
      const res: WordLookupResult = {
        found: true,
        source: "dictionary",
        word: entry.word,
        translation: entry.englishTranslation,
        pos: entry.pos,
        gender: entry.gender || null,
        cefrLevel: entry.cefrLevel,
        exampleNative: entry.exampleSentenceNative,
        exampleEnglish: entry.exampleSentenceEnglish,
      };
      memoryWordCache.set(cacheKey, res);
      return res;
    }
  } catch {
    // Database query failed, fallback to AI
  }

  // 2. Try Gemini AI fallback
  const aiResult = await aiLookup(word, language);
  if (aiResult) {
    return aiResult;
  }

  // 3. Not found
  return { found: false, word };
}
