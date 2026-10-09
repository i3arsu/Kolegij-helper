import { zahtijevajNastavnika } from "@/lib/auth/guard";
import { isoDatum } from "@/lib/domena/vrijeme";
import { Carobnjak } from "./carobnjak";

export default async function Uvoz({ params }: PageProps<"/nastava/[kolegijId]/uvoz">) {
  const { kolegijId } = await params;
  await zahtijevajNastavnika(kolegijId);
  return <Carobnjak kolegijId={kolegijId} danas={isoDatum(new Date())} />;
}
