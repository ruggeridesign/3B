import type { Meta, StoryObj } from '@storybook/react-vite';

// Showcase de las fundaciones del design system de 3B:
// paleta por rol, radios y glassmorfismo (claro + oscuro).

function Swatch({
  token,
  name,
  tag,
  text = 'text-foreground',
}: {
  token: string;
  name: string;
  tag?: string;
  text?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`${token} ${text} flex h-20 items-end rounded-md border border-border/50 p-2 text-xs font-medium`}
      >
        {tag}
      </div>
      <span className="text-xs text-muted-foreground">{name}</span>
    </div>
  );
}

function Palette() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <Swatch
        token="bg-primary"
        text="text-primary-foreground"
        name="--primary"
        tag="Movers · Acción"
      />
      <Swatch
        token="bg-accent"
        text="text-accent-foreground"
        name="--accent"
        tag="Sellers"
      />
      <Swatch
        token="bg-brand"
        text="text-brand-foreground"
        name="--brand"
        tag="Makers"
      />
      <Swatch
        token="bg-destructive"
        text="text-white"
        name="--destructive"
        tag="Destructivo"
      />
      <Swatch token="bg-background" name="--background" tag="Fondo" />
      <Swatch
        token="bg-foreground"
        text="text-background"
        name="--foreground"
        tag="Texto"
      />
      <Swatch
        token="bg-secondary"
        text="text-secondary-foreground"
        name="--secondary"
        tag="Secundario"
      />
      <Swatch
        token="bg-muted"
        text="text-muted-foreground"
        name="--muted"
        tag="Muted"
      />
    </div>
  );
}

function Radii() {
  const items = [
    { cls: 'rounded-sm', label: '4px · rounded-sm' },
    { cls: 'rounded-md', label: '6px · rounded-md (estándar)' },
    { cls: 'rounded-lg', label: '8px · rounded-lg (máximo)' },
  ];
  return (
    <div className="flex flex-wrap gap-6">
      {items.map((it) => (
        <div key={it.cls} className="flex flex-col items-center gap-2">
          <div
            className={`${it.cls} size-20 border-2 border-primary bg-primary/10`}
          />
          <span className="text-xs text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// Fondo colorido para que se note el desenfoque/saturación del vidrio.
function GlassScene() {
  return (
    <div className="relative h-72 overflow-hidden rounded-lg">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, var(--accent), transparent 45%),' +
            'radial-gradient(circle at 80% 30%, var(--primary), transparent 45%),' +
            'radial-gradient(circle at 50% 90%, var(--brand), transparent 50%),' +
            'var(--background)',
        }}
      />
      <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-5xl font-black tracking-tight text-foreground/30 select-none">
        3B · 3B · 3B
      </p>

      {/* .glass-bar — barra persistente (navbar / sidebar) */}
      <div className="glass-bar absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-sm font-medium">
        <span>Comunidad · Falcón</span>
        <span className="text-muted-foreground">.glass-bar</span>
      </div>

      {/* .glass — superficie elevada (modal / popover) */}
      <div className="glass absolute bottom-4 left-4 w-56 rounded-lg p-4">
        <p className="text-sm font-semibold">Superficie elevada</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Modales, popovers, dropdowns y selects usan <code>.glass</code>.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Foundations() {
  return (
    <div className="space-y-10">
      <Section title="Paleta por rol">
        <Palette />
      </Section>
      <Section title="Radios (6px estándar · 8px máximo)">
        <Radii />
      </Section>
      <Section title="Glassmorfismo (vidrio esmerilado)">
        <GlassScene />
      </Section>
    </div>
  );
}

const meta = {
  title: 'Fundaciones/Design tokens',
  component: Foundations,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Foundations>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Claro: Story = {
  render: () => (
    <div className="min-h-dvh bg-background p-8 text-foreground">
      <Foundations />
    </div>
  ),
};

export const Oscuro: Story = {
  render: () => (
    <div className="dark min-h-dvh bg-background p-8 text-foreground">
      <Foundations />
    </div>
  ),
};
