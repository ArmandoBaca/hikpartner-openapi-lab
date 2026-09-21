import { OpsGrid } from "@/components/OperationCard";
import { moduleBySlug } from "@/lib/operations";

export function ModulePage({ slug, extra }: { slug: string; extra?: React.ReactNode }) {
  const mod = moduleBySlug(slug);
  if (!mod) return <p>Módulo no encontrado.</p>;
  return (
    <>
      <header className="page-head">
        <h2>{mod.title}</h2>
        <p>{mod.blurb}</p>
      </header>
      {extra}
      <OpsGrid ops={mod.ops} />
    </>
  );
}
