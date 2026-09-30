export type Page = 'home' | 'login' | 'register' | 'detail';

/** Función para cambiar de página. `propertyId` solo se usa con 'detail'. */
export type Navigate = (page: Page, propertyId?: string) => void;

export interface Property {
  id: string;
  image: string;
  title: string;
  location: string;
  rating: number;
  reviewCount: number;
  pricePerNight: number;
  nights?: number;
  tag?: string;
}

export interface Category {
  label: string;
  icon: string;
}
