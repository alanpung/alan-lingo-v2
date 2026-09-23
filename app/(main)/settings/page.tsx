import { getPrompts, getMemory } from "@/lib/actions/prompts";
import { getVoiceSettings } from "@/lib/actions/tts-settings";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const isAdmin = isAdminEmail(session.user.email);

  const [prompts, memory, voiceSettings] = await Promise.all([
    isAdmin ? getPrompts() : Promise.resolve([]),
    isAdmin ? getMemory() : Promise.resolve(""),
    isAdmin ? getVoiceSettings() : Promise.resolve(null),
  ]);

  return (
    <SettingsView
      isAdmin={isAdmin}
      userEmail={session.user.email}
      userName={session.user.name || undefined}
      prompts={prompts}
      initialMemory={memory}
      voiceSettings={voiceSettings}
    />
  );
}
