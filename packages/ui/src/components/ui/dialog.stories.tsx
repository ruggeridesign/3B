import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'UI/Dialog',
  component: Dialog,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Abrir tienda</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tienda</DialogTitle>
          <DialogDescription>
            El modal usa vidrio esmerilado: el fondo se desenfoca y abre con
            transición fluida (sin cambios instantáneos).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="nombre">Nombre de la tienda</Label>
            <Input id="nombre" placeholder="Ferretería Central" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="comunidad">Comunidad</Label>
            <Input id="comunidad" placeholder="Coro, Falcón" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button>Crear tienda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Fondo colorido para apreciar el desenfoque del scrim sobre el contenido.
function Backdrop() {
  return (
    <div
      className="grid min-h-dvh place-items-center p-8 text-foreground"
      style={{
        background:
          'radial-gradient(circle at 25% 25%, var(--accent), transparent 40%),' +
          'radial-gradient(circle at 75% 35%, var(--primary), transparent 40%),' +
          'radial-gradient(circle at 50% 85%, var(--brand), transparent 45%),' +
          'var(--background)',
      }}
    >
      <Demo />
    </div>
  );
}

export const Claro: Story = {
  render: () => <Backdrop />,
};

export const Oscuro: Story = {
  render: () => (
    <div className="dark">
      <Backdrop />
    </div>
  ),
};
