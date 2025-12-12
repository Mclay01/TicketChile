// apps/web/src/App.tsx
import React from 'react';
import EventosApp from './Eventos/App';
import CompraExitosaPage from './CompraExitosaPage';

function App() {
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : '/';

  const lower = pathname.toLowerCase();

  // /compra-exitosa  -> página de resumen de compra
  if (lower === '/compra-exitosa') {
    return <CompraExitosaPage />;
  }

  // Cualquier ruta que empiece con /eventos o /eventos/lo-que-sea
  // (incluye /Eventos/App porque normalizamos a lowerCase)
  if (lower.startsWith('/eventos')) {
    return <EventosApp />;
  }

  // Por defecto, usamos también la app de eventos como home
  return <EventosApp />;
}

export default App;