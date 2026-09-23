"use server";

import { db } from "@/lib/db";
import { unit, course, user, userUnitLibrary, userCourseEnrollment } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/ai/models";

export async function addUnitToLibrary(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  // Verify unit exists
  const [existing] = await db
    .select({
      id: unit.id,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      courseId: unit.courseId,
    })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  // Check if created by an admin
  let isCreatedByAdmin = false;
  if (existing.createdBy) {
    const [creator] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, existing.createdBy));
    isCreatedByAdmin = creator?.email ? isAdminEmail(creator.email) : false;
  }

  // If in a course, check if parent course is public or created by admin
  let isParentCoursePublic = false;
  if (existing.courseId) {
    const [parentCourse] = await db
      .select({ visibility: course.visibility, createdBy: course.createdBy })
      .from(course)
      .where(eq(course.id, existing.courseId));
    if (parentCourse) {
      if (parentCourse.visibility === "public") isParentCoursePublic = true;
      if (parentCourse.createdBy) {
        const [courseCreator] = await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, parentCourse.createdBy));
        if (courseCreator?.email && isAdminEmail(courseCreator.email)) {
          isCreatedByAdmin = true;
        }
      }
    }
  }

  if (existing.visibility !== "public" && !isCreatedByAdmin && !isParentCoursePublic) {
    return { success: false, error: "Unit is not public" };
  }

  if (existing.createdBy === userId) {
    return { success: true };
  }

  // Insert into library (ignore if already exists)
  await db
    .insert(userUnitLibrary)
    .values({ userId, unitId })
    .onConflictDoNothing();

  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  if (existing.courseId) {
    revalidatePath(`/units/${existing.courseId}`, "page");
  }
  revalidatePath(`/unit/${unitId}`, "page");
  return { success: true };
}

export async function removeUnitFromLibrary(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  await db
    .delete(userUnitLibrary)
    .where(
      and(
        eq(userUnitLibrary.userId, userId),
        eq(userUnitLibrary.unitId, unitId)
      )
    );

  revalidatePath("/units", "page");
  revalidatePath(`/unit/${unitId}`, "page");
  return { success: true };
}

export async function addCourseToLibrary(
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  const [existingCourse] = await db
    .select({
      id: course.id,
      visibility: course.visibility,
      createdBy: course.createdBy,
    })
    .from(course)
    .where(eq(course.id, courseId));

  if (!existingCourse) {
    return { success: false, error: "Course not found" };
  }

  // Check if user is owner
  if (existingCourse.createdBy === userId) {
    return { success: true };
  }

  // Check visibility or creator admin status
  let isCreatedByAdmin = false;
  if (existingCourse.createdBy) {
    const [creator] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, existingCourse.createdBy));
    isCreatedByAdmin = creator?.email ? isAdminEmail(creator.email) : false;
  }

  if (existingCourse.visibility !== "public" && !isCreatedByAdmin) {
    return { success: false, error: "Course is not public" };
  }

  // Insert into course enrollment
  await db
    .insert(userCourseEnrollment)
    .values({ userId, courseId })
    .onConflictDoNothing();

  // Add all units in the course to userUnitLibrary
  const unitsInCourse = await db
    .select({ id: unit.id })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  for (const u of unitsInCourse) {
    await db
      .insert(userUnitLibrary)
      .values({ userId, unitId: u.id })
      .onConflictDoNothing();
  }

  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  revalidatePath(`/units/${courseId}`, "page");
  return { success: true };
}

export async function removeCourseFromLibrary(
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  await db
    .delete(userCourseEnrollment)
    .where(
      and(
        eq(userCourseEnrollment.userId, userId),
        eq(userCourseEnrollment.courseId, courseId)
      )
    );

  const unitsInCourse = await db
    .select({ id: unit.id })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  if (unitsInCourse.length > 0) {
    const unitIds = unitsInCourse.map((u) => u.id);
    await db
      .delete(userUnitLibrary)
      .where(
        and(
          eq(userUnitLibrary.userId, userId),
          inArray(userUnitLibrary.unitId, unitIds)
        )
      );
  }

  revalidatePath("/units", "page");
  revalidatePath("/units/browse", "page");
  revalidatePath(`/units/${courseId}`, "page");
  return { success: true };
}

