import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function RootPage() {
  const user = await getSession();
  if (user) redirect("/home");

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">N</span>
            NetQueue
          </span>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-foreground/5"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6 sm:py-32">
          <span className="rounded-full border border-border px-3 py-1 font-mono text-xs uppercase tracking-wide text-muted">
            For pickup sports &amp; community groups
          </span>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Never miss game night — or wonder if you got in.
          </h1>
          <p className="max-w-xl text-lg text-muted">
            NetQueue keeps a fair, first-come-first-served waitlist for your recurring pickup games and community meetups.
            Sign up with your phone, bring a +1, and know exactly where you stand.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3 text-base font-medium text-background hover:opacity-90"
            >
              Get started
            </Link>
            <span className="text-sm text-muted">No account yet? We&apos;ll text you a code.</span>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-16 sm:grid-cols-3 sm:px-6">
            <Feature
              title="Fair, first-come queues"
              description="Every signup gets a queue position the moment you RSVP. When a spot opens up, the next person in line gets it automatically."
            />
            <Feature
              title="Bring your +1s"
              description="Guests need host or admin approval before they count toward capacity, so you stay in control of who shows up."
            />
            <Feature
              title="Set it and forget it"
              description="Recurring series generate every instance on schedule. Configure the pattern once — capacity, location, timing — and it runs itself."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-center text-sm text-muted sm:px-6">
          © {new Date().getFullYear()} NetQueue
        </div>
      </footer>
    </>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}
