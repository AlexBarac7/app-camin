import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ResidentAccess, { isResidentRoute } from './ResidentAccess.jsx';
import './index.css';
import './resident.css';

createRoot(document.getElementById('root')).render(<React.StrictMode>{isResidentRoute ? <ResidentAccess /> : <App />}</React.StrictMode>);
