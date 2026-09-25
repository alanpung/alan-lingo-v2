"use client";

import { useState, useMemo, useTransition } from "react";
import { bulkAddWordsToSrs, addWordToSrs, removeWordFromSrs, removeAllWordsFromSrs } from "@/lib/actions/srs";
import { useRouter } from "next/navigation";

interface Word {
  word: string;
  cefr_level: string;
  english_translation: string;
  pos: string;
  example_sentence_native: string;
  example_sentence_english: string;
  gender: string;
  word_frequency?: number;
  goethe_b1_wordlist?: boolean;
}

interface SrsCard {
  word: string;
  language: string;
  translation: string;
  status: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  createdAt: Date;
}

interface SrsStats {
  total: number;
  due: number;
  new: number;
  learning: number;
  review: number;
  learned: number;
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const PAGE_SIZE = 50;

const LEVEL_COLORS: Record<string, string> = {
  A1: "bg-lingo-green text-white",
  A2: "bg-lingo-green-dark text-white",
  B1: "bg-lingo-blue text-white",
  B2: "bg-lingo-blue-dark text-white",
  C1: "bg-lingo-purple text-white",
  C2: "bg-lingo-red text-white",
};

const POS_LABELS: Record<string, string> = {
  noun: "Noun",
  verb: "Verb",
  adj: "Adj",
  adjective: "Adj",
  adjektiv: "Adj",
  adv: "Adv",
  adverb: "Adv",
  pronoun: "Pron",
  conjunction: "Conj",
  interjection: "Intj",
  num: "Num",
  number: "Num",
  numeral: "Num",
};

type Tab = "all" | "my-words" | "stats";
type SrsFilter = "all" | "due" | "new" | "learning" | "learned";

export function WordExplorer({
  words,
  srsCards,
  srsStats,
  language,
}: {
  words: Word[];
  srsCards: SrsCard[];
  srsStats: SrsStats;
  language: string;
}) {
  const [tab, setTab] = useState<Tab>("my-words");

  return (
    <div>
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-lingo-text">Words</h1>
        <p className="text-sm text-lingo-text-light mt-1">
          {words.length.toLocaleString()} words available
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex rounded-xl border-2 border-lingo-border bg-lingo-card overflow-hidden">
        <button
          onClick={() => setTab("my-words")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            tab === "my-words"
              ? "bg-lingo-blue text-white"
              : "text-lingo-text-light hover:text-lingo-text"
          }`}
        >
          My Words
          {srsStats.total > 0 && (
            <span className="ml-1.5 text-xs opacity-80">
              ({srsStats.total})
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("all")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            tab === "all"
              ? "bg-lingo-blue text-white"
              : "text-lingo-text-light hover:text-lingo-text"
          }`}
        >
          Add Words
        </button>
        <button
          onClick={() => setTab("stats")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            tab === "stats"
              ? "bg-lingo-blue text-white"
              : "text-lingo-text-light hover:text-lingo-text"
          }`}
        >
          📊 Stats
        </button>
      </div>

      {tab === "all" && (
        <AllWordsTab words={words} srsCards={srsCards} language={language} />
      )}
      {tab === "my-words" && (
        <MyWordsTab srsCards={srsCards} srsStats={srsStats} language={language} />
      )}
      {tab === "stats" && (
        <StatsTab words={words} srsCards={srsCards} />
      )}
    </div>
  );
}

/* ─── All Words Tab ─── */

function AllWordsTab({
  words,
  srsCards,
  language,
}: {
  words: Word[];
  srsCards: SrsCard[];
  language: string;
}) {
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const srsSet = useMemo(
    () => new Set(srsCards.map((c) => c.word)),
    [srsCards]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return words.filter((w) => {
      if (selectedLevel && w.cefr_level !== selectedLevel) return false;
      if (
        q &&
        !w.word.toLowerCase().includes(q) &&
        !w.english_translation.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [words, selectedLevel, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const levelWords = useMemo(() => {
    if (!selectedLevel) return [];
    return words.filter((w) => w.cefr_level === selectedLevel);
  }, [words, selectedLevel]);

  const newWordsInLevel = useMemo(
    () => levelWords.filter((w) => !srsSet.has(w.word.toLowerCase())),
    [levelWords, srsSet]
  );

  const goetheWords = useMemo(
    () => words.filter((w) => w.goethe_b1_wordlist === true),
    [words]
  );

  const newGoetheWords = useMemo(
    () => goetheWords.filter((w) => !srsSet.has(w.word.toLowerCase())),
    [goetheWords, srsSet]
  );

  function handleLevelClick(level: string) {
    setSelectedLevel((prev) => (prev === level ? "" : level));
    setVisibleCount(PAGE_SIZE);
  }

  function handleBulkAdd() {
    startTransition(async () => {
      await bulkAddWordsToSrs(
        newWordsInLevel.map((w) => ({
          word: w.word,
          translation: w.english_translation,
        })),
        language
      );
      router.refresh();
    });
  }

  function handleGoetheBulkAdd() {
    startTransition(async () => {
      await bulkAddWordsToSrs(
        newGoetheWords.map((w) => ({
          word: w.word,
          translation: w.english_translation,
        })),
        language
      );
      router.refresh();
    });
  }

  function handleToggleWord(word: Word) {
    const key = word.word.toLowerCase();
    startTransition(async () => {
      if (srsSet.has(key)) {
        await removeWordFromSrs(word.word, language);
      } else {
        await addWordToSrs(word.word, language, word.english_translation);
      }
      router.refresh();
    });
  }

  return (
    <div>
      {/* CEFR level pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CEFR_LEVELS.map((level) => {
          const count = words.filter((w) => w.cefr_level === level).length;
          const active = selectedLevel === level;
          return (
            <button
              key={level}
              onClick={() => handleLevelClick(level)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition-all ${
                active
                  ? LEVEL_COLORS[level]
                  : "bg-lingo-card border-2 border-lingo-border text-lingo-text hover:border-lingo-gray-dark"
              }`}
            >
              {level}
              <span
                className={`ml-1.5 text-xs ${active ? "opacity-80" : "text-lingo-text-light"}`}
              >
                {count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk add button */}
      {newGoetheWords.length > 0 && (
        <button
          onClick={handleGoetheBulkAdd}
          disabled={isPending}
          className="mb-4 w-full rounded-xl bg-lingo-blue py-3 text-sm font-bold text-white hover:bg-lingo-blue-dark transition-colors disabled:opacity-50"
        >
          {isPending
            ? "Adding..."
            : `Add Goethe B1 Wordlist (${newGoetheWords.length} words)`}
        </button>
      )}

