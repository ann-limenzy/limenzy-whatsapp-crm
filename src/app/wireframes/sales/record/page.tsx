import { RecordScreen } from "@/components/wireframes/sales/record-screen";
import { StepFooter } from "@/components/wireframes/presentation-chrome";

/**
 * The lead record is reachable from Today's work and from the Follow-ups
 * workspace, so `from` is read on the server and handed down as a plain
 * string. The screen resolves it against an allow-list and never treats it as
 * a URL.
 */
export default async function Page({
  searchParams,
}: PageProps<"/wireframes/sales/record">) {
  const { from } = await searchParams;
  return (
    <>
      <RecordScreen from={typeof from === "string" ? from : null} />
      <StepFooter />
    </>
  );
}
