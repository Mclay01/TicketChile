import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import EventosApp from './Eventos/App.tsx'; 
import './index.css'
import App from './Eventos/App.tsx'

const path = window.location.pathname.toLowerCase();

// Si quieres que *solo* /eventos/app use la nueva página:
const RootComponent =
  path === '/Eventos/App' ? EventosApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
