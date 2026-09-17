import Link from "next/link";
import { getSession } from "@/lib/auth-server";
import { DEFAULT_PATH } from "@/lib/constants";
import { FeedbackButton } from "@/components/feedback/feedback-button";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-lingo-bg px-4">
      {/* Invisible spacer to maintain exact vertical centering of the main content */}
      <div className="w-full h-12 pointer-events-none" aria-hidden="true" />

      {/* Main wording centered vertically and horizontally */}
      <main className="max-w-2xl w-full text-center flex flex-col items-center justify-center my-auto py-8">
        {/* Header */}
        <div className="overflow-visible">
          <h1 className="relative z-20 text-6xl font-black text-rainbow tracking-tight pb-6 mb-1 inline-block leading-snug overflow-visible">
            AlanLingo
          </h1>
        </div>
        <p className="relative z-10 text-xl text-lingo-text-light mt-1 mb-2">
          Connecting LLMs to language learning
        </p>
        <p className="text-base text-lingo-text-light mb-8 max-w-lg">
          Create personalised units, read/listen to translated articles and
          practice with AI
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {session ? (
            <Link
              href={DEFAULT_PATH}
              className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
            >
              Go to App
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
              >
                Get Started
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-8 py-3 text-lg font-bold uppercase text-lingo-green border-2 border-lingo-border hover:bg-lingo-gray/30 transition-colors"
              >
                I Already Have an Account
              </Link>
            </>
          )}
        </div>
      </main>

      {/* Send feedback / Ask for help button at bottom center */}
      <footer className="w-full flex items-center justify-center pb-8 pt-4">
        <FeedbackButton />
      </footer>
    </div>
  );
}
