// apps/web/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const path = window.location.pathname.toLowerCase();
const params = new URLSearchParams(window.location.search);

// Usamos App si hay intención de “app real” aunque estemos en "/"
const shouldRenderApp =
  path !== '/' ||
  params.has('evento') ||
  params.get('login') === '1' ||
  params.has('payment') ||
  params.get('view') === 'events';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
