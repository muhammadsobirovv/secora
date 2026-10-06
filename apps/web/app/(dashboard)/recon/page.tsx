"use client";

import { Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentReconJobs } from "@/features/recon/hooks/use-recon";
import { ReconJobList } from "@/features/recon/components/recon-job-list";
import { PageHelp } from "@/components/common/page-help";

/// Workspace-wide recon landing page — "Recent Scans" from the dashboard
/// spec. Unlike Evidence/Notes, recon jobs aren't picked-project-first: a
/// pentester wants to see what's running right now across every project,
/// then drill into a job or jump to its target/project.
export default function ReconLandingPage() {
  const { data: jobs, isLoading } = useRecentReconJobs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Radar className="size-6" /> Recon
          <PageHelp
            summary="Recon is reconnaissance: automatically mapping out a target's attack surface — subdomains, live hosts, crawled URLs, historical URLs, WHOIS/ASN ownership — before you look for vulnerabilities. Every scan runs against a target you've already added to a project."
            steps={[
              "Open a project, then a target, and click \"New scan\" to pick a tool (subdomain enumeration, crawler, URL history, WHOIS, ASN lookup) and run it.",
              "Watch progress and live logs while the scan runs.",
              "Review the normalized findings (subdomains, URLs, hosts) — they feed into Vulnerabilities and the Asset Graph automatically.",
            ]}
            actions={[
              { label: "Recent scans", description: "Every recon job across all your projects, newest first — click one to see its live logs and results." },
              { label: "Target", description: "Jumps to the target page a given scan ran against, where you can start more scans." },
            ]}
          />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent scans across every project. Start new scans from a target&apos;s page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          <ReconJobList
            jobs={jobs}
            isLoading={isLoading}
            showTarget
            emptyDescription="Start a scan from any target's page to see it here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
