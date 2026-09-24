"use client";

import { useState, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { reviewCard } from "@/lib/actions/srs";
import type { FlashcardReviewExercise } from "@/lib/content/types";
import type { Quality } from "@/lib/srs";
import { useAudio } from "@/hooks/use-audio";
import { ReplayButton } from "@/components/replay-button";
import { AudioSpinner } from "@/components/audio-spinner";

const QUALITY_BUTTONS: { label: string; quality: Quality; color: string }[] = [
  { label: "Again", quality: 0, color: "bg-red-500 hover:bg-red-600" },
  { label: "Hard", quality: 3, color: "bg-orange-500 hover:bg-orange-600" },
  { label: "Good", quality: 4, color: "bg-lingo-blue hover:bg-lingo-blue/90" },
  { label: "Easy", quality: 5, color: "bg-lingo-green hover:bg-lingo-green/90" },
];

function cleanTextForTTS(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\\n/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links -> text
    .replace(/[#*_`~[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFlashcardContent(exercise: FlashcardReviewExercise): {
  meaning: string;
  translation: string;
} {
  let meaning = exercise.meaning?.trim() || "";
  let translation = exercise.translation?.trim() || "";

  if (!meaning && !translation && exercise.back) {
    const rawBack = exercise.back.replace(/\\n/g, "\n").trim();
    const lines = rawBack.split("\n").map((l) => l.trim()).filter(Boolean);

    let parsedMeaning = "";
    let parsedTranslation = "";

    for (const line of lines) {
      if (/^(meaning|definition|含义|意思)[:：]\s*/i.test(line)) {
        parsedMeaning = line.replace(/^(meaning|definition|含义|意思)[:：]\s*/i, "");
      } else if (/^(translation|chinese|中文|翻译)[:：]\s*/i.test(line)) {
        parsedTranslation = line.replace(/^(translation|chinese|中文|翻译)[:：]\s*/i, "");
      }
    }

    if (!parsedMeaning && !parsedTranslation) {
      if (lines.length >= 2) {
        if (/[\u4e00-\u9fa5]/.test(lines[0]) && !/[\u4e00-\u9fa5]/.test(lines[1])) {
          parsedTranslation = lines[0];
          parsedMeaning = lines[1];
        } else {
          parsedMeaning = lines[0];
          parsedTranslation = lines[1];
        }
      } else if (lines.length === 1) {
        const single = lines[0];
        if (/[\u4e00-\u9fa5]/.test(single)) {
          parsedTranslation = single;
        } else {
          parsedMeaning = single;
        }
      }
    }

    meaning = parsedMeaning || meaning;
    translation = parsedTranslation || translation;

    if (!meaning && !translation && rawBack) {
      meaning = rawBack;
    }
  }

  return { meaning, translation };
}

export function FlashcardReview({
  exercise,
  language,
  onResult,
  onContinue,
  autoplayAudio = true,
}: {
  exercise: FlashcardReviewExercise;
  language: string;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  autoplayAudio?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [rated, setRated] = useState(false);
  const { play, stop, prefetch, loading: audioLoading } = useAudio();

  const { meaning, translation } = parseFlashcardContent(exercise);

  const frontTTS = cleanTextForTTS(exercise.front);
  const backTTS = cleanTextForTTS(exercise.back || meaning);

  // Prefetch both sides of the flashcard immediately
  useEffect(() => {
    const toFetch: string[] = [];
    if (frontTTS && !exercise.noAudio?.includes("front")) toFetch.push(frontTTS);
    if (backTTS && !exercise.noAudio?.includes("back")) toFetch.push(backTTS);
    if (toFetch.length > 0) prefetch(toFetch, language);
  }, [frontTTS, backTTS, exercise.noAudio, language, prefetch]);

  // Auto-play front audio when the flashcard is displayed
  useEffect(() => {
    if (autoplayAudio && frontTTS && !exercise.noAudio?.includes("front")) {
      play(frontTTS, language);
    }
    return stop;
  }, [exercise, autoplayAudio, frontTTS, language, play, stop]);

  const handlePlayFront = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (frontTTS) {
        play(frontTTS, language);
      }
    },
    [frontTTS, language, play]
  );

  const handlePlayBack = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (backTTS) {
        play(backTTS, language);
      }
    },
    [backTTS, language, play]
  );

  // Keyboard shortcut to replay audio ('r' or 'a')
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "r" || e.key === "R" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        handlePlayFront();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayFront]);

  async function handleRate(quality: Quality) {
    if (rated) return;
    setRated(true);

    // Update SRS for each tracked word
    const words = typeof exercise.srsWords === "string" ? [exercise.srsWords] : exercise.srsWords;
    for (const w of words) {
      reviewCard(w, language, quality).catch(() => {});
    }

    const correct = quality >= 3;
    const label = QUALITY_BUTTONS.find((b) => b.quality === quality)!.label;
    onResult(correct, label);
    onContinue();
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Flashcard Container */}
      <div
        onClick={() => !revealed && setRevealed(true)}
        className={`relative rounded-2xl border-2 border-b-4 p-8 text-center transition-all ${
          !revealed
            ? "border-lingo-border bg-white cursor-pointer hover:bg-lingo-gray/20 active:border-b-2 active:mt-[2px]"
            : "border-lingo-border bg-white shadow-sm"
        }`}
      >
        {/* Top bar with audio replay button */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-lingo-text-light/70">
            🎴 Flashcard
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-lingo-text-light hidden sm:inline">
              Listen
            </span>
            <ReplayButton onPlay={() => handlePlayFront()} />
          </div>
        </div>

        {/* Front Content (Word) */}
        <div className="prose prose-2xl font-black text-lingo-text [&>p]:m-0 my-3 text-center">
          <Markdown remarkPlugins={[remarkBreaks]}>
            {exercise.front.replace(/\\n/g, "\n")}
          </Markdown>
        </div>

        {!revealed && (
          <div className="mt-6 flex flex-col items-center gap-1">
            <p className="text-sm font-bold text-lingo-blue">
              Tap anywhere to reveal
            </p>
            <p className="text-xs text-lingo-text-light">
              (Press R to replay audio)
            </p>
          </div>
        )}

        {/* Revealed Back Content */}
        {revealed && (
          <div className="mt-6 pt-5 border-t-2 border-lingo-border space-y-3.5 text-left">
            {/* Meaning Row directly below the word */}
            {meaning && (
              <div className="rounded-xl bg-lingo-bg/60 p-3.5 border border-lingo-border/60">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-lingo-blue">
                    Meaning
                  </span>
                  {backTTS && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-lingo-text-light">
                        Audio
                      </span>
                      <ReplayButton onPlay={() => handlePlayBack()} />
                    </div>
                  )}
                </div>
                <div className="prose prose-base font-bold text-lingo-text [&>p]:m-0">
                  <Markdown remarkPlugins={[remarkBreaks]}>{meaning}</Markdown>
                </div>
              </div>
            )}

            {/* Translation Row in Chinese in another row below meaning */}
            {translation && (
              <div className="rounded-xl bg-lingo-card p-3.5 border border-lingo-border/60">
                <div className="text-[11px] font-bold uppercase tracking-wider text-lingo-green-dark mb-1">
                  Translation (中文)
                </div>
                <div className="prose prose-base font-bold text-lingo-text [&>p]:m-0">
                  <Markdown remarkPlugins={[remarkBreaks]}>{translation}</Markdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audio loading spinner */}
      <div className="min-h-[32px] flex items-center justify-center">
        <AudioSpinner loading={audioLoading} />
      </div>

      {/* Quality Rating Buttons */}
      {revealed && !rated && (
        <div className="mt-2">
          <p className="text-center text-xs font-bold text-lingo-text-light uppercase tracking-wider mb-2">
            How well did you know this?
          </p>
          <div className="grid grid-cols-4 gap-2">
            {QUALITY_BUTTONS.map((btn) => (
              <button
                key={btn.quality}
                onClick={() => handleRate(btn.quality)}
                className={`${btn.color} text-white font-bold py-3 px-2 rounded-xl border-b-4 border-black/20 active:border-b-0 active:mt-1 transition-all text-sm cursor-pointer shadow-sm`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
