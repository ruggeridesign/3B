import type { Preview } from '@storybook/react-vite';

// Carga los design tokens de 3B y Tailwind para que los componentes
// se vean con los estilos reales dentro de Storybook.
import '../src/styles/theme.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - muestra violaciones de accesibilidad en el panel
      // 'error' - falla el CI ante violaciones
      // 'off' - desactiva los chequeos
      test: 'todo',
    },
  },
};

export default preview;
