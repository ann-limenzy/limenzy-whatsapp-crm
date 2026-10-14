import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Offline" };

/**
 * The offline fallback — Milestone 1E.
 *
 * Served by the service worker when a navigation cannot reach the network.
 *
 * It deliberately shows **no workspace content**: no workspace name, no
 * counts, no cached records, not even whether anyone is signed in. This page
 * is precached and therefore shared by everyone who uses this browser profile,
 * so anything it rendered would outlive a sign-out. It is also a static page
 * with no server data access, which is what makes that guarantee structural
 * rather than a promise.
 *
 * Reloading is the only action offered, because it is the only one that can
 * work: the application does not queue edits offline.
 */
export default function OfflinePage() {
  return (
    <div className="app-ambient flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[26rem] text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full border border-border/70 bg-card">
          <CloudOff
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        <h1 className="text-xl font-semibold">You&rsquo;re offline</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Limenzy needs a connection to show your workspace. Nothing is stored
          on this device, so there is nothing to show until you reconnect.
        </p>

        <div className="mt-6 grid gap-3">
          {/*
            A plain anchor, not <Link>, and the lint rule is disabled knowingly.
            The client router cannot retry a dead network: it would attempt an
            RSC fetch, fail, and leave the user on this same screen. A document
            navigation is what actually re-attempts the connection, and it also
            lets the service worker try the network again from scratch.
          */}
          <Button asChild className="w-full">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Try again</a>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/install">How to install Limenzy</Link>
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Any work you had not saved was not sent. Check it again once you are
          back online.
        </p>
      </div>
    </div>
  );
}
