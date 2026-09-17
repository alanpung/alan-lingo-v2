"use client";

import { useRef, useCallback, useState } from "react";

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
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language.length === 2 ? `${language}-${language.toUpperCase()}` : language;
    utterance.rate = 0.9;
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
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
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

      setLoading(true);
      let url: string | null = null;
      try {
        url = await fetchUrl(text, language);
      } catch (err) {
        console.warn("AI TTS fetch failed, falling back to browser speech synthesis:", err);
        if (nonce === nonceRef.current) {
          speakWithBrowserSynth(text, language);
        }
        return;
      } finally {
        if (nonce === nonceRef.current) setLoading(false);
      }

      if (nonce !== nonceRef.current || !url) return;

      const audio = new Audio(url);
      currentAudio.current = audio;

      audio.onerror = () => {
        console.warn("Audio element failed to play URL, falling back to speech synthesis:", url);
        if (nonce === nonceRef.current) {
          speakWithBrowserSynth(text, language);
        }
      };

      try {
        await audio.play();
      } catch (playErr) {
        console.warn("audio.play() error:", playErr);
        if (nonce === nonceRef.current) {
          speakWithBrowserSynth(text, language);
        }
      }
    },
    [stop, fetchUrl]
  );

  const prefetch = useCallback(
    (texts: string[], language: string) => {
      texts.forEach((text) => fetchUrl(text, language).catch(() => {}));
    },
    [fetchUrl]
  );

  return { play, stop, prefetch, loading };
}
