import { db } from "@/lib/db";
import {
  course,
  unit,
  user,
  lessonCompletion,
  userUnitLibrary,
  userCourseEnrollment,
} from "@/lib/db/schema";
import {
  eq,
  and,
  or,
  ne,
  sql,
  isNull,
  count,
  countDistinct,
  inArray,
  notInArray,
} from "drizzle-orm";
import type {
  Course,
  CourseListItem,
  StandaloneUnitInfo,
  UnitWithContent,
  OwnedCourseInfo,
  CourseManagementInfo,
  AvailableUnitForCourse,
} from "@/lib/content/types";
import { getUnitLessonsSafe } from "@/lib/content/loader";

interface CourseFilters {
  sourceLanguage?: string;
  targetLanguage?: string;
  level?: string;
}

export async function listCourses(
  filters?: CourseFilters,
  userId?: string
): Promise<CourseListItem[]> {
  const conditions = [eq(course.published, true)];

  // Course-level visibility: public OR owned by the current user
  if (userId) {
    conditions.push(
      or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
    );
  } else {
    conditions.push(eq(course.visibility, "public"));
  }

  if (filters?.sourceLanguage) {
    conditions.push(eq(course.sourceLanguage, filters.sourceLanguage));
  }
  if (filters?.targetLanguage) {
    conditions.push(eq(course.targetLanguage, filters.targetLanguage));
  }
  if (filters?.level) {
    conditions.push(eq(course.level, filters.level));
  }

  // Only count visible units (public OR owned by the current user)
  const unitJoinCondition = userId
    ? and(
        eq(unit.courseId, course.id),
        or(eq(unit.visibility, "public"), eq(unit.createdBy, userId))
      )
    : and(eq(unit.courseId, course.id), eq(unit.visibility, "public"));

  const rows = await db
    .select({
      id: course.id,
      title: course.title,
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
      createdBy: course.createdBy,
      unitCount: countDistinct(unit.id),
    })
    .from(course)
    .leftJoin(unit, unitJoinCondition)
    .where(and(...conditions))
    .groupBy(course.id, course.createdBy)
    .orderBy(course.title);

  return rows.map((r) => ({
    ...r,
    unitCount: Number(r.unitCount),
    lessonCount: 0, // filled below
  }));
}

// Separate query for accurate lesson counts
export async function listCoursesWithLessonCounts(
  filters?: CourseFilters,
  userId?: string
): Promise<CourseListItem[]> {
  const courses = await listCourses(filters, userId);
  if (courses.length === 0) return courses;

  const courseIds = courses.map((c) => c.id);

  // Only count lessons from visible units
  const unitVisibilityCondition = userId
    ? and(
        inArray(unit.courseId, courseIds),
        or(eq(unit.visibility, "public"), eq(unit.createdBy, userId))
      )
    : and(
        inArray(unit.courseId, courseIds),
        eq(unit.visibility, "public")
      );

  const units = await db
    .select({ id: unit.id, courseId: unit.courseId, markdown: unit.markdown })
    .from(unit)
    .where(unitVisibilityCondition);

  const lessonCountByCourse = new Map<string, number>();
  for (const u of units) {
    if (!u.courseId) continue;
    const { lessons } = getUnitLessonsSafe(u.markdown ?? "");
    const prev = lessonCountByCourse.get(u.courseId) ?? 0;
    lessonCountByCourse.set(u.courseId, prev + (lessons?.length ?? 0));
  }

  let enrolledCourseIds = new Set<string>();
  if (userId) {
    try {
      const enrollments = await db
        .select({ courseId: userCourseEnrollment.courseId })
        .from(userCourseEnrollment)
        .where(eq(userCourseEnrollment.userId, userId));
      enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));
    } catch (err) {
      console.warn("listCoursesWithLessonCounts: enrollment query failed:", err);
    }
  }

  return courses.map((c) => ({
    ...c,
    lessonCount: lessonCountByCourse.get(c.id) ?? 0,
    isOwner: userId ? c.createdBy === userId : false,
    isInLibrary: enrolledCourseIds.has(c.id),
  }));
}

