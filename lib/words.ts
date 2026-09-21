import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { db } from "@/lib/db";
import { dictionaryWord, wordCache } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getDefaultTemplate,
  interpolateTemplate,
  langCodeToName,
} from "@/lib/prompts";
import { detectTextLanguage } from "@/lib/language-detector";

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

function rowToWordEntry(row: typeof dictionaryWord.$inferSelect): WordEntry {
  return {
    word: row.word,
    pos: row.pos ?? "",
    cefr_level: row.cefrLevel ?? "",
    english_translation: row.englishTranslation,
    example_sentence_native: row.exampleSentenceNative ?? "",
    example_sentence_english: row.exampleSentenceEnglish ?? "",
    gender: row.gender ?? "",
    useful_for_flashcard: row.usefulForFlashcard ?? true,
    word_frequency: row.wordFrequency ?? undefined,
    goethe_b1_wordlist: row.goetheB1Wordlist ?? undefined,
  };
}

export async function loadLanguageRaw(langCode: string): Promise<WordEntry[]> {
  try {
    const rows = await db
      .select()
      .from(dictionaryWord)
      .where(eq(dictionaryWord.language, langCode));

    return rows.map(rowToWordEntry);
  } catch (err) {
    console.error("Failed to load raw language words from db:", err);
    return [];
  }
}

export async function loadLanguage(
  langCode: string,
): Promise<Map<string, WordEntry>> {
  const words = await loadLanguageRaw(langCode);
  const map = new Map<string, WordEntry>();
  for (const w of words) {
    map.set(w.word.toLowerCase(), w);
  }
  return map;
}

const wordAnalysisSchema = z.object({
  baseForm: z.string().describe("The dictionary/base form of the word"),
  translation: z.string().describe("English translation"),
  pos: z
    .string()
    .describe(
      "Part of speech (noun/verb/adjective/adverb/preposition/conjunction/article/pronoun)",
    ),
  gender: z
    .string()
    .nullable()
    .describe("Grammatical gender if applicable (masculine/feminine/neuter)"),
  cefrLevel: z.string().describe("CEFR level (A1/A2/B1/B2/C1/C2)"),
  exampleNative: z
    .string()
    .describe("A simple example sentence using this word"),
  exampleEnglish: z
    .string()
    .describe("English translation of the example sentence"),
});

export async function aiLookup(
  word: string,
  language: string,
  nativeLanguage?: string,
) {
  const normalizedWord = word.toLowerCase().trim();
  const wordLang = detectTextLanguage(word, { targetLanguage: language });
  const target_language = langCodeToName[wordLang] || wordLang;
  const native_language = nativeLanguage
    ? langCodeToName[nativeLanguage] || nativeLanguage
    : wordLang === "en"
      ? "Chinese"
      : "English";

  // Check DB cache first
  try {
    const cached = await db
      .select()
      .from(wordCache)
      .where(
        and(eq(wordCache.word, normalizedWord), eq(wordCache.language, wordLang)),
      )
      .limit(1);

    if (cached.length > 0) {
      const c = cached[0];
      return {
        found: true as const,
        source: "ai" as const,
        word: c.baseForm || normalizedWord,
        translation: c.translation,
        pos: c.pos || null,
        gender: c.gender || null,
        cefrLevel: c.cefrLevel || null,
        exampleNative: c.exampleNative || null,
        exampleEnglish: c.exampleEnglish || null,
      };
    }
  } catch {
    // Database connection optional, proceed to AI lookup
  }

  try {
    let prompt: string;
    if (wordLang === "en") {
      prompt = `Analyze the English word "${word}".
Return:
- baseForm: dictionary/base form of the word
- translation: accurate translation or definition in ${native_language}
- pos: part of speech (noun, verb, adjective, etc.)
- gender: null
- cefrLevel: CEFR level (A1, A2, B1, B2, C1, C2)
- exampleNative: a natural example sentence in English using this word
- exampleEnglish: translation of the example sentence in ${native_language}`;
    } else {
      prompt = `Analyze the ${target_language} word "${word}".
Return:
- baseForm: dictionary/base form of the word
- translation: accurate translation or definition in ${native_language}
- pos: part of speech (noun, verb, adjective, etc.)
- gender: grammatical gender if applicable (or null)
- cefrLevel: CEFR level (A1, A2, B1, B2, C1, C2)
- exampleNative: a natural example sentence in ${target_language} using this word
- exampleEnglish: translation of the example sentence in ${native_language}`;
    }

    const model = getModel("gemini-3.5-flash-lite");
    const { object: analysis } = await generateObject({
      model,
      schema: wordAnalysisSchema,
      prompt,
    });

    // Cache in DB (fire and forget)
    db.insert(wordCache)
      .values({
        word: normalizedWord,
        language: wordLang,
        baseForm: analysis.baseForm || normalizedWord,
        translation: analysis.translation,
        pos: analysis.pos || null,
        gender: analysis.gender || null,
        cefrLevel: analysis.cefrLevel || null,
        exampleNative: analysis.exampleNative || null,
        exampleEnglish: analysis.exampleEnglish || null,
      })
      .onConflictDoNothing()
      .catch((err: unknown) => {
        console.error("Failed to cache word:", err);
      });

    return {
      found: true as const,
      source: "ai" as const,
      word: analysis.baseForm || word,
      translation: analysis.translation,
      pos: analysis.pos || null,
      gender: analysis.gender || null,
      cefrLevel: analysis.cefrLevel || null,
      exampleNative: analysis.exampleNative || null,
      exampleEnglish: analysis.exampleEnglish || null,
    };
  } catch (err) {
    console.error("AI lookup failed:", err);
    return null;
  }
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

export async function lookupWord(
  word: string,
  language: string,
  nativeLanguage?: string,
): Promise<WordLookupResult> {
  const wordLang = detectTextLanguage(word, { targetLanguage: language });

  // 1. Try dictionary database with wordLang or course language
  try {
    const entries = await db
      .select()
      .from(dictionaryWord)
      .where(
        and(
          eq(dictionaryWord.word, word.toLowerCase()),
        ),
      )
      .limit(5);

    // Look for exact language match
    const exactMatch = entries.find(
      (e) => e.language === wordLang || e.language === language
    ) || entries[0];

    if (exactMatch) {
      return {
        found: true,
        source: "dictionary",
        word: exactMatch.word,
        translation: exactMatch.englishTranslation,
        pos: exactMatch.pos,
        gender: exactMatch.gender || null,
        cefrLevel: exactMatch.cefrLevel,
        exampleNative: exactMatch.exampleSentenceNative,
        exampleEnglish: exactMatch.exampleSentenceEnglish,
      };
    }
  } catch {
    // Fall back to AI if DB is unreachable
  }

  // 2. Try AI fallback with detected language
  const aiResult = await aiLookup(word, wordLang, nativeLanguage);
  if (aiResult) {
    return aiResult;
  }

  // 3. Not found
  return { found: false, word };
}

export async function getWordsByLevel(
  language: string,
  level: string,
): Promise<WordEntry[]> {
  const upperLevel = level.toUpperCase();
  try {
    const rows = await db
      .select()
      .from(dictionaryWord)
      .where(
        and(
          eq(dictionaryWord.language, language),
          eq(dictionaryWord.cefrLevel, upperLevel),
        ),
      );

    return rows.filter((r) => r.usefulForFlashcard !== false).map(rowToWordEntry);
  } catch (err) {
    console.error("Failed to get words by level:", err);
    return [];
  }
}
