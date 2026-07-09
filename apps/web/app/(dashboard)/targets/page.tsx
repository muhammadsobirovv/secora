"use client";

import { Target } from "lucide-react";
import { ProjectPicker } from "@/components/common/project-picker";

export default function TargetsLandingPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Targets</h1>
      <ProjectPicker
        icon={Target}
        description="Targets belong to a project — choose one to view or add its targets."
        hrefFor={(id) => `/projects/${id}?tab=targets`}
      />
    </div>
  );
}
