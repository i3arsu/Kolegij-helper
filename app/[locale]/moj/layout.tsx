import { redirect } from "next/navigation";
import { Okvir } from "@/components/okvir";
import { zahtijevajProfil } from "@/lib/auth/guard";

export default async function MojLayout({ children }: { children: React.ReactNode }) {
  const profil = await zahtijevajProfil();
  if (!profil.student) redirect("/");
  return <Okvir profil={profil} pocetna="/moj">{children}</Okvir>;
}