      {selectedLevel && newWordsInLevel.length > 0 && (
        <button
          onClick={handleBulkAdd}
          disabled={isPending}
          className="mb-4 w-full rounded-xl bg-lingo-green py-3 text-sm font-bold text-white hover:bg-lingo-green-dark transition-colors disabled:opacity-50"
        >
          {isPending
            ? "Adding..."
            : `Add all ${newWordsInLevel.length} ${selectedLevel} words to My Words`}
        </button>
      )}

      {selectedLevel && newWordsInLevel.length === 0 && levelWords.length > 0 && (
        <p className="mb-4 rounded-xl border-2 border-lingo-green/30 bg-lingo-green/5 py-3 text-center text-sm font-bold text-lingo-green-dark">
          All {selectedLevel} words already in My Words
        </p>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search words or translations..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className="w-full rounded-xl border-2 border-lingo-border bg-lingo-card px-4 py-2.5 text-sm font-bold text-lingo-text placeholder:text-lingo-text-light/60 focus:border-lingo-blue focus:outline-none"
        />
      </div>

      {/* Results count */}
      <p className="mb-3 text-xs font-bold text-lingo-text-light">
        {filtered.length.toLocaleString()} word
        {filtered.length !== 1 ? "s" : ""}
        {selectedLevel && ` at ${selectedLevel}`}
        {search && ` matching "${search}"`}
      </p>

      {/* Word list */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-lingo-text-light">
          No words found.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((w, i) => (
            <AllWordCard
              key={`${w.word}-${i}`}
              word={w}
              inSrs={srsSet.has(w.word.toLowerCase())}
              onToggle={() => handleToggleWord(w)}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-4 w-full rounded-xl border-2 border-lingo-border bg-lingo-card py-3 text-sm font-bold text-lingo-text-light hover:border-lingo-gray-dark hover:text-lingo-text transition-colors"
        >
          Show more ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} of{" "}
          {(filtered.length - visibleCount).toLocaleString()} remaining)
        </button>
      )}
    </div>
  );
}

