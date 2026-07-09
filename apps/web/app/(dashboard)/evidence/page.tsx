"use client";

import { ImageIcon } from "lucide-react";
import { ProjectPicker } from "@/components/common/project-picker";

export default function EvidenceLandingPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Evidence</h1>
      <ProjectPicker
        icon={ImageIcon}
        description="Evidence belongs to a project — choose one to view or add evidence."
        hrefFor={(id) => `/projects/${id}?tab=evidence`}
      />
    </div>
  );
}