export async function getCourseWithContent(
  courseId: string,
  userId?: string
): Promise<Course | null> {
  const courseConditions = [eq(course.id, courseId)];
  if (userId) {
    courseConditions.push(
      or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
    );
  } else {
    courseConditions.push(eq(course.visibility, "public"));
  }

  const [courseRow] = await db
    .select()
    .from(course)
    .where(and(...courseConditions));

  if (!courseRow) return null;

  const unitConditions = [eq(unit.courseId, courseId)];
  if (userId) {
    unitConditions.push(
      or(eq(unit.visibility, "public"), eq(unit.createdBy, userId))!
    );
  } else {
    unitConditions.push(eq(unit.visibility, "public"));
  }

  const units = await db
    .select()
    .from(unit)
    .where(and(...unitConditions));

  return {
    id: courseRow.id,
    title: courseRow.title,
    sourceLanguage: courseRow.sourceLanguage,
    targetLanguage: courseRow.targetLanguage,
    level: courseRow.level,
    visibility: courseRow.visibility,
    createdBy: courseRow.createdBy,
    units: units.map((u) => {
      const safeResult = getUnitLessonsSafe(u.markdown ?? "");
      return {
        id: u.id,
        title: u.title ?? "Untitled",
        description: u.description ?? "",
        icon: u.icon ?? "📘",
        color: u.color ?? "#58CC02",
        lessons: safeResult?.lessons ?? [],
        parseError: safeResult?.parseError ?? false,
        createdBy: u.createdBy ?? null,
      };
    }),
  };
}

export async function getAvailableFilters(userId?: string) {
  const conditions = [eq(course.published, true)];
  if (userId) {
    conditions.push(
      or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
    );
  } else {
    conditions.push(eq(course.visibility, "public"));
  }

  const rows = await db
    .select({
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
    })
    .from(course)
    .where(and(...conditions));

  const sourceLanguages = [...new Set(rows.map((r) => r.sourceLanguage))].sort();
  const targetLanguages = [...new Set(rows.map((r) => r.targetLanguage))].sort();
  const levels = [...new Set(rows.map((r) => r.level))].sort();

  return { sourceLanguages, targetLanguages, levels };
}

export async function getStandaloneUnits(
  userId: string
): Promise<StandaloneUnitInfo[]> {
  let libraryUnitIds = new Set<string>();
  try {
    const libraryRows = await db
      .select({ unitId: userUnitLibrary.unitId })
      .from(userUnitLibrary)
      .where(eq(userUnitLibrary.userId, userId));
    libraryUnitIds = new Set(libraryRows.map((r) => r.unitId));
  } catch (err) {
    console.warn("userUnitLibrary query failed, continuing:", err);
  }

  const libraryCondition =
    libraryUnitIds.size > 0
      ? or(
          and(eq(unit.createdBy, userId), isNull(unit.courseId)),
          inArray(unit.id, [...libraryUnitIds])
        )
      : and(eq(unit.createdBy, userId), isNull(unit.courseId));

  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      icon: unit.icon,
      color: unit.color,
      targetLanguage: unit.targetLanguage,
      sourceLanguage: unit.sourceLanguage,
      level: unit.level,
      markdown: unit.markdown,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      creatorName: user.name,
    })
    .from(unit)
    .leftJoin(user, eq(unit.createdBy, user.id))
    .where(libraryCondition);

  if (rows.length === 0) return [];

  const unitIds = rows.map((r) => r.id);
  const completionMap = new Map<string, number>();

  try {
    const completionCounts = await db
      .select({
        unitId: lessonCompletion.unitId,
        count: count(),
      })
      .from(lessonCompletion)
      .where(
        and(
          eq(lessonCompletion.userId, userId),
          inArray(lessonCompletion.unitId, unitIds)
        )
      )
      .groupBy(lessonCompletion.unitId);

    for (const c of completionCounts) {
      completionMap.set(c.unitId, Number(c.count));
    }
  } catch (err) {
    console.warn("lessonCompletion query failed, continuing:", err);
  }

  return rows.map((u) => {
    const safeResult = getUnitLessonsSafe(u.markdown ?? "");
    const lessons = safeResult?.lessons ?? [];
    return {
      id: u.id,
      title: u.title ?? "Untitled",
      description: u.description ?? "",
      icon: u.icon ?? "📘",
      color: u.color ?? "#58CC02",
      targetLanguage: u.targetLanguage ?? "",
      sourceLanguage: u.sourceLanguage ?? null,
      level: u.level ?? null,
      lessonCount: lessons.length,
      completedLessons: completionMap.get(u.id) ?? 0,
      visibility: u.visibility ?? "private",
      creatorName: u.creatorName ?? null,
      isOwner: u.createdBy === userId,
      isInLibrary: libraryUnitIds.has(u.id),
      parseError: safeResult?.parseError ?? false,
    };
  });
}

