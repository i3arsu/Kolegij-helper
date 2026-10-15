import { redirect } from "next/navigation";
import { Okvir } from "@/components/okvir";
import { zahtijevajProfil } from "@/lib/auth/guard";

export default async function NastavaLayout({ children }: { children: React.ReactNode }) {
  const profil = await zahtijevajProfil();
  if (!profil.osoblje && !profil.jeAdmin) redirect("/");
  return <Okvir profil={profil} pocetna="/nastava">{children}</Okvir>;
}
