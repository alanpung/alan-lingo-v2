"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCourseToLibrary, removeCourseFromLibrary } from "@/lib/actions/library";

interface CourseLibraryButtonProps {
  courseId: string;
  initialIsInLibrary: boolean;
}

export function CourseLibraryButton({
  courseId,
  initialIsInLibrary,
}: CourseLibraryButtonProps) {
  const router = useRouter();
  const [isInLibrary, setIsInLibrary] = useState(initialIsInLibrary);
  const [isPending, startTransition] = useTransition();

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    startTransition(async () => {
      try {
        if (isInLibrary) {
          const result = await removeCourseFromLibrary(courseId);
          if (result.success) {
            setIsInLibrary(false);
            router.refresh();
          } else {
            alert(result.error);
          }
        } else {
          const result = await addCourseToLibrary(courseId);
          if (result.success) {
            setIsInLibrary(true);
            router.refresh();
          } else {
            alert(result.error);
          }
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update library");
      }
    });
  }

  if (isInLibrary) {
    return (
      <button
        onClick={handleToggle}
        disabled={isPending}
        title="Click to remove from library"
        className="group/lib inline-flex items-center gap-1 rounded-xl border border-lingo-green/40 bg-lingo-green/10 px-2.5 py-1 text-xs font-bold text-lingo-green hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
      >
        <span className="group-hover/lib:hidden">✓ In Library</span>
        <span className="hidden group-hover/lib:inline">✕ Remove</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className="rounded-xl border-2 border-lingo-blue bg-lingo-blue px-3 py-1 text-xs font-bold text-white transition-all hover:bg-lingo-blue/90 active:translate-y-[1px] disabled:opacity-50 shadow-sm"
    >
      {isPending ? "Adding..." : "+ Add to Library"}
    </button>
  );
}
