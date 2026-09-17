import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getStandaloneUnits,
  getUserOwnedCourses,
} from "@/lib/db/queries/courses";
import { isAdminEmail } from "@/lib/ai/models";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { StandaloneUnits } from "./standalone-units";
import { MyCourses } from "./my-courses";
import { LearnHeader } from "./learn-header";

export default async function LearnPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const isAdmin = isAdminEmail(session?.user?.email);

  const [standaloneUnits, ownedCourses, targetLang] = await Promise.all([
    userId ? getStandaloneUnits(userId) : Promise.resolve([]),
    userId ? getUserOwnedCourses(userId) : Promise.resolve([]),
    userId ? getTargetLanguage(userId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-lingo-text">Learn</h1>
      </div>
      <LearnHeader targetLanguage={targetLang ?? undefined} />
      <StandaloneUnits units={standaloneUnits} isAdmin={isAdmin} />
      <MyCourses courses={ownedCourses} isAdmin={isAdmin} />
    </div>
  );
}
