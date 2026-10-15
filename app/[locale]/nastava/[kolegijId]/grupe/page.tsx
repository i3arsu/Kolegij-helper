import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Kartica, Tablica } from "@/components/ui";
import { ulogaNaKolegiju, upit } from "@/lib/auth/guard";
import { grupeSAsistentima, osobljeKolegija } from "@/lib/servisi/kolegij";
import { asistentAkcija } from "./akcije";
import { FormaGrupe } from "./forma";

export default async function Grupe({ params }: PageProps<"/[locale]/nastava/[kolegijId]/grupe">) {
  const { kolegijId } = await params;
  const uloga = await ulogaNaKolegiju(kolegijId);
  const t = await getTranslations("teacherGroups");
  const { grupe, asistenti } = await upit(async (tx) => ({
    grupe: await grupeSAsistentima(tx, kolegijId),
    asistenti: (await osobljeKolegija(tx, kolegijId)).filter((o) => o.uloga === "asistent"),
  }));
  return (
    <div className="space-y-4">
      <Tablica>
        <thead><tr><th>{t("group")}</th><th>{t("type")}</th><th>{t("students")}</th><th>{t("assistants")}</th></tr></thead>
        <tbody>
          {grupe.map((g) => (
            <tr key={g.id}>
              <td><Link className="font-medium hover:underline" href={`/nastava/${kolegijId}/studenti?grupa=${encodeURIComponent(g.naziv)}`}>{g.naziv}</Link></td>
              <td>{t(`types.${g.tip}`)}</td>
              <td>{g.broj_studenata}</td>
              <td>
                {uloga === "nastavnik" && asistenti.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {asistenti.map((a) => {
                      const dodijeljen = g.asistenti.some((x) => x.id === a.id);
                      return (
                        <form key={a.id} action={asistentAkcija.bind(null, kolegijId, g.id, a.id, !dodijeljen)}>
                          <button
                            className={`rounded-full border px-2 py-0.5 text-xs ${dodijeljen ? "border-naglasak bg-naglasak/10" : "border-rub text-tekst-slab"}`}
                            aria-pressed={dodijeljen}
                            title={dodijeljen ? t("removeFromGroup") : t("assignToGroup")}
                          >
                            {a.ime} {a.prezime}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                ) : (
                  g.asistenti.map((a) => `${a.ime} ${a.prezime}`).join(", ") || "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Tablica>
      {uloga === "nastavnik" && (
        <Kartica naslov={t("newGroup")}><FormaGrupe kolegijId={kolegijId} /></Kartica>
      )}
    </div>
  );
}