/** Public units that users can browse and add to their library. */
export async function getBrowsableUnits(
  userId: string
): Promise<StandaloneUnitInfo[]> {
  let libraryUnitIds = new Set<string>();
  try {
    const libraryRows = await db
      .select({ unitId: userUnitLibrary.unitId })
      .from(userUnitLibrary)
      .where(eq(userUnitLibrary.userId, userId));
    libraryUnitIds = new Set(libraryRows.map((r) => r.unitId));
  } catch (err) {
    console.warn("userUnitLibrary query failed:", err);
  }

  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      icon: unit.icon,
      color: unit.color,
      targetLanguage: unit.targetLanguage,
      sourceLanguage: unit.sourceLanguage,
      level: unit.level,
      markdown: unit.markdown,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      creatorName: user.name,
      courseVisibility: course.visibility,
    })
    .from(unit)
    .leftJoin(user, eq(unit.createdBy, user.id))
    .leftJoin(course, eq(unit.courseId, course.id))
    .where(
      or(
        eq(unit.visibility, "public"),
        eq(course.visibility, "public")
      )
    );

  if (rows.length === 0) return [];

  return rows.map((u) => {
    const safeResult = getUnitLessonsSafe(u.markdown ?? "");
    const lessons = safeResult?.lessons ?? [];
    return {
      id: u.id,
      title: u.title ?? "Untitled",
      description: u.description ?? "",
      icon: u.icon ?? "📘",
      color: u.color ?? "#58CC02",
      targetLanguage: u.targetLanguage ?? "",
      sourceLanguage: u.sourceLanguage ?? null,
      level: u.level ?? null,
      lessonCount: lessons.length,
      completedLessons: 0,
      visibility: u.visibility ?? u.courseVisibility ?? "public",
      creatorName: u.creatorName ?? null,
      isOwner: u.createdBy === userId,
      isInLibrary: libraryUnitIds.has(u.id),
      parseError: safeResult?.parseError ?? false,
    };
  });
}

export async function getUnitForEdit(
  unitId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<{ id: string; title: string; markdown: string; visibility: string | null } | null> {
  const [u] = await db
    .select({
      id: unit.id,
      title: unit.title,
      markdown: unit.markdown,
      createdBy: unit.createdBy,
      visibility: unit.visibility,
    })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!u) return null;

  if (isAdmin) {
    return {
      id: u.id,
      title: u.title,
      markdown: u.markdown,
      visibility: u.visibility,
    };
  }

  if (u.createdBy !== userId) return null;
  if (u.visibility === "public") return null;

  return {
    id: u.id,
    title: u.title,
    markdown: u.markdown,
    visibility: u.visibility,
  };
}

export async function getUnitWithContent(
  unitId: string
): Promise<UnitWithContent | null> {
  const [u] = await db.select().from(unit).where(eq(unit.id, unitId));
  if (!u) return null;

  const safeResult = getUnitLessonsSafe(u.markdown ?? "");
  return {
    id: u.id,
    title: u.title ?? "Untitled",
    description: u.description ?? "",
    icon: u.icon ?? "📘",
    color: u.color ?? "#58CC02",
    targetLanguage: u.targetLanguage ?? "",
    sourceLanguage: u.sourceLanguage ?? null,
    level: u.level ?? null,
    courseId: u.courseId,
    visibility: u.visibility ?? "private",
    createdBy: u.createdBy,
    lessons: safeResult?.lessons ?? [],
    parseError: safeResult?.parseError ?? false,
  };
}

// ─── Course management queries ───

