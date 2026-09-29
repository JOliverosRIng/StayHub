import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { SearchBar } from '../components/home/SearchBar';
import { CategoryPills } from '../components/home/CategoryPills';
import { MapCta } from '../components/home/MapCta';
import { HostCta } from '../components/home/HostCta';
import { PropertySection } from '../components/property/PropertySection';
import { Button } from '../components/ui/Button';
import { CATEGORIES } from '../data/categories';
import { FEATURED, RECOMMENDED } from '../data/properties';
import type { Navigate } from '../types';

const FILTER_CHIPS = ['Precio', 'Tipo', 'Valoración'];

export function Home({ onNavigate }: { onNavigate: Navigate }) {
  const [activeCategory, setActiveCategory] = useState('Todo');
  const [searchLocation, setSearchLocation] = useState('');

  const openDetail = (id: string) => onNavigate('detail', id);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header
        onNavigate={onNavigate}
        navItems={['Experiencias', 'Destinos']}
        search={<SearchBar value={searchLocation} onChange={setSearchLocation} />}
        bottom={<CategoryPills categories={CATEGORIES} active={activeCategory} onChange={setActiveCategory} />}
      />

      <main className="flex-1 max-w-screen-xl mx-auto px-6 py-8 w-full">
        <PropertySection
          title="Recomendado para ti"
          properties={RECOMMENDED}
          onSelect={openDetail}
          actions={<button className="text-sm font-medium text-primary hover:underline">Ver todo →</button>}
        />

        <PropertySection
          title="Propiedades destacadas y hoteles mejor valorados"
          properties={FEATURED}
          onSelect={openDetail}
          columns="grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          actions={
            <div className="flex gap-2">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  className="text-sm font-medium text-gray-500 border border-gray-200 px-4 py-1.5 rounded-full hover:border-gray-400 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          }
          footer={<Button variant="outline" size="lg">Explorar más de 1,000 propiedades</Button>}
        />

        <MapCta />
        <HostCta />
      </main>

      <Footer />
    </div>
  );
}
