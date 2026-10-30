import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';

// Playground de desarrollo rápido (`npm run dev`).
// Para documentar y revisar componentes de forma aislada usá Storybook
// (`npm run storybook`).
function Playground() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">3B · Design System</h1>
        <p className="text-gray-500">
          Playground de desarrollo. Usá Storybook para ver los componentes.
        </p>
      </div>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root');
}

createRoot(rootElement).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
