/**
 * SectionCard.tsx
 *
 * Shared container for major DTM interface sections.
 */

type SectionCardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export default function SectionCard({
  title,
  subtitle,
  children,
}: SectionCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}