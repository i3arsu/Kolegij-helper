// Privremene osnovne komponente; izgled će se zamijeniti prema Claude Design materijalima.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function spoji(...klase: (string | false | null | undefined)[]) {
  return klase.filter(Boolean).join(" ");
}

export function Gumb({
  varijanta = "primarni",
  className,
  ...props
}: ComponentProps<"button"> & { varijanta?: "primarni" | "sekundarni" | "opasni" }) {
  return (
    <button
      className={spoji(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50",
        varijanta === "primarni" && "bg-naglasak text-naglasak-tekst hover:opacity-90",
        varijanta === "sekundarni" && "border border-rub bg-povrsina hover:bg-pozadina",
        varijanta === "opasni" && "border border-greska text-greska hover:bg-greska/10",
        className,
      )}
      {...props}
    />
  );
}

export function GumbLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={spoji(
        "inline-flex items-center justify-center rounded-md border border-rub bg-povrsina px-3 py-2 text-sm font-medium hover:bg-pozadina",
        className,
      )}
      {...props}
    />
  );
}

export function Polje({ oznaka, pomoc, className, ...props }: ComponentProps<"input"> & { oznaka: string; pomoc?: string }) {
  return (
    <label className={spoji("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{oznaka}</span>
      <input className="rounded-md border border-rub bg-povrsina px-3 py-2" {...props} />
      {pomoc && <span className="text-xs text-tekst-slab">{pomoc}</span>}
    </label>
  );
}

export function Odabir({
  oznaka,
  children,
  className,
  ...props
}: ComponentProps<"select"> & { oznaka: string }) {
  return (
    <label className={spoji("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{oznaka}</span>
      <select className="rounded-md border border-rub bg-povrsina px-3 py-2" {...props}>
        {children}
      </select>
    </label>
  );
}

export function Kartica({ naslov, children, className, akcije }: { naslov?: ReactNode; children: ReactNode; className?: string; akcije?: ReactNode }) {
  return (
    <section className={spoji("rounded-lg border border-rub bg-povrsina p-4", className)}>
      {(naslov || akcije) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {naslov && <h2 className="text-base font-semibold">{naslov}</h2>}
          {akcije}
        </div>
      )}
      {children}
    </section>
  );
}

export function Poruka({ vrsta = "info", children }: { vrsta?: "info" | "uspjeh" | "greska" | "upozorenje"; children: ReactNode }) {
  return (
    <div
      role={vrsta === "greska" ? "alert" : "status"}
      className={spoji(
        "rounded-md border px-3 py-2 text-sm",
        vrsta === "info" && "border-rub bg-pozadina",
        vrsta === "uspjeh" && "border-uspjeh/40 bg-uspjeh/10 text-uspjeh",
        vrsta === "greska" && "border-greska/40 bg-greska/10 text-greska",
        vrsta === "upozorenje" && "border-upozorenje/40 bg-upozorenje/10 text-upozorenje",
      )}
    >
      {children}
    </div>
  );
}

export function Oznaka({ ton = "neutralno", children }: { ton?: "neutralno" | "uspjeh" | "upozorenje" | "greska"; children: ReactNode }) {
  return (
    <span
      className={spoji(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        ton === "neutralno" && "bg-rub/60",
        ton === "uspjeh" && "bg-uspjeh/15 text-uspjeh",
        ton === "upozorenje" && "bg-upozorenje/15 text-upozorenje",
        ton === "greska" && "bg-greska/15 text-greska",
      )}
    >
      {children}
    </span>
  );
}

/** Postotak s pragom: traka i oznaka zadovoljava/ne zadovoljava. */
export function TrakaPostotka({ postotak, prag, oznaka }: { postotak: number | null; prag: number | null; oznaka?: string }) {
  const ok = postotak !== null && prag !== null ? postotak >= prag : null;
  return (
    <div className="flex flex-col gap-1">
      {oznaka && (
        <div className="flex justify-between text-sm">
          <span>{oznaka}</span>
          <span className="font-medium tabular-nums">
            {postotak === null ? "—" : `${postotak.toLocaleString("hr-HR")} %`}
            {prag !== null && <span className="text-tekst-slab"> / prag {prag.toLocaleString("hr-HR")} %</span>}
          </span>
        </div>
      )}
      <div className="relative h-2 rounded-full bg-rub" aria-hidden>
        <div
          className={spoji("h-2 rounded-full", ok === false ? "bg-greska" : ok ? "bg-uspjeh" : "bg-tekst-slab")}
          style={{ width: `${Math.min(100, postotak ?? 0)}%` }}
        />
        {prag !== null && <div className="absolute top-[-3px] h-[14px] w-0.5 bg-tekst" style={{ left: `${prag}%` }} />}
      </div>
    </div>
  );
}

export function Postotak({ vrijednost, prag }: { vrijednost: number | null; prag: number | null }) {
  if (vrijednost === null) return <span className="text-tekst-slab">—</span>;
  const ispod = prag !== null && vrijednost < prag;
  return (
    <span className={spoji("tabular-nums", ispod && "font-semibold text-greska")}>
      {vrijednost.toLocaleString("hr-HR")} %
    </span>
  );
}

export function Tablica({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-rub bg-povrsina">
      <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_th]:text-tekst-slab [&_thead]:border-b [&_thead]:border-rub [&_tbody_tr]:border-t [&_tbody_tr]:border-rub">
        {children}
      </table>
    </div>
  );
}

export function Naslov({ children, podnaslov, akcije }: { children: ReactNode; podnaslov?: ReactNode; akcije?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{children}</h1>
        {podnaslov && <p className="mt-1 text-sm text-tekst-slab">{podnaslov}</p>}
      </div>
      {akcije && <div className="flex gap-2">{akcije}</div>}
    </div>
  );
}
