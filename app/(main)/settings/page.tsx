import { getPrompts, getMemory } from "@/lib/actions/prompts";
import { getVoiceSettings } from "@/lib/actions/tts-settings";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const isAdmin = isAdminEmail(session.user.email);

  let prompts = [];
  let memory = "";
  let voiceSettings = null;

  if (isAdmin) {
    const results = await Promise.allSettled([
      getPrompts(),
      getMemory(),
      getVoiceSettings(),
    ]);

    if (results[0].status === "fulfilled") prompts = results[0].value;
    if (results[1].status === "fulfilled") memory = results[1].value;
    if (results[2].status === "fulfilled") voiceSettings = results[2].value;
  }

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
