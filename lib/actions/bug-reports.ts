"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteBugReport, updateBugReportStatus, type BugReportStatus } from "@/lib/api";

export async function updateStatusAction(id: number, status: BugReportStatus) {
  await updateBugReportStatus(id, status);
  revalidatePath(`/bug-reports/${id}`);
  revalidatePath("/bug-reports");
}

export async function deleteReportAction(id: number) {
  await deleteBugReport(id);
  revalidatePath("/bug-reports");
  redirect("/bug-reports");
}
