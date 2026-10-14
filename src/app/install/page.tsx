import { MonitorSmartphone, Share, SquarePlus } from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Install Limenzy" };

/**
 * Install guidance — Milestone 1E.
 *
 * Public and static on purpose. It describes how to install the application
 * and nothing about any workspace, so it is safe for the service worker to
 * precache and safe to reach while signed out — which matters, because the
 * offline screen links here and someone reading it has no connection.
 *
 * The two platforms differ in a way worth stating plainly rather than
 * flattening: Android Chrome offers a prompt, iOS Safari does not and requires
 * the Share sheet. Pretending they are the same produces guidance that fails
 * for half the readers.
 */
export default function InstallPage() {
  return (
    <div className="app-ambient min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-[36rem]">
        <div className="mb-8 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card">
            <MonitorSmartphone
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Install Limenzy</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Installing adds Limenzy to your home screen and opens it in its
              own window, without browser tabs or an address bar.
            </p>
          </div>
        </div>

        <section aria-labelledby="android-heading" className="grid gap-2">
          <h2 id="android-heading" className="text-base font-semibold">
            Android — Chrome
          </h2>
          <ol className="grid list-decimal gap-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
            <li>Open Limenzy in Chrome.</li>
            <li>
              Tap the <strong>⋮</strong> menu, then{" "}
              <strong>Add to Home screen</strong> or{" "}
              <strong>Install app</strong>.
            </li>
            <li>Confirm the name and tap Install.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Chrome may also show an install prompt by itself after a few visits.
          </p>
        </section>

        <Separator className="my-7" />

        <section aria-labelledby="ios-heading" className="grid gap-2">
          <h2 id="ios-heading" className="text-base font-semibold">
            iPhone and iPad — Safari
          </h2>
          <ol className="grid list-decimal gap-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              Open Limenzy in Safari. Other iOS browsers cannot install it.
            </li>
            <li>
              Tap <Share className="inline size-3.5" aria-hidden="true" />{" "}
              <strong>Share</strong> at the bottom of the screen.
            </li>
            <li>
              Scroll down and tap{" "}
              <SquarePlus className="inline size-3.5" aria-hidden="true" />{" "}
              <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            iOS does not offer an install prompt, so the Share sheet is the only
            route.
          </p>
        </section>

        <Separator className="my-7" />

        <Alert>
          <AlertTitle>You may need to sign in again</AlertTitle>
          <AlertDescription>
            The installed app may or may not inherit the session from your
            browser — it depends on the platform, and on iOS it usually does
            not. If Limenzy asks you to sign in after installing, that is
            expected. Your workspace and data are unaffected.
          </AlertDescription>
        </Alert>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Limenzy stores nothing on your device. Installing does not make the
          application work offline: without a connection it shows an offline
          screen rather than your workspace.
        </p>
      </div>
    </div>
  );
}
