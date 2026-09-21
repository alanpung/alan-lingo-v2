import { getPrompts, getMemory } from "@/lib/actions/prompts";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { getNativeLanguage } from "@/lib/actions/profile";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const isAdmin = isAdminEmail(session.user.email);

  const [prompts, memory, targetLanguage, nativeLanguage] = await Promise.all([
    isAdmin ? getPrompts() : Promise.resolve([]),
    isAdmin ? getMemory() : Promise.resolve(""),
    getTargetLanguage(session.user.id),
    getNativeLanguage(session.user.id),
  ]);

  return (
    <SettingsView
      isAdmin={isAdmin}
      prompts={prompts}
      initialMemory={memory}
      targetLanguage={targetLanguage}
      nativeLanguage={nativeLanguage}
    />
  );
}
