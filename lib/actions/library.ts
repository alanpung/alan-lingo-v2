"use server";

import { db } from "@/lib/db";
import { unit, course, user, userUnitLibrary } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
