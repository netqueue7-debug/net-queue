import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listFeedback } from "@/lib/feedback/feedback";
import { formatDateTime } from "@/lib/format-datetime";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Linkify } from "@/components/ui/linkify";
import { ResolveFeedbackButton } from "./resolve-feedback-button";

// Platform-admin only — feedback is about the app itself, not any one
// group, so it doesn't fit the per-group admin model (docs/architecture.md
// #groups--tenancy). See docs/phase-3-polish.md.
export default async function AdminFeedbackPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/home");

  const feedback = await listFeedback();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Feedback</h1>

      {feedback.length === 0 && <EmptyState>Nothing submitted yet.</EmptyState>}

      <ul className="flex flex-col gap-2">
        {feedback.map((f) => (
          <li key={f.id}>
            <Card className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={f.type === "bug" ? "danger" : "info"}>{f.type === "bug" ? "Bug" : "Feedback"}</Badge>
                  {f.status === "resolved" && <Badge tone="success">Resolved</Badge>}
                </div>
                <span className="text-sm text-muted">
                  {f.authorDisplayName ?? "Member"} · {formatDateTime(f.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">
                <Linkify text={f.body} />
              </p>
              {f.status === "open" && (
                <div className="flex justify-end">
                  <ResolveFeedbackButton feedbackId={f.id} />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
