import { useState } from 'react';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { PropertyDetail } from './pages/PropertyDetail';
import type { Navigate, Page } from './types';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [propertyId, setPropertyId] = useState<string>();

  const navigate: Navigate = (target, id) => {
    setPage(target);
    if (id) setPropertyId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  switch (page) {
    case 'login':
      return <Login onNavigate={navigate} />;
    case 'register':
      return <Register onNavigate={navigate} />;
    case 'detail':
      return <PropertyDetail onNavigate={navigate} propertyId={propertyId} />;
    default:
      return <Home onNavigate={navigate} />;
  }
}
