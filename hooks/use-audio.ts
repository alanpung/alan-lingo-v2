"use client";

import { useRef, useCallback, useState } from "react";
import { detectTextLanguage, getLanguageLocale } from "@/lib/language-detector";

// In-memory URL cache to avoid redundant API calls
const urlCache = new Map<string, string>();

/**
 * Fallback to browser Web Speech API if AI audio fails or is offline.
 */
function speakWithBrowserSynth(text: string, language: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const resolvedLang = detectTextLanguage(text, { targetLanguage: language });
    const targetLocale = getLanguageLocale(resolvedLang);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetLocale;
    utterance.rate = 0.9;

    // Pick best matching voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const exactVoice = voices.find(
        (v) => v.lang.toLowerCase() === targetLocale.toLowerCase()
      );
      const prefixVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith(resolvedLang.toLowerCase()) ||
          v.lang.toLowerCase().startsWith(targetLocale.slice(0, 2).toLowerCase())
      );
      if (exactVoice) {
        utterance.voice = exactVoice;
      } else if (prefixVoice) {
        utterance.voice = prefixVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Browser speech synthesis failed:", err);
  }
}

export function useAudio() {
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const nonceRef = useRef(0);
  const [loading, setLoading] = useState(false);

  const stop = useCallback(() => {
    nonceRef.current++;
    setLoading(false);
    if (currentAudio.current) {
      try {
        currentAudio.current.pause();
        currentAudio.current.currentTime = 0;
        currentAudio.current.removeAttribute("src");
        currentAudio.current.load();
      } catch {}
      currentAudio.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }, []);

  const fetchUrl = useCallback(async (text: string, language: string) => {
    const key = `${language}:${text.toLowerCase()}`;
    const cached = urlCache.get(key);
    if (cached) return cached;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });

    if (!res.ok) {
      throw new Error(`TTS API returned status ${res.status}`);
    }

    const data = await res.json();
    if (!data.url) {
      throw new Error("No URL returned from TTS API");
    }

    urlCache.set(key, data.url);
    return data.url as string;
  }, []);

  const play = useCallback(
    async (text: string, language: string) => {
      stop();
      const nonce = nonceRef.current;
      const resolvedLang = detectTextLanguage(text, { targetLanguage: language });

      setLoading(true);
      let url: string | null = null;
      try {
        url = await fetchUrl(text, resolvedLang);
      } catch (err) {
        console.warn("AI TTS fetch failed, falling back to browser speech synthesis:", err);
        if (nonce === nonceRef.current) {
          speakWithBrowserSynth(text, resolvedLang);
        }
        return;
      } finally {
        if (nonce === nonceRef.current) setLoading(false);
      }

      if (nonce !== nonceRef.current || !url) return;

      const audio = new Audio(url);
      currentAudio.current = audio;

      audio.onended = () => {
        if (currentAudio.current === audio) {
          currentAudio.current = null;
        }
      };

      audio.onerror = () => {
        console.warn("Audio element failed to play URL, falling back to speech synthesis:", url);
        if (nonce === nonceRef.current) {
          speakWithBrowserSynth(text, resolvedLang);
        }
      };

      try {
        await audio.play();
      } catch (playErr) {
        console.warn("audio.play() error:", playErr);
        if (nonce === nonceRef.current) {
          speakWithBrowserSynth(text, resolvedLang);
        }
      }
    },
    [stop, fetchUrl]
  );

  const prefetch = useCallback(
    (texts: string[], language: string) => {
      texts.forEach((text) => {
        const resolvedLang = detectTextLanguage(text, { targetLanguage: language });
        fetchUrl(text, resolvedLang).catch(() => {});
      });
    },
    [fetchUrl]
  );

  return { play, stop, prefetch, loading };
}
