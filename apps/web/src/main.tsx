import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './LandingPage.tsx';
import './index.css'
import App from './App.tsx'

const path = window.location.pathname.toLowerCase();


// /  => landing
// todo lo demás ( /eventos, /compra-exitosa, /lo-que-sea ) => App
const RootComponent = path === '/' ? LandingPage : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
    <App />
  </StrictMode>,
)
