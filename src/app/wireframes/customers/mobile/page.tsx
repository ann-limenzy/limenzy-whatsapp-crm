import { MobileCustomerRecordScreen } from "@/components/wireframes/customers/mobile-record";
import { StepFooter } from "@/components/wireframes/presentation-chrome";

/**
 * The record is reachable from the directory and from the WhatsApp
 * conversation, and its back control has to return to whichever one sent the
 * user here. `from` is read on the server and handed down as a plain string;
 * the screen resolves it against an allow-list and never treats it as a URL.
 *
 * Reading searchParams makes this route dynamic. That is the right trade here:
 * the alternative — `useSearchParams` behind a Suspense boundary — left the
 * whole screen out of the server-rendered HTML.
 */
export default async function Page({
  searchParams,
}: PageProps<"/wireframes/customers/mobile">) {
  const { from } = await searchParams;
  return (
    <>
      <MobileCustomerRecordScreen
        from={typeof from === "string" ? from : null}
      />
      <StepFooter />
    </>
  );
}
