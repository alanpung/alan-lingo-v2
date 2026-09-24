"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { detectTextLanguage, getLanguageLocale } from "@/lib/language-detector";

// In-memory URL cache to avoid redundant API calls
const urlCache = new Map<string, string>();

// In-memory decoded AudioBuffer cache for instant Web Audio playback
const audioBufferCache = new Map<string, AudioBuffer>();

// Shared Web Audio Context for zero-delay mobile playback
let sharedAudioContext: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let pendingMobilePlayback: { text: string; language: string; playFn: () => void } | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioContext = new AudioCtx();
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

// Unlock audio context on any user touch/click gesture on mobile
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // If there was a pending audio blocked by mobile autoplay before the user touched the screen, play it now
    if (pendingMobilePlayback) {
      const pending = pendingMobilePlayback;
      pendingMobilePlayback = null;
      try {
        pending.playFn();
      } catch {}
    }
  };

  window.addEventListener("touchstart", unlockAudio, { passive: true });
  window.addEventListener("touchend", unlockAudio, { passive: true });
  window.addEventListener("click", unlockAudio, { passive: true });
}

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
  const currentAudioElement = useRef<HTMLAudioElement | null>(null);
  const nonceRef = useRef(0);
  const [loading, setLoading] = useState(false);

  const stop = useCallback(() => {
    nonceRef.current++;
    setLoading(false);
    pendingMobilePlayback = null;

    // 1. Stop Web Audio buffer source
    if (currentSourceNode) {
      try {
        currentSourceNode.stop();
        currentSourceNode.disconnect();
      } catch {}
      currentSourceNode = null;
    }

    // 2. Stop HTMLAudioElement
    if (currentAudioElement.current) {
      try {
        currentAudioElement.current.pause();
        currentAudioElement.current.currentTime = 0;
        currentAudioElement.current.removeAttribute("src");
        currentAudioElement.current.load();
      } catch {}
      currentAudioElement.current = null;
    }

    // 3. Stop SpeechSynthesis
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

  const playWithWebAudio = useCallback(
    async (url: string, audioCtx: AudioContext): Promise<boolean> => {
      try {
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        let audioBuffer = audioBufferCache.get(url);
        if (!audioBuffer) {
          const res = await fetch(url);
          if (!res.ok) return false;
          const arrayBuffer = await res.arrayBuffer();
          // Decode audio data safely
          audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          audioBufferCache.set(url, audioBuffer);
        }

        if (currentSourceNode) {
          try {
            currentSourceNode.stop();
            currentSourceNode.disconnect();
          } catch {}
          currentSourceNode = null;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          if (currentSourceNode === source) {
            currentSourceNode = null;
          }
        };
        currentSourceNode = source;
        source.start(0);
        return true;
      } catch (err) {
        console.warn("Web Audio playback failed, falling back to HTMLAudioElement:", err);
        return false;
      }
    },
    []
  );

  const play = useCallback(
    async (text: string, language: string) => {
      stop();
      const nonce = nonceRef.current;
      const resolvedLang = detectTextLanguage(text, { targetLanguage: language });

      // Ensure AudioContext is awakened as early as possible in call stack
      const audioCtx = getAudioContext();

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

      // Method 1: Try Web Audio API (bypasses mobile gesture timeout and iOS Range bugs)
      if (audioCtx) {
        const played = await playWithWebAudio(url, audioCtx);
        if (played) return;
      }

      // Method 2: HTMLAudioElement with Range support
      try {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = url;
        currentAudioElement.current = audio;

        audio.onended = () => {
          if (currentAudioElement.current === audio) {
            currentAudioElement.current = null;
          }
        };

        await audio.play();
      } catch (playErr: unknown) {
        const isNotAllowed =
          playErr instanceof Error &&
          (playErr.name === "NotAllowedError" ||
            playErr.message.toLowerCase().includes("interact") ||
            playErr.message.toLowerCase().includes("gesture"));

        if (isNotAllowed) {
          // If blocked by mobile policy before first touch, queue it to play on the very first touch
          pendingMobilePlayback = {
            text,
            language: resolvedLang,
            playFn: () => play(text, language),
          };
          console.info("Mobile autoplay deferred until user touches screen.");
        } else {
          // Real error: fallback to browser synth
          console.warn("Audio playback failed, falling back to speech synthesis:", playErr);
          if (nonce === nonceRef.current) {
            speakWithBrowserSynth(text, resolvedLang);
          }
        }
      }
    },
    [stop, fetchUrl, playWithWebAudio]
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

  useEffect(() => {
    return stop;
  }, [stop]);

  return { play, stop, prefetch, loading };
}
