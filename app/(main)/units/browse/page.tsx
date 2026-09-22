import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  listCoursesWithLessonCounts,
  getAvailableFilters,
  getBrowsableUnits,
} from "@/lib/db/queries/courses";
import { CourseBrowser } from "../course-browser";
import { BrowseUnits } from "../browse-units";

export default async function BrowsePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/sign-in?redirect=/units/browse");
  }

  const [courses, filters, browsableUnits] = await Promise.all([
    // Show every public course. Do not automatically filter by the student's
    // native or target language; users can still use the optional UI filters.
    listCoursesWithLessonCounts(undefined, userId),
    getAvailableFilters(userId),
    getBrowsableUnits(userId),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/units"
          className="shrink-0 text-sm font-bold text-lingo-text-light hover:text-lingo-text transition-colors"
        >
          &larr; Back
        </Link>
        <h1 className="text-2xl font-black text-lingo-text">Browse</h1>
      </div>

      {/* Do not apply the student's target-language preference automatically. */}
      <BrowseUnits units={browsableUnits} />

      {courses.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-lingo-text-light mb-2">
            No public courses are available yet.
          </p>
          <p className="text-sm text-lingo-text-light">
            Public courses will appear here when they are published.
          </p>
        </div>
      ) : (
        <CourseBrowser courses={courses} filters={filters} />
      )}
    </div>
  );
}