export async function getUserOwnedCourses(
  userId: string
): Promise<OwnedCourseInfo[]> {
  let enrolledCourseIds: string[] = [];
  try {
    const enrollments = await db
      .select({ courseId: userCourseEnrollment.courseId })
      .from(userCourseEnrollment)
      .where(eq(userCourseEnrollment.userId, userId));
    enrolledCourseIds = enrollments.map((e) => e.courseId);
  } catch (err) {
    console.warn("getUserOwnedCourses enrollment query failed:", err);
  }

  const courseCondition =
    enrolledCourseIds.length > 0
      ? or(
          eq(course.createdBy, userId),
          inArray(course.id, enrolledCourseIds)
        )
      : eq(course.createdBy, userId);

  const rows = await db
    .select({
      id: course.id,
      title: course.title,
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
      visibility: course.visibility,
      createdBy: course.createdBy,
      createdAt: course.createdAt,
      unitCount: countDistinct(unit.id),
    })
    .from(course)
    .leftJoin(unit, eq(unit.courseId, course.id))
    .where(courseCondition)
    .groupBy(course.id, course.createdBy)
    .orderBy(course.createdAt);

  if (rows.length === 0) return [];

  const courseIds = rows.map((r) => r.id);
  const completionMap = new Map<string, number>();

  try {
    const completionCounts = await db
      .select({
        courseId: unit.courseId,
        count: count(),
      })
      .from(lessonCompletion)
      .innerJoin(unit, eq(unit.id, lessonCompletion.unitId))
      .where(
        and(
          eq(lessonCompletion.userId, userId),
          inArray(unit.courseId, courseIds)
        )
      )
      .groupBy(unit.courseId);

    for (const c of completionCounts) {
      if (c.courseId) {
        completionMap.set(c.courseId, Number(c.count));
      }
    }
  } catch (err) {
    console.warn("getUserOwnedCourses completion count failed:", err);
  }

  const lessonCountMap = new Map<string, number>();
  try {
    const allUnits = await db
      .select({ id: unit.id, courseId: unit.courseId, markdown: unit.markdown })
      .from(unit)
      .where(inArray(unit.courseId, courseIds));

    for (const u of allUnits) {
      if (!u.courseId) continue;
      const { lessons } = getUnitLessonsSafe(u.markdown ?? "");
      lessonCountMap.set(
        u.courseId,
        (lessonCountMap.get(u.courseId) ?? 0) + (lessons?.length ?? 0)
      );
    }
  } catch (err) {
    console.warn("getUserOwnedCourses unit query failed:", err);
  }

  return rows.map((r) => ({
    ...r,
    unitCount: Number(r.unitCount),
    lessonCount: lessonCountMap.get(r.id) ?? 0,
    completedLessons: completionMap.get(r.id) ?? 0,
    isOwner: r.createdBy === userId,
    isInLibrary: true,
  }));
}

export async function getCourseForManagement(
  courseId: string,
  userId: string,
  isAdmin: boolean
): Promise<CourseManagementInfo | null> {
  const [courseRow] = await db
    .select({
      id: course.id,
      title: course.title,
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
      visibility: course.visibility,
      createdBy: course.createdBy,
    })
    .from(course)
    .where(eq(course.id, courseId));

  if (!courseRow) return null;

  if (courseRow.createdBy !== userId && !isAdmin) return null;

  const units = await db
    .select({
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      visibility: unit.visibility,
      markdown: unit.markdown,
    })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  return {
    id: courseRow.id,
    title: courseRow.title,
    sourceLanguage: courseRow.sourceLanguage,
    targetLanguage: courseRow.targetLanguage,
    level: courseRow.level,
    visibility: courseRow.visibility,
    createdBy: courseRow.createdBy,
    units: units.map((u) => {
      const { lessons } = getUnitLessonsSafe(u.markdown ?? "");
      return {
        id: u.id,
        title: u.title,
        icon: u.icon,
        visibility: u.visibility,
        lessonCount: lessons.length,
      };
    }),
  };
}

/** Units owned by user that are NOT assigned to any course (available to add). */
export async function getUserOwnedStandaloneUnits(
  userId: string
): Promise<AvailableUnitForCourse[]> {
  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      targetLanguage: unit.targetLanguage,
      level: unit.level,
      markdown: unit.markdown,
    })
    .from(unit)
    .where(and(eq(unit.createdBy, userId), isNull(unit.courseId)));

  return rows.map((u) => {
    const { lessons } = getUnitLessonsSafe(u.markdown ?? "");
    return {
      id: u.id,
      title: u.title,
      icon: u.icon,
      targetLanguage: u.targetLanguage,
      level: u.level,
      lessonCount: lessons.length,
    };
  });
}
