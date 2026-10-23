import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AdminApp from './AdminApp';
import '../index.css';
import { useThemeStore } from '../stores/themeStore';

useThemeStore.getState().hydrate();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/dashboard/CampusAdmin">
      <AdminApp />
    </BrowserRouter>
  </React.StrictMode>,
);
