"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLanguageName } from "@/lib/languages";
import { createManualUnit } from "@/lib/actions/units";

const LANGUAGES = [
  "en", "es", "fr", "de", "pt", "it", "nl", "ru", "zh", "ja", "ko", "ar",
  "hi", "tr", "pl", "sv", "da", "no", "fi", "cs", "ro", "hu", "el", "he",
  "th", "vi", "id", "ms", "uk", "bg",
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function CreateUnitForm({
  onClose,
  defaultTargetLanguage,
}: {
  onClose: () => void;
  defaultTargetLanguage?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(
    defaultTargetLanguage ?? "es"
  );
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [level, setLevel] = useState("A1");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please enter a unit title");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await createManualUnit({
          title: title.trim(),
          targetLanguage,
          sourceLanguage,
          level,
        });

        if (result.success && result.unitId) {
          router.push(`/units/edit/${result.unitId}`);
        } else {
          setError(result.error ?? "Failed to create unit");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border-2 border-lingo-border bg-white p-5 shadow-[0_2px_0_0] shadow-lingo-border"
    >
      <h3 className="mb-4 text-base font-bold text-lingo-text">
        Create a New Unit
      </h3>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
            Unit Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Travel & Airport Vocabulary"
            disabled={isPending}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
              I want to learn (Target)
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-semibold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border focus:border-lingo-green focus:outline-none"
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {getLanguageName(code)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
              Explanation Language (Source)
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-semibold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border focus:border-lingo-green focus:outline-none"
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {getLanguageName(code)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
            Proficiency Level
          </label>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevel(lvl)}
                disabled={isPending}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  level === lvl
                    ? "bg-lingo-green text-white"
                    : "border-2 border-lingo-border bg-white text-lingo-text hover:bg-lingo-gray/40"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Creating..." : "Create & Edit Lessons"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>

        <Link
          href="/chat?prompt=I%20want%20to%20create%20a%20new%20personalised%20unit"
          className="text-xs font-bold text-lingo-blue hover:underline"
        >
          ✨ Generate via AI Tutor instead
        </Link>
      </div>
    </form>
  );
}
