import { useNavigate } from 'react-router-dom';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { useAuth } from '../../context/AuthContext';

/** Owner landing (`/host`). The "my properties" list arrives with RQ-03 (FE-023). */
export function HostHome() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-screen-lg mx-auto px-6 py-10 w-full">
        <p className="text-sm text-primary font-semibold mb-1">Panel de anfitrión</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Hola, {currentUser?.name.split(' ')[0] ?? 'anfitrión'}</h1>
        <p className="text-gray-500 text-sm mb-8">Publica tus alojamientos para que los huéspedes puedan encontrarlos y reservarlos.</p>
        <Button variant="primary" size="lg" onClick={() => navigate(paths.hostNew)}>Publicar una propiedad</Button>
      </main>
    </div>
  );
}
