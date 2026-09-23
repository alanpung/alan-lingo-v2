import { notFound } from "next/navigation";
import { getCourseWithContent } from "@/lib/db/queries/courses";
import { getUserProgress } from "@/lib/actions/progress";
import { LearningPath } from "@/components/library/learning-path";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdminEmail } from "@/lib/ai/models";
import { db } from "@/lib/db";
import { userUnitLibrary, userCourseEnrollment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { CourseTitleHeader } from "@/components/course/course-title-header";
import { CourseLibraryBanner } from "@/components/course/course-library-banner";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const course = await getCourseWithContent(courseId, userId);
  if (!course) notFound();

  const progress = await getUserProgress(course.id);
  const isAdmin = isAdminEmail(session?.user?.email);
  const isOwner = course.createdBy === userId;
  const canEdit = isAdmin || (isOwner && course.visibility !== "public");

  let libraryUnitIds: string[] = [];
  let isCourseInLibrary = false;
  if (userId) {
    try {
      const [libRows, enrollment] = await Promise.all([
        db
          .select({ unitId: userUnitLibrary.unitId })
          .from(userUnitLibrary)
          .where(eq(userUnitLibrary.userId, userId)),
        db
          .select({ id: userCourseEnrollment.id })
          .from(userCourseEnrollment)
          .where(
            and(
              eq(userCourseEnrollment.userId, userId),
              eq(userCourseEnrollment.courseId, courseId)
            )
          )
          .limit(1),
      ]);
      libraryUnitIds = libRows.map((r) => r.unitId);
      isCourseInLibrary = enrollment.length > 0;
    } catch (err) {
      console.warn("CourseDetailPage: failed to fetch user unit library:", err);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <CourseTitleHeader
        courseId={course.id}
        initialTitle={course.title}
        sourceLanguage={course.sourceLanguage}
        targetLanguage={course.targetLanguage}
        canEdit={canEdit}
      />
      {userId && !isOwner && (
        <CourseLibraryBanner
          courseId={course.id}
          initialIsInLibrary={isCourseInLibrary}
        />
      )}
      <LearningPath
        course={course}
        completions={progress.completions}
        libraryUnitIds={libraryUnitIds}
        userId={userId}
      />
    </div>
  );
}
