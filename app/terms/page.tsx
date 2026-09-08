import { Card } from "@/components/ui/card";

// Public — no auth, no member layout gating. Linked from the SMS consent
// disclosure on /signup and /login for TCR/A2P 10DLC campaign registration.
//
// Drafted text, not attorney-reviewed.
const EFFECTIVE_DATE = "September 8, 2026";
const SUPPORT_PHONE = "(571) 609-4070";

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <Card>
        <div className="flex flex-col gap-5 text-sm text-muted">
          <p>Effective date: {EFFECTIVE_DATE}</p>

          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of NetQueue (the &quot;Service&quot;), an
            event waitlist tool for capacity-limited recurring events. By creating an account or otherwise using the
            Service, you agree to these Terms. If you don&apos;t agree, don&apos;t use the Service.
          </p>

          <h2 className="font-medium text-foreground">1. The Service</h2>
          <p>
            NetQueue lets group organizers create events with limited capacity and lets members join a first-come,
            first-served signup queue, bring approved guests, and receive updates about their spot. NetQueue provides
            the software; the events themselves, including their rules, safety, and conduct, are run by the group and
            its admins, not by NetQueue.
          </p>

          <h2 className="font-medium text-foreground">2. Eligibility and accounts</h2>
          <p>
            You must be at least 13 years old to use the Service. You must provide a valid phone number you control
            and verify it via a one-time code to create an account. You&apos;re responsible for keeping access to
            your phone number and account secure, and for all activity under your account.
          </p>

          <h2 className="font-medium text-foreground">3. SMS messaging</h2>
          <p>
            If you opt in, NetQueue sends SMS messages related to your account and RSVPs, including login codes and
            waitlist and event-change alerts. Message and data rates may apply, and frequency varies with your
            activity. See our{" "}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>{" "}
            for the full SMS program details, consent, and how to opt out (reply STOP at any time, or update your
            account settings).
          </p>

          <h2 className="font-medium text-foreground">4. Groups, admins, and your content</h2>
          <p>
            Groups are created and administered by group admins, who set join policy, event details, capacity, and
            any group waiver. Group admins and platform admins can see membership, RSVP, and phone number information
            for members of groups they administer, as described in our Privacy Policy. You&apos;re responsible for
            the accuracy of the information you submit (display name, guest names, RSVPs).
          </p>
          <p>
            If a group requires a waiver to attend its events, signing it is a separate agreement between you (or
            your guest) and that group/its admins — NetQueue only records that a signature occurred and facilitates
            delivering the waiver link. NetQueue is not a party to that waiver and doesn&apos;t adjudicate disputes
            arising from it.
          </p>

          <h2 className="font-medium text-foreground">5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5">
            <li>Use the Service to sign up for or manage attendance at events you haven&apos;t been invited to</li>
            <li>Attempt to bypass queue order, capacity limits, or group visibility restrictions</li>
            <li>Create accounts using a phone number you don&apos;t control, or impersonate another person</li>
            <li>Send unsolicited messages, spam, or abuse the SMS or notification systems</li>
            <li>Probe, scan, or attempt unauthorized access to the Service or another user&apos;s account or data</li>
            <li>Use the Service in a way that violates applicable law</li>
          </ul>

          <h2 className="font-medium text-foreground">6. Fees</h2>
          <p>
            The Service is currently provided free of charge. If we introduce paid features in the future, we&apos;ll
            describe their pricing and terms before you&apos;re charged.
          </p>

          <h2 className="font-medium text-foreground">7. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service, and group admins may remove you from a group, if
            we or they reasonably believe you&apos;ve violated these Terms or a group&apos;s own rules. You may stop
            using the Service, or ask us to delete your account, at any time.
          </p>

          <h2 className="font-medium text-foreground">8. Disclaimers</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind,
            express or implied, including merchantability, fitness for a particular purpose, and non-infringement.
            NetQueue does not guarantee that the Service will be uninterrupted, secure, or error-free, or that queue
            positions, notifications, or seat allocations will always be accurate or delivered on time. NetQueue is
            not responsible for the conduct of any group, admin, event organizer, or other user, or for what happens
            at an event itself.
          </p>

          <h2 className="font-medium text-foreground">9. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, NetQueue and its operators won&apos;t be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of data, goodwill, or missed events,
            arising from your use of the Service. Our total liability for any claim relating to the Service is
            limited to the greater of $50 or the amount you paid us in the twelve months before the claim arose.
          </p>

          <h2 className="font-medium text-foreground">10. Indemnification</h2>
          <p>
            You agree to indemnify and hold NetQueue harmless from any claims, damages, or expenses (including
            reasonable attorneys&apos; fees) arising from your violation of these Terms or misuse of the Service.
          </p>

          <h2 className="font-medium text-foreground">11. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. If we make a material change, we&apos;ll post the updated
            effective date above and, where required, ask you to re-accept before continuing to use the Service.
          </p>

          <h2 className="font-medium text-foreground">12. Governing law</h2>
          <p>
            These Terms are governed by the laws of the Commonwealth of Virginia, without regard to its conflict-of-
            laws principles, regardless of where you access or use the Service from.
          </p>

          <h2 className="font-medium text-foreground">13. Contact</h2>
          <p>Questions about these Terms? Contact NetQueue at {SUPPORT_PHONE}.</p>
        </div>
      </Card>
    </main>
  );
}
