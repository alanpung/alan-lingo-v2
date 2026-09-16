"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PromptEditor } from "./prompt-editor";
import { MemoryEditor } from "./memory-editor";
import type { PromptWithOverride } from "@/lib/actions/prompts";
import { updateTargetLanguage } from "@/lib/actions/preferences";
import { updateNativeLanguage } from "@/lib/actions/profile";
import { supportedLanguages, getLanguageName } from "@/lib/languages";

const TARGET_LANGUAGES = Object.keys(supportedLanguages);

const NATIVE_LANGUAGES = [
  "en", "es", "fr", "de", "pt", "it", "nl", "ru", "zh", "ja", "ko", "ar",
  "hi", "tr", "pl", "sv", "da", "no", "fi", "cs", "ro", "hu", "el", "he",
  "th", "vi", "id", "ms", "uk", "bg",
];

export function SettingsView({
  prompts,
  initialMemory,
  targetLanguage,
  nativeLanguage,
}: {
  prompts: PromptWithOverride[];
  initialMemory: string;
  targetLanguage: string | null;
  nativeLanguage: string | null;
}) {
  const router = useRouter();
  const [savingTarget, startSaveTarget] = useTransition();
  const [savingNative, startSaveNative] = useTransition();
  
  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete account");
      }
      // Redirect to home/login after deletion
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      setDeleteError(message);
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="text-2xl font-black text-lingo-text mb-1">Settings</h1>
      <p className="text-sm text-lingo-text-light font-bold mb-6">
        Customize your language preferences and AI settings.
      </p>

      {/* Language settings */}
      <div className="rounded-2xl border-2 border-lingo-border bg-white p-5 mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-lingo-text-light">Learning Language</span>
          <select
            value={targetLanguage ?? ""}
            disabled={savingTarget}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              startSaveTarget(() => updateTargetLanguage(value));
            }}
            className="rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-1.5 text-sm font-bold text-lingo-text disabled:opacity-50"
          >
            <option value="" disabled>Select a language</option>
            {TARGET_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {getLanguageName(code)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-lingo-text-light">Native Language</span>
          <select
            value={nativeLanguage ?? ""}
            disabled={savingNative}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              startSaveNative(() => updateNativeLanguage(value));
            }}
            className="rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-1.5 text-sm font-bold text-lingo-text disabled:opacity-50"
          >
            <option value="" disabled>Select language</option>
            {NATIVE_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {getLanguageName(code)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <MemoryEditor initialValue={initialMemory} />

        {prompts.map((p) => (
          <PromptEditor key={p.id} prompt={p} />
        ))}

        {/* Danger Zone */}
        <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-5 mt-8">
          <h2 className="text-lg font-black text-red-600 mb-1">Danger Zone</h2>
          <p className="text-xs text-red-500 font-bold mb-4">
            Irreversible and destructive actions for your account.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-red-100">
            <div>
              <p className="text-sm font-bold text-lingo-text">Delete Account</p>
              <p className="text-xs text-lingo-text-light">
                Permanently remove your account, SRS words, and learning progress.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 rounded-xl border-b-2 border-red-700 transition-all self-start sm:self-center"
            >
              Delete Account
            </button>
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border-2 border-lingo-border">
                <h3 className="text-xl font-black text-red-600 mb-2">
                  Are you absolutely sure?
                </h3>
                <p className="text-sm text-lingo-text-light mb-6">
                  This action cannot be undone. This will permanently delete your account and all associated data including learning progress, chat memories, and custom prompts.
                </p>

                {deleteError && (
                  <p className="text-sm text-red-600 font-bold mb-4">
                    {deleteError}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 text-sm font-bold text-lingo-text border-2 border-lingo-border rounded-xl hover:bg-lingo-gray/30 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDeleteAccount}
                    className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl border-b-2 border-red-800 disabled:opacity-50 transition-all"
                  >
                    {isDeleting ? "Deleting..." : "Yes, Delete My Account"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
