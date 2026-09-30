import { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { BookingProvider } from './context/BookingContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Home } from './pages/Home';
import { PropertyDetail } from './pages/PropertyDetail';
import { MyBookings } from './pages/MyBookings';
import { PendingBookingData } from './types';

type Page = 'home' | 'login' | 'register' | 'detail' | 'bookings';

interface ReturnPath {
  page: Page;
  roomId?: string;
}

function AppRoutes() {
  const [page, setPage] = useState<Page>('home');
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>();
  const [returnPath, setReturnPath] = useState<ReturnPath | null>(null);
  const [pendingBooking, setPendingBooking] = useState<PendingBookingData | null>(null);

  const navigate = (target: string, id?: string) => {
    setPage(target as Page);
    if (id) setSelectedRoomId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoginSuccess = () => {
    if (returnPath) {
      const rp = returnPath;
      setReturnPath(null);
      setPage(rp.page);
      if (rp.roomId) setSelectedRoomId(rp.roomId);
    } else {
      setPage('home');
    }
    window.scrollTo({ top: 0 });
  };

  const handleRegisterSuccess = () => {
    setPage('home');
    window.scrollTo({ top: 0 });
  };

  const handleBookingRequired = (data: PendingBookingData) => {
    setPendingBooking(data);
    setReturnPath({ page: 'detail', roomId: data.roomId });
    setPage('login');
    window.scrollTo({ top: 0 });
  };

  const handleBookingConfirmed = () => {
    setPendingBooking(null);
  };

  if (page === 'login') {
    return (
      <Login
        onNavigate={navigate}
        onSuccess={handleLoginSuccess}
      />
    );
  }

  if (page === 'register') {
    return (
      <Register
        onNavigate={navigate}
        onSuccess={handleRegisterSuccess}
      />
    );
  }

  if (page === 'detail') {
    return (
      <PropertyDetail
        onNavigate={navigate}
        roomId={selectedRoomId}
        pendingBooking={pendingBooking}
        onBookingRequired={handleBookingRequired}
        onBookingConfirmed={handleBookingConfirmed}
      />
    );
  }

  if (page === 'bookings') {
    return <MyBookings onNavigate={navigate} />;
  }

  return <Home onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <BookingProvider>
        <AppRoutes />
      </BookingProvider>
    </AuthProvider>
  );
}
