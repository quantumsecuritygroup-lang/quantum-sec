import { CATEGORY_META, type Category } from "@/lib/supabase";

export function CategoryTag({ category }: { category: Category }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] tracking-widest ${meta.color}`}
    >
      {meta.label}
    </span>
  );
}
