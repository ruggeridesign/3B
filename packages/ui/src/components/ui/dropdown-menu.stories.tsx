import type { Meta, StoryObj } from '@storybook/react-vite';
import { LogOut, Package, Store, Truck, UserCog } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';

const meta = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Cambiar de espacio</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Espacios</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Package />
            Comprar
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Store />
            Mi Tienda
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Truck />
            Mover
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <UserCog />
              Admin
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Plataforma</DropdownMenuItem>
              <DropdownMenuItem>Comunidad</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOut />
          Cerrar sesión
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Fondo colorido para apreciar el vidrio esmerilado del menú.
function Backdrop() {
  return (
    <div
      className="min-h-dvh p-8 text-foreground"
      style={{
        background:
          'radial-gradient(circle at 20% 20%, var(--accent), transparent 40%),' +
          'radial-gradient(circle at 85% 30%, var(--primary), transparent 40%),' +
          'radial-gradient(circle at 50% 90%, var(--brand), transparent 45%),' +
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
