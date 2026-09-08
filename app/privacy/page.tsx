import { Card } from "@/components/ui/card";

// Public — no auth, no member layout gating. Linked from the SMS consent
// disclosure on /signup and /login for TCR/A2P 10DLC campaign registration.
//
// Drafted text, not attorney-reviewed. Bump lib/auth/sms-consent.ts's
// SMS_CONSENT_VERSION if the SMS section below materially changes what a
// subscriber is agreeing to.
const EFFECTIVE_DATE = "September 8, 2026";
const SUPPORT_PHONE = "(571) 609-4070";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <Card>
        <div className="flex flex-col gap-5 text-sm text-muted">
          <p>Effective date: {EFFECTIVE_DATE}</p>

          <p>
            This Privacy Policy explains what information NetQueue (&quot;NetQueue,&quot; &quot;we,&quot;
            &quot;us&quot;) collects when you use the NetQueue event waitlist service (the &quot;Service&quot;),
            how we use and share it, and the choices you have.
          </p>

          <h2 className="font-medium text-foreground">Information we collect</h2>
          <p>We collect the following information in connection with your use of the Service:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Phone number.</strong> Used to identify your account and to send one-time login codes and, if
              you opt in, other SMS messages described below. Your phone number is never shown to other members —
              only group admins and platform admins can see it, and only for members of a group they administer.
            </li>
            <li>
              <strong>Display name.</strong> The name you enter at signup, shown to other members of groups you
              belong to.
            </li>
            <li>
              <strong>Event and RSVP activity.</strong> Which events you sign up for, your queue position, guests you
              add, and related timestamps. This is visible to admins of the group the event belongs to, and, for
              information like your name and RSVP status, to other members of that group.
            </li>
            <li>
              <strong>Group membership.</strong> Which groups you&apos;ve joined or requested to join, and any
              admin role you hold within a group.
            </li>
            <li>
              <strong>Waiver signatures.</strong> If a group requires a waiver for its events, we record that you (or
              a guest you invite) viewed and signed it, along with the timestamp and the version of the waiver text
              shown.
            </li>
            <li>
              <strong>Guest information.</strong> If you invite a guest to an event, we collect the name you provide
              for them so the event host can identify their party.
            </li>
            <li>
              <strong>Device and usage data.</strong> Standard technical data such as IP address, browser type, and
              access timestamps, collected automatically for security and abuse prevention (for example, rate-
              limiting login attempts).
            </li>
          </ul>

          <h2 className="font-medium text-foreground">SMS messaging</h2>
          <p>
            If you opt in during signup, NetQueue sends SMS text messages tied to your account and event activity:
            your one-time login code, waitlist promotion or demotion alerts, and event cancellations or changes to
            time or location. Message frequency varies based on your event activity. Message and data rates may
            apply.
          </p>
          <p>
            Reply <strong>HELP</strong> for help, or <strong>STOP</strong> at any time to opt out of SMS messages. If
            you opt out, you can still use the Service, but you will need to retrieve login codes and other updates
            by other means we make available, and you may re-opt in from your account settings. Carriers are not
            liable for delayed or undelivered messages.
          </p>
          <p>
            No mobile information will be shared with third parties or affiliates for marketing or promotional
            purposes. Text messaging originator opt-in data and consent will not be shared with any third parties,
            except as described below for the subprocessors who deliver the messages on our behalf.
          </p>

          <h2 className="font-medium text-foreground">How we use information</h2>
          <p>We use the information above to:</p>
          <ul className="list-disc pl-5">
            <li>Operate the waitlist and RSVP queue, including seat allocation and notifications</li>
            <li>Authenticate you via one-time phone verification codes</li>
            <li>Enforce group visibility rules and admin permissions</li>
            <li>Send the SMS and, where applicable, email notifications you&apos;ve opted into</li>
            <li>Detect and prevent abuse, fraud, and unauthorized access (for example, SMS pumping)</li>
            <li>Maintain an operational log of account and event actions for support and dispute resolution</li>
          </ul>
          <p>We do not sell your personal information, and we do not use it for advertising.</p>

          <h2 className="font-medium text-foreground">How we share information</h2>
          <p>We share information only as needed to operate the Service:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Twilio</strong>, our SMS and phone-verification provider, processes your phone number and
              message content solely to deliver login codes and SMS notifications on our behalf.
            </li>
            <li>
              <strong>Hosting and database providers</strong> that store the Service&apos;s data on our behalf, under
              contractual confidentiality obligations.
            </li>
            <li>
              <strong>Group and platform admins</strong>, to the extent described above (RSVP activity, phone number,
              waiver status) — scoped strictly to groups you&apos;re a member of.
            </li>
            <li>
              As required by law, or to protect the rights, safety, or property of NetQueue, our users, or the
              public.
            </li>
          </ul>

          <h2 className="font-medium text-foreground">Data retention</h2>
          <p>
            We retain account and event data for as long as your account is active and as needed to maintain an
            accurate historical event log. If you delete your account, we remove or anonymize personal information
            within a reasonable period, except where we&apos;re required to retain it (for example, waiver records
            tied to a past event) or where it exists in group admins&apos; own records.
          </p>

          <h2 className="font-medium text-foreground">Your choices</h2>
          <ul className="list-disc pl-5">
            <li>Opt out of SMS at any time by replying STOP, or from your account settings.</li>
            <li>Request a copy of, correction to, or deletion of your personal information.</li>
            <li>Request that we close your account.</li>
          </ul>
          <p>
            To exercise any of these choices, contact us at {SUPPORT_PHONE}. We may need to verify your identity
            (typically via your registered phone number) before acting on a request.
          </p>

          <h2 className="font-medium text-foreground">Children&apos;s privacy</h2>
          <p>
            The Service is not directed to children under 13, and we do not knowingly collect personal information
            from them. If you believe a child has provided us information, contact us and we will delete it.
          </p>

          <h2 className="font-medium text-foreground">Security</h2>
          <p>
            We use reasonable administrative and technical safeguards to protect your information, including
            restricting exact event locations from being shown before their scheduled reveal time and scoping data
            access to group membership. No method of transmission or storage is completely secure, and we can&apos;t
            guarantee absolute security.
          </p>

          <h2 className="font-medium text-foreground">Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make a material change to how we handle SMS
            consent, we will ask you to re-confirm consent before continuing to send messages. We&apos;ll post the
            updated effective date above when changes take effect.
          </p>

          <h2 className="font-medium text-foreground">Contact us</h2>
          <p>Questions about this policy or your information? Contact NetQueue at {SUPPORT_PHONE}.</p>
        </div>
      </Card>
    </main>
  );
}
