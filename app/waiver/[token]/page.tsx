import { notFound } from "next/navigation";
import { getGuestByWaiverToken } from "@/lib/guests/guests";
import { WAIVER_MARKDOWN } from "@/lib/waivers/content";
import { SignWaiverForm } from "./sign-waiver-form";
import { WaiverPanel } from "@/components/ui/waiver-panel";

// Public — no auth, no layout gating. The token itself is the credential.
export default async function GuestWaiverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guest = await getGuestByWaiverToken(token);
  if (!guest) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Guest waiver — {guest.eventTitle}</h1>

      {guest.waiverSignedAt ? (
        <p className="text-muted">This waiver has already been signed. Thanks!</p>
      ) : (
        <>
          <WaiverPanel content={WAIVER_MARKDOWN} />
          <SignWaiverForm token={token} initialName={guest.name ?? ""} />
        </>
      )}
    </main>
  );
}
