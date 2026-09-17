"use client";

import { useState, useCallback, useRef } from "react";
import { WordPopover } from "./word-popover";
import { useAudio } from "@/hooks/use-audio";

interface HoverableTextProps {
  text: string;
  language: string;
  as?: "p" | "span" | "h2";
  className?: string;
  noAudio?: boolean;
}

interface ActiveWord {
  word: string;
  rect: DOMRect;
}

interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** Parse basic inline markdown (**bold**, *italic*) into segments */
function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[2]) {
      segments.push({ text: match[2], bold: true, italic: true });
    } else if (match[3]) {
      segments.push({ text: match[3], bold: true });
    } else if (match[4]) {
      segments.push({ text: match[4], italic: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

export function HoverableText({
  text,
  language,
  as: Tag = "span",
  className,
  noAudio,
}: HoverableTextProps) {
  const [active, setActive] = useState<ActiveWord | null>(null);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);
  const { play } = useAudio();

  const triggerInspect = useCallback(
    (el: HTMLElement, word: string) => {
      const rect = el.getBoundingClientRect();
      setActive({ word, rect });
      if (!noAudio) play(word, language);
    },
    [play, language, noAudio]
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: string) => {
      const target = e.currentTarget;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      // Brief 180ms delay to prevent accidental pops while quickly moving mouse
      hoverTimer.current = setTimeout(() => {
        triggerInspect(target, word);
      }, 180);
    },
    [triggerInspect]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: string) => {
      e.stopPropagation();
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      triggerInspect(e.currentTarget, word);
    },
    [triggerInspect]
  );

  function renderWords(str: string, keyPrefix: string) {
    const words = str.split(/(\s+)/);
    return words.map((segment, i) => {
      if (/^\s+$/.test(segment)) {
        return <span key={`${keyPrefix}-${i}`}>{segment}</span>;
      }
      const cleanWord = segment.replace(/[^\p{L}\p{M}'-]/gu, "");
      if (!cleanWord) {
        return <span key={`${keyPrefix}-${i}`}>{segment}</span>;
      }
      return (
        <span
          key={`${keyPrefix}-${i}`}
          onMouseEnter={(e) => handleMouseEnter(e, cleanWord)}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => handleClick(e, cleanWord)}
          className="cursor-pointer border-b border-dotted border-foreground/30 rounded-sm px-0.5 transition-all duration-150 hover:border-lingo-blue hover:bg-lingo-blue/15 hover:text-lingo-blue"
        >
          {segment}
        </span>
      );
    });
  }

  const mdSegments = parseInlineMarkdown(text);

  return (
    <>
      <Tag className={className}>
        {mdSegments.map((seg, si) => {
          const inner = renderWords(seg.text, `s${si}`);
          if (seg.bold && seg.italic) return <strong key={si}><em>{inner}</em></strong>;
          if (seg.bold) return <strong key={si}>{inner}</strong>;
          if (seg.italic) return <em key={si}>{inner}</em>;
          return <span key={si}>{inner}</span>;
        })}
      </Tag>

      {active && (
        <WordPopover
          word={active.word}
          language={language}
          anchorRect={active.rect}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
