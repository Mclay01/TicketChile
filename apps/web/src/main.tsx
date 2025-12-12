// apps/web/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import LandingPage from './LandingPage.tsx';
import './index.css';

const path = window.location.pathname.toLowerCase();

// /  => Landing
// /eventos, /compra-exitosa, etc. => App (la app que ya tenías)
const RootComponent = path === '/' ? LandingPage : App;

ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
