import { getPrompts, getMemory } from "@/lib/actions/prompts";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const isAdmin = isAdminEmail(session.user.email);

  const [prompts, memory] = await Promise.all([
    isAdmin ? getPrompts() : Promise.resolve([]),
    isAdmin ? getMemory() : Promise.resolve(""),
  ]);

  return (
    <SettingsView
      isAdmin={isAdmin}
      userEmail={session.user.email}
      userName={session.user.name || undefined}
      prompts={prompts}
      initialMemory={memory}
    />
  );
}
