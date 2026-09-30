import { Button } from '../ui/Button';

export function HostCta() {
  return (
    <section className="mb-12 bg-gray-900 rounded-3xl p-10 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <img
              src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200&h=400&fit=crop&auto=format"
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-lg">
              <h2 className="text-2xl font-bold mb-2">¿Tienes un hotel, hostal o casa de huéspedes?</h2>
              <p className="text-white/70 text-sm mb-6">
                StayHub te da acceso a millones de viajeros de todo el mundo. Publica tu alojamiento y empieza a recibir reservas hoy mismo.
              </p>
              <div className="flex flex-wrap gap-8 mb-6">
                {[
                  { value: '+38%', label: 'Reservas garantizadas' },
                  { value: '0%', label: 'Comisión el primer mes' },
                  { value: '24/7', label: 'Soporte para anfitriones' },
                ].map((stat) => (
                  <div key={stat.value}>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-sm text-white/60">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button variant="primary" size="md">Publicar ahora →</Button>
                <Button variant="outline" size="md" className="!text-white !border-white/40 hover:!bg-white/10">
                  Saber más
                </Button>
              </div>
            </div>
          </div>
        </section>
  );
}
