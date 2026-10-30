export function SpacePlaceholder({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-muted-foreground">{desc}</p>
      <div className="glass mt-4 rounded-lg p-6 text-sm text-muted-foreground">
        Espacio en construcción — la base (auth, RLS, capacidades) ya está
        lista.
      </div>
    </div>
  );
}
