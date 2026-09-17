import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getStandaloneUnits,
  getUserOwnedCourses,
} from "@/lib/db/queries/courses";
import type {
  StandaloneUnitInfo,
  OwnedCourseInfo,
} from "@/lib/content/types";
import { isAdminEmail } from "@/lib/ai/models";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { StandaloneUnits } from "./standalone-units";
import { MyCourses } from "./my-courses";
import { LearnHeader } from "./learn-header";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    console.error("LearnPage: failed to get session:", err);
  }

  const userId = session?.user?.id;
  const isAdmin = isAdminEmail(session?.user?.email);

  let standaloneUnits: StandaloneUnitInfo[] = [];
  let ownedCourses: OwnedCourseInfo[] = [];
  let targetLang: string | null = null;

  if (userId) {
    const results = await Promise.allSettled([
      getStandaloneUnits(userId),
      getUserOwnedCourses(userId),
      getTargetLanguage(userId),
    ]);

    if (results[0].status === "fulfilled") {
      standaloneUnits = results[0].value;
    } else {
      console.error("LearnPage: getStandaloneUnits failed:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      ownedCourses = results[1].value;
    } else {
      console.error("LearnPage: getUserOwnedCourses failed:", results[1].reason);
    }

    if (results[2].status === "fulfilled") {
      targetLang = results[2].value;
    } else {
      console.error("LearnPage: getTargetLanguage failed:", results[2].reason);
    }
  }

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
