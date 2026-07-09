"use client";

import { FileText } from "lucide-react";
import { ProjectPicker } from "@/components/common/project-picker";

export default function NotesLandingPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Notes</h1>
      <ProjectPicker
        icon={FileText}
        description="Notes belong to a project — choose one to view or add its notes."
        hrefFor={(id) => `/projects/${id}?tab=notes`}
      />
    </div>
  );
}