function AllWordCard({
  word: w,
  inSrs,
  onToggle,
  isPending,
}: {
  word: Word;
  inSrs: boolean;
  onToggle: () => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const posLabel = POS_LABELS[w.pos] ?? w.pos;

  return (
    <div className="rounded-xl border-2 border-lingo-border bg-lingo-card hover:border-lingo-gray-dark transition-colors">
      <div
        className="flex items-center gap-2 p-4 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-base font-black text-lingo-text truncate">
              {w.word}
              {w.gender && (
                <span className="ml-1 text-xs font-bold text-lingo-text-light">
                  ({w.gender})
                </span>
              )}
            </span>
            <span className="text-sm text-lingo-text-light truncate">
              {w.english_translation}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {posLabel && (
            <span className="rounded-md bg-lingo-gray/60 px-2 py-0.5 text-xs font-bold text-lingo-text-light">
              {posLabel}
            </span>
          )}
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-bold ${LEVEL_COLORS[w.cefr_level] ?? "bg-lingo-gray text-lingo-text"}`}
          >
            {w.cefr_level}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            disabled={isPending}
            className={`ml-1 rounded-lg px-2 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
              inSrs
                ? "bg-lingo-green/10 text-lingo-green hover:bg-lingo-red/10 hover:text-lingo-red"
                : "bg-lingo-gray/60 text-lingo-text-light hover:bg-lingo-green/10 hover:text-lingo-green"
            }`}
            title={inSrs ? "Remove from My Words" : "Add to My Words"}
          >
            {inSrs ? "✓" : "+"}
          </button>
        </div>
      </div>

      {expanded && w.example_sentence_native && (
        <div className="mx-4 mb-4 border-t border-lingo-border pt-3 text-sm">
          <p className="font-bold text-lingo-text">
            {w.example_sentence_native}
          </p>
          <p className="text-lingo-text-light mt-0.5">
            {w.example_sentence_english}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── My Words Tab ─── */

function MyWordsTab({
  srsCards,
  srsStats,
  language,
}: {
  srsCards: SrsCard[];
  srsStats: SrsStats;
  language: string;
}) {
  const [filter, setFilter] = useState<SrsFilter>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    let cards = srsCards;

    // Apply SRS filter using real status column
    switch (filter) {
      case "due":
        cards = cards.filter(
          (c) => c.nextReviewAt && new Date(c.nextReviewAt) <= now && c.status !== "new"
        );
        break;
      case "new":
        cards = cards.filter((c) => c.status === "new");
        break;
      case "learning":
        cards = cards.filter((c) => c.status === "learning");
        break;
      case "learned":
        cards = cards.filter((c) => c.status === "review");
        break;
    }

    // Apply search
    const q = search.toLowerCase().trim();
    if (q) {
      cards = cards.filter(
        (c) =>
          c.word.includes(q) || c.translation.toLowerCase().includes(q)
      );
    }

    return cards;
  }, [srsCards, filter, search, now]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  function handleRemove(card: SrsCard) {
    startTransition(async () => {
      await removeWordFromSrs(card.word, language);
      router.refresh();
    });
  }

  function handleRemoveAll() {
    if (!confirm(`Delete all ${srsStats.total} saved words? This cannot be undone.`)) return;
    startTransition(async () => {
      await removeAllWordsFromSrs(language);
      router.refresh();
    });
  }

  const filters: { key: SrsFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: srsStats.total },
    { key: "due", label: "Due", count: srsStats.due },
    { key: "new", label: "New", count: srsStats.new },
    { key: "learning", label: "Learning", count: srsStats.learning },
    { key: "learned", label: "Learned", count: srsStats.learned },
  ];

  return (
    <div>
      {/* Stats bar */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 text-center">
          <p className="text-lg font-black text-lingo-blue">{srsStats.total}</p>
          <p className="text-xs font-bold text-lingo-text-light">Total</p>
        </div>
        <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 text-center">
          <p className="text-lg font-black text-lingo-text-light">{srsStats.new}</p>
          <p className="text-xs font-bold text-lingo-text-light">New</p>
        </div>
        <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 text-center">
          <p className="text-lg font-black text-lingo-orange">{srsStats.due}</p>
          <p className="text-xs font-bold text-lingo-text-light">Due</p>
        </div>
        <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 text-center">
          <p className="text-lg font-black text-lingo-green">{srsStats.learned}</p>
          <p className="text-xs font-bold text-lingo-text-light">Learned</p>
        </div>
      </div>

      {/* Delete all */}
      {srsCards.length > 0 && (
        <button
          onClick={handleRemoveAll}
          disabled={isPending}
          className="mb-4 w-full rounded-xl border-2 border-lingo-red/30 py-3 text-sm font-bold text-lingo-red hover:bg-lingo-red/10 transition-colors disabled:opacity-50"
        >
          {isPending ? "Deleting..." : "Delete All Words"}
        </button>
      )}

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setVisibleCount(PAGE_SIZE);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-all ${
              filter === f.key
                ? "bg-lingo-blue text-white"
                : "bg-lingo-card border-2 border-lingo-border text-lingo-text hover:border-lingo-gray-dark"
            }`}
          >
            {f.label}
            <span
              className={`ml-1.5 text-xs ${filter === f.key ? "opacity-80" : "text-lingo-text-light"}`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search my words..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className="w-full rounded-xl border-2 border-lingo-border bg-lingo-card px-4 py-2.5 text-sm font-bold text-lingo-text placeholder:text-lingo-text-light/60 focus:border-lingo-blue focus:outline-none"
        />
      </div>

      {/* Results count */}
      <p className="mb-3 text-xs font-bold text-lingo-text-light">
        {filtered.length.toLocaleString()} word
        {filtered.length !== 1 ? "s" : ""}
        {filter !== "all" && ` (${filter})`}
      </p>

      {/* Empty state */}
      {srsCards.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-lg font-bold text-lingo-text">No words yet</p>
          <p className="mt-1 text-sm text-lingo-text-light">
            Switch to &quot;Add Words&quot; and add words to start learning
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-lingo-text-light">
          No words match this filter.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((card) => (
            <SrsCardRow
              key={`${card.word}-${card.language}`}
              card={card}
              now={now}
              onRemove={() => handleRemove(card)}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-4 w-full rounded-xl border-2 border-lingo-border bg-lingo-card py-3 text-sm font-bold text-lingo-text-light hover:border-lingo-gray-dark hover:text-lingo-text transition-colors"
        >
          Show more ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} of{" "}
          {(filtered.length - visibleCount).toLocaleString()} remaining)
        </button>
      )}
    </div>
  );
}

