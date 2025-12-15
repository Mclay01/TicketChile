// apps/web/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import LandingPage from './LandingPage.tsx';
import './index.css';

const path = window.location.pathname.toLowerCase();
const params = new URLSearchParams(window.location.search);

// ✅ Si hay "modo app" por query, montamos App aunque el path sea "/"
const shouldUseApp =
  path !== '/' ||
  params.has('evento') ||
  params.has('payment') ||
  params.has('login');

const RootComponent = shouldUseApp ? App : LandingPage;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
