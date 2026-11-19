import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const path = window.location.pathname.replace(/\/$/, '') || '/';
const pages = {
  '/': { page: 'welcome', lang: 'ro', title: 'Bun venit în cămin!' },
  '/resurse': { page: 'resources', lang: 'ro', title: 'Resursele căminului' },
  '/status': { page: 'status', lang: 'en', title: 'Service status' },
};
const { page, lang, title } = Object.hasOwn(pages, path) ? pages[path] : pages['/'];

document.documentElement.lang = lang;
document.title = `app-camin | ${title}`;

createRoot(document.getElementById('root')).render(<React.StrictMode><App page={page} /></React.StrictMode>);