function SrsCardRow({
  card,
  now,
  onRemove,
  isPending,
}: {
  card: SrsCard;
  now: Date;
  onRemove: () => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const isDue =
    card.nextReviewAt && card.status !== "new"
      ? new Date(card.nextReviewAt) <= now
      : false;
  const statusLabel = getStatusLabel(card.status);
  const statusStyle = STATUS_STYLES[statusLabel];

  return (
    <div className="rounded-xl border-2 border-lingo-border bg-lingo-card hover:border-lingo-gray-dark transition-colors">
      <div
        className="flex items-center gap-2 p-4 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-base font-black text-lingo-text truncate">
              {card.word}
            </span>
            <span className="text-sm text-lingo-text-light truncate">
              {card.translation}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDue && (
            <span className="rounded-md bg-lingo-orange/15 px-2 py-0.5 text-xs font-bold text-lingo-orange">
              Due
            </span>
          )}
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mx-4 mb-4 border-t border-lingo-border pt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="font-bold text-lingo-text-light">Interval</span>
              <span className="ml-2 font-bold text-lingo-text">
                {formatInterval(card.interval)}
              </span>
            </div>
            <div>
              <span className="font-bold text-lingo-text-light">Reviews</span>
              <span className="ml-2 font-bold text-lingo-text">
                {card.repetitions}
              </span>
            </div>
            <div>
              <span className="font-bold text-lingo-text-light">Ease</span>
              <span className="ml-2 font-bold text-lingo-text">
                {(card.easeFactor * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="font-bold text-lingo-text-light">Next</span>
              <span className="ml-2 font-bold text-lingo-text">
                {card.status === "new"
                  ? "Not started"
                  : card.nextReviewAt
                    ? isDue
                      ? "Now"
                      : formatRelativeDate(new Date(card.nextReviewAt), now)
                    : "—"}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 rounded-full bg-lingo-gray/60 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                card.status === "review"
                  ? "bg-lingo-green"
                  : card.status === "learning"
                    ? "bg-lingo-blue"
                    : "bg-lingo-gray-dark"
              }`}
              style={{ width: `${Math.min(100, (card.repetitions / 5) * 100)}%` }}
            />
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={isPending}
            className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold text-lingo-red hover:bg-lingo-red/10 transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─── */

function getStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "learning":
      return "Learning";
    case "review":
      return "Learned";
    default:
      return "New";
  }
}

const STATUS_STYLES: Record<string, string> = {
  New: "bg-lingo-gray/60 text-lingo-text-light",
  Learning: "bg-lingo-blue/15 text-lingo-blue",
  Learned: "bg-lingo-green/15 text-lingo-green-dark",
};

function formatInterval(days: number): string {
  if (days === 0) return "New";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

function formatRelativeDate(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Now";
  if (days === 1) return "Tomorrow";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

type CefrLevelFilter = "A1" | "A2" | "B1" | "B2" | "C1_C2";

const LEVEL_CONFIGS: Record<
  CefrLevelFilter,
  {
    label: string;
    shortLabel: string;
    defaultGoal: number;
    cefrLevels: string[];
    icon: string;
    description: string;
  }
> = {
  A1: {
    label: "A1 · Beginner",
    shortLabel: "A1",
    defaultGoal: 1000,
    cefrLevels: ["A1"],
    icon: "🌱",
    description: "Beginner vocabulary core",
  },
  A2: {
    label: "A2 · Elementary",
    shortLabel: "A2",
    defaultGoal: 1750,
    cefrLevels: ["A2"],
    icon: "🌿",
    description: "Elementary vocabulary core",
  },
  B1: {
    label: "B1 · Intermediate",
    shortLabel: "B1",
    defaultGoal: 2000,
    cefrLevels: ["B1"],
    icon: "📘",
    description: "Intermediate practical usage",
  },
  B2: {
    label: "B2 · Upper Intermediate",
    shortLabel: "B2",
    defaultGoal: 2500,
    cefrLevels: ["B2"],
    icon: "📈",
    description: "Upper intermediate communication",
  },
  C1_C2: {
    label: "C1 + C2 · Advanced",
    shortLabel: "C1 + C2",
    defaultGoal: 3000,
    cefrLevels: ["C1", "C2"],
    icon: "🎓",
    description: "Advanced native fluency mastery",
  },
};

function StatsTab({
  words,
  srsCards,
}: {
  words: Word[];
  srsCards: SrsCard[];
}) {
  const [selectedLevel, setSelectedLevel] = useState<CefrLevelFilter>("A2");

  const levelConfig = LEVEL_CONFIGS[selectedLevel];

  // Filter dictionary words that match this level's CEFR classifications
  const levelWords = useMemo(() => {
    return words.filter((w) => levelConfig.cefrLevels.includes(w.cefr_level));
  }, [words, levelConfig]);

  // Total words for this level (fallback to preset goal if no words are matched in local dict)
  const totalLevelCount = Math.max(levelConfig.defaultGoal, levelWords.length);

  // Filter user's active SRS cards that map to these words
  const levelCards = useMemo(() => {
    const wordSet = new Set(levelWords.map((w) => w.word));
    return srsCards.filter((c) => wordSet.has(c.word));
  }, [srsCards, levelWords]);

  const savedLevelCount = levelCards.length;

  // Breakdown saved cards into statuses
  const newLevelCount = levelCards.filter((c) => c.status === "new").length;
  const learningLevelCount = levelCards.filter((c) => c.status === "learning").length;
  const learnedLevelCount = levelCards.filter((c) => c.status === "review").length;

  const now = useMemo(() => new Date(), []);
  const dueLevelCount = levelCards.filter(
    (c) => c.nextReviewAt && new Date(c.nextReviewAt) <= now && c.status !== "new"
  ).length;

  const remainingLevelCount = Math.max(0, totalLevelCount - savedLevelCount);

  // Difficulty profile assessment
  const performanceBreakdown = useMemo(() => {
    let easyCount = 0;
    let okCount = 0;
    let hardCount = 0;

    levelCards.forEach((c) => {
      if (c.status === "new") return;
      if (c.easeFactor >= 2.6 || c.interval >= 6) {
        easyCount++;
      } else if (c.easeFactor >= 2.2 && c.interval >= 2) {
        okCount++;
      } else {
        hardCount++;
      }
    });

    return { easyCount, okCount, hardCount };
  }, [levelCards]);

  const masteryPercentage = totalLevelCount > 0 ? Math.round((learnedLevelCount / totalLevelCount) * 100) : 0;
  const savedPercentage = totalLevelCount > 0 ? Math.round((savedLevelCount / totalLevelCount) * 100) : 0;

  // Level-specific study recommendations
  const studySuggestion = useMemo(() => {
    const cleanLevelName = levelConfig.shortLabel;
    if (savedLevelCount === 0) {
      return {
        title: `Kickstart Your ${cleanLevelName} Journey!`,
        text: `You haven't saved any ${cleanLevelName} vocabulary words yet. Go to the 'Add Words' tab, filter by '${cleanLevelName}', and bookmark some terms to load your first flashcards!`,
        icon: "🌱",
      };
    }
    if (dueLevelCount > 0) {
      return {
        title: `Review Due ${cleanLevelName} Cards!`,
        text: `You have ${dueLevelCount} flashcards at the ${cleanLevelName} level scheduled for review. Practicing today maintains your SRS retention pathway.`,
        icon: "⚡",
      };
    }
    if (masteryPercentage < 10) {
      return {
        title: "Build Steady Habits",
        text: `You've begun saving ${cleanLevelName} level words. Make sure to review them daily so they mature and graduate from 'Learning' to 'Learned'!`,
        icon: "📚",
      };
    }
    if (masteryPercentage < 50) {
      return {
        title: "Progressing Nicely!",
        text: `Your ${cleanLevelName} elementary comprehension is growing! You have successfully learned ${learnedLevelCount} words. Continue daily sessions to cross 50%!`,
        icon: "🏆",
      };
    }
    if (masteryPercentage < 90) {
      return {
        title: "Aim for High Fluency",
        text: `Excellent grasp of core ${cleanLevelName} structures. Just a few more review iterations and units to achieve full mastery of this level!`,
        icon: "🔥",
      };
    }
    return {
      title: "Level Fully Mastered!",
      text: `Incredible! You have fully mastered over 90% of your target ${cleanLevelName} core vocabulary. You are ready to explore higher proficiency levels!`,
      icon: "⭐",
    };
  }, [savedLevelCount, dueLevelCount, masteryPercentage, learnedLevelCount, levelConfig]);

  return (
    <div className="space-y-6">
      {/* Horizontal Level Selection Pill Grid */}
      <div className="rounded-2xl border-2 border-lingo-border bg-white p-2 shadow-sm">
        <p className="text-xs font-bold text-lingo-text-light uppercase tracking-wider mb-2 px-2">
          Select CEFR Proficiency Level
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LEVEL_CONFIGS) as CefrLevelFilter[]).map((levelKey) => {
            const conf = LEVEL_CONFIGS[levelKey];
            const isActive = selectedLevel === levelKey;
            return (
              <button
                key={levelKey}
                onClick={() => setSelectedLevel(levelKey)}
                className={`flex-1 min-w-[70px] sm:min-w-[90px] py-2 px-2 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer ${
                  isActive
                    ? "bg-lingo-blue border-lingo-blue text-white shadow-sm scale-[1.02]"
                    : "bg-lingo-gray/10 border-transparent text-lingo-text-light hover:bg-lingo-gray/25 hover:text-lingo-text"
                }`}
              >
                <div className="text-sm mb-0.5">{conf.icon}</div>
                <div>{conf.shortLabel}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mastery Overview */}
        <div className="rounded-2xl border-2 border-lingo-border bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-lingo-text-light uppercase tracking-wider">
                {levelConfig.shortLabel} Mastery Rate
              </h3>
              <span className="text-xl">🏆</span>
            </div>
            <p className="text-4xl font-black text-lingo-green-dark">{masteryPercentage}%</p>
            <p className="text-xs text-lingo-text-light mt-1">
              {learnedLevelCount} of {totalLevelCount} words fully learned
            </p>
          </div>
          <div className="mt-4 h-3 w-full bg-lingo-gray/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-lingo-green-dark transition-all duration-500"
              style={{ width: `${masteryPercentage}%` }}
            />
          </div>
        </div>

        {/* Saved Count */}
        <div className="rounded-2xl border-2 border-lingo-border bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-lingo-text-light uppercase tracking-wider">
                Words Saved
              </h3>
              <span className="text-xl">🎴</span>
            </div>
            <p className="text-4xl font-black text-lingo-blue">{savedLevelCount}</p>
            <p className="text-xs text-lingo-text-light mt-1">
              {savedPercentage}% of target {levelConfig.shortLabel} vocabulary ({totalLevelCount} total)
            </p>
          </div>
          <div className="mt-4 h-3 w-full bg-lingo-gray/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-lingo-blue transition-all duration-500"
              style={{ width: `${savedPercentage}%` }}
            />
          </div>
        </div>

        {/* Due cards */}
        <div className="rounded-2xl border-2 border-lingo-border bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-lingo-text-light uppercase tracking-wider">
                Active Reviews
              </h3>
              <span className="text-xl">⚡</span>
            </div>
            <p className="text-4xl font-black text-lingo-orange">{dueLevelCount}</p>
            <p className="text-xs text-lingo-text-light mt-1">
              Words due for immediate SRS practice
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between gap-1 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded-lg bg-lingo-gray/40 text-lingo-text-light">
              {newLevelCount} New
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-lingo-blue/15 text-lingo-blue">
              {learningLevelCount} Active
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-lingo-orange/15 text-lingo-orange">
              {dueLevelCount} Due
            </span>
          </div>
        </div>
      </div>

      {/* Suggestion banner */}
      <div className="rounded-2xl border-2 border-lingo-border bg-amber-50/60 p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <span className="text-3xl p-3 bg-amber-100 rounded-xl">{studySuggestion.icon}</span>
        <div className="flex-1">
          <h4 className="text-base font-black text-amber-900">{studySuggestion.title}</h4>
          <p className="text-sm text-amber-800 mt-1 leading-relaxed">{studySuggestion.text}</p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Flashcard Performance Breakdown */}
        <div className="rounded-2xl border-2 border-lingo-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-black text-lingo-text mb-4">
            {levelConfig.shortLabel} Difficulty Profile
          </h3>
          <p className="text-xs text-lingo-text-light mb-4">
            Analysis of {levelConfig.shortLabel} cards in active study, grouped by your rated quality feedback (Hard, OK, Easy):
          </p>

          {levelCards.filter((c) => c.status !== "new").length === 0 ? (
            <div className="py-12 text-center text-sm text-lingo-text-light border-2 border-dashed border-lingo-border rounded-xl">
              No performance stats yet. Study or review some {levelConfig.shortLabel} flashcards to populate analytics!
            </div>
          ) : (
            <div className="space-y-4">
              {/* Easy Progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-lingo-text-light mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-lingo-green" /> Easy (High Retention)
                  </span>
                  <span>
                    {performanceBreakdown.easyCount} words (
                    {Math.round(
                      (performanceBreakdown.easyCount /
                        levelCards.filter((c) => c.status !== "new").length) *
                        100
                    )}
                    %)
                  </span>
                </div>
                <div className="h-4 w-full bg-lingo-gray/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-lingo-green rounded-full"
                    style={{
                      width: `${
                        (performanceBreakdown.easyCount /
                          levelCards.filter((c) => c.status !== "new").length) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* OK Progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-lingo-text-light mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-lingo-blue" /> OK (Stable Memory)
                  </span>
                  <span>
                    {performanceBreakdown.okCount} words (
                    {Math.round(
                      (performanceBreakdown.okCount /
                        levelCards.filter((c) => c.status !== "new").length) *
                        100
                    )}
                    %)
                  </span>
                </div>
                <div className="h-4 w-full bg-lingo-gray/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-lingo-blue rounded-full"
                    style={{
                      width: `${
                        (performanceBreakdown.okCount /
                          levelCards.filter((c) => c.status !== "new").length) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Hard Progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-lingo-text-light mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Hard (Needs Review)
                  </span>
                  <span>
                    {performanceBreakdown.hardCount} words (
                    {Math.round(
                      (performanceBreakdown.hardCount /
                        levelCards.filter((c) => c.status !== "new").length) *
                        100
                    )}
                    %)
                  </span>
                </div>
                <div className="h-4 w-full bg-lingo-gray/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full"
                    style={{
                      width: `${
                        (performanceBreakdown.hardCount /
                          levelCards.filter((c) => c.status !== "new").length) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detailed counter breakdown */}
        <div className="rounded-2xl border-2 border-lingo-border bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-black text-lingo-text mb-4">Core Vocabulary Counter</h3>
            <p className="text-xs text-lingo-text-light mb-4">
              Your exact {levelConfig.shortLabel} elementary words progression details:
            </p>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-lingo-border/60">
                <span className="font-bold text-lingo-text-light flex items-center gap-2">
                  📖 Total Course Goal
                </span>
                <span className="font-black text-lingo-text">{totalLevelCount} words</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-lingo-border/60">
                <span className="font-bold text-lingo-text-light flex items-center gap-2">
                  📂 Bookmarked & Saved
                </span>
                <span className="font-black text-lingo-blue">{savedLevelCount} words</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-lingo-border/60">
                <span className="font-bold text-lingo-text-light flex items-center gap-2">
                  ⏳ Unopened / Remaining
                </span>
                <span className="font-black text-lingo-text-light">{remainingLevelCount} words</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-lingo-border/60">
                <span className="font-bold text-lingo-text-light flex items-center gap-2">
                  🎓 Graduated (Learned)
                </span>
                <span className="font-black text-lingo-green-dark">{learnedLevelCount} words</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-lingo-border/60 flex items-center justify-between">
            <span className="text-[11px] font-bold text-lingo-text-light uppercase tracking-wider">
              {levelConfig.shortLabel} Active-to-Goal Ratio
            </span>
            <span className="text-xs font-black px-2 py-0.5 rounded bg-lingo-green/10 text-lingo-green-dark">
              {savedLevelCount > 0 ? Math.round((learnedLevelCount / savedLevelCount) * 100) : 0}% Graduated
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
