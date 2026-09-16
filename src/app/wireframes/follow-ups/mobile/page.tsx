import { MobileFollowUpsScreen } from "@/components/wireframes/follow-ups/mobile-workspace";
import { StepFooter } from "@/components/wireframes/presentation-chrome";

/**
 * `createFor` names a record to preselect in the + Follow-up flow, and `from`
 * names where the caller came back from. Both are read on the server and handed
 * down as plain strings; the screen resolves each against an allow-list and
 * neither is ever treated as a URL.
 */
export default async function Page({
  searchParams,
}: PageProps<"/wireframes/follow-ups/mobile">) {
  const { createFor, from } = await searchParams;
  return (
    <>
      <MobileFollowUpsScreen
        createFor={typeof createFor === "string" ? createFor : null}
        from={typeof from === "string" ? from : null}
      />
      <StepFooter />
    </>
  );
}
