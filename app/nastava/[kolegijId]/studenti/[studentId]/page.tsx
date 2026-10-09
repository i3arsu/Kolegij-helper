import { notFound } from "next/navigation";
import { sql } from "kysely";
import { Gumb, Kartica, Oznaka, Tablica, TrakaPostotka } from "@/components/ui";
import { ulogaNaKolegiju, upit } from "@/lib/auth/guard";
import { NAZIV_STATUSA } from "@/lib/domena/dolaznost";
import { formatDatum, formatDatumDan, formatVrijeme, isoDatum } from "@/lib/domena/vrijeme";
import { dolasciStudenta } from "@/lib/servisi/termini";
import { grupeKolegija } from "@/lib/servisi/uvoz";
import { statusUpisaAkcija } from "./akcije";
import { PromjenaGrupe, ResetLozinke } from "./komponente";

export default async function ProfilStudenta({ params }: PageProps<"/nastava/[kolegijId]/studenti/[studentId]">) {
  const { kolegijId, studentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const uloga = await ulogaNaKolegiju(kolegijId);

  const podaci = await upit(async (tx) => {
    const student = await tx
      .selectFrom("student as s")
      .innerJoin("upis as u", (j) => j.onRef("u.student_id", "=", "s.id").on("u.kolegij_id", "=", kolegijId))
      .innerJoin("korisnik as k", "k.id", "s.korisnik_id")
      .select(["s.id", "s.jmbag", "s.ime", "s.prezime", "k.email", "k.zadnja_prijava", "u.id as upis_id", "u.status"])
      .where("s.id", "=", studentId)
      .executeTakeFirst();
    if (!student) return null;
    const { rows: clanstva } = await sql<{ naziv: string; tip: string; od: Date | null; do: Date | null }>`
      select g.naziv, cg.tip, lower(cg.vrijedi) as od, upper(cg.vrijedi) as "do"
      from clanstvo_grupe cg join grupa g on g.id = cg.grupa_id
      where cg.upis_id = ${student.upis_id} order by lower(cg.vrijedi) nulls first`.execute(tx);
    const dolaznost = await tx.selectFrom("v_dolaznost").selectAll()
      .where("kolegij_id", "=", kolegijId).where("student_id", "=", studentId).execute();
    return { student, clanstva, dolaznost, dolasci: await dolasciStudenta(tx, kolegijId, studentId), grupe: await grupeKolegija(tx, kolegijId) };
  });
  if (!podaci) notFound();
  const { student, clanstva, dolaznost, dolasci, grupe } = podaci;
  const zaTip = (tip: string) => dolaznost.find((d) => d.tip === tip);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Kartica naslov={<>{student.prezime} {student.ime} {student.status === "ispisan" && <Oznaka ton="upozorenje">ispisan</Oznaka>}</>}>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-tekst-slab">JMBAG</dt><dd className="tabular-nums">{student.jmbag}</dd>
            <dt className="text-tekst-slab">E-mail</dt><dd>{student.email}</dd>
            <dt className="text-tekst-slab">Zadnja prijava</dt><dd>{student.zadnja_prijava ? formatDatum(student.zadnja_prijava) : "nikad"}</dd>
          </dl>
        </Kartica>
        <Kartica naslov="Dolaznost">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {(["predavanje", "vjezbe"] as const).map((tip) => {
              const d = zaTip(tip);
              return (
                <TrakaPostotka
                  key={tip}
                  oznaka={`${tip === "predavanje" ? "Predavanja" : "Vježbe"} (${d ? `${d.prisutan}/${d.odrzano}` : "0/0"})`}
                  postotak={d?.postotak != null ? Number(d.postotak) : null}
                  prag={d?.prag != null ? Number(d.prag) : null}
                />
              );
            })}
          </div>
          <Tablica>
            <thead><tr><th>Termin</th><th>Grupa</th><th>Tema</th><th>Status</th></tr></thead>
            <tbody>
              {dolasci.map((d) => (
                <tr key={d.termin_id} className={d.otkazan ? "text-tekst-slab line-through" : undefined}>
                  <td>{formatDatumDan(d.pocetak)} {formatVrijeme(d.pocetak)}</td>
                  <td>{d.grupa}{d.gost && " (gost)"}</td>
                  <td>{d.tema ?? ""}</td>
                  <td>
                    {d.otkazan ? "otkazan" : !d.evidentirano ? <span className="text-tekst-slab">nije evidentirano</span> : (
                      <Oznaka ton={d.status === "prisutan" ? "uspjeh" : d.status === "opravdano" ? "upozorenje" : "greska"}>{NAZIV_STATUSA[d.status ?? "odsutan"]}</Oznaka>
                    )}
                    {d.napomena && <span className="ml-2 text-xs text-tekst-slab">{d.napomena}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tablica>
        </Kartica>
      </div>
      <div className="space-y-4">
        <Kartica naslov="Grupe">
          <ul className="space-y-1 text-sm">
            {clanstva.map((c, i) => (
              <li key={i} className={c.do ? "text-tekst-slab" : undefined}>
                {c.naziv} ({c.tip === "predavanje" ? "P" : "V"})
                {c.od && ` od ${formatDatum(c.od)}`}{c.do && ` do ${formatDatum(c.do)}`}
              </li>
            ))}
          </ul>
          {uloga === "nastavnik" && (
            <div className="mt-4 border-t border-rub pt-4">
              <PromjenaGrupe kolegijId={kolegijId} upisId={student.upis_id} grupe={grupe} danas={isoDatum(new Date())} />
            </div>
          )}
        </Kartica>
        {uloga === "nastavnik" && (
          <Kartica naslov="Račun i upis">
            <div className="flex flex-col gap-3">
              <ResetLozinke kolegijId={kolegijId} studentId={student.id} />
              <form action={statusUpisaAkcija.bind(null, kolegijId, student.upis_id, student.status === "aktivan" ? "ispisan" : "aktivan")}>
                <Gumb varijanta={student.status === "aktivan" ? "opasni" : "sekundarni"} className="w-full">
                  {student.status === "aktivan" ? "Označi kao ispisanog" : "Vrati u aktivne"}
                </Gumb>
              </form>
            </div>
          </Kartica>
        )}
      </div>
    </div>
  );
}
