export type Page = 'home' | 'login' | 'register' | 'detail';

/** Función para cambiar de página. `propertyId` solo se usa con 'detail'. */
export type Navigate = (page: Page, propertyId?: string) => void;

/** Card view-model shared by mock data and search results. */
export interface Property {
  id: string;
  /** Missing when the property has no photo yet. */
  image?: string | null;
  title: string;
  location: string;
  /** Search results do not carry ratings; the card hides them when absent. */
  rating?: number;
  reviewCount?: number;
  pricePerNight: number;
  /** ISO 4217; `$` is shown when absent (legacy mock data). */
  currency?: string;
  /** When set, the card also shows the total for this many nights. */
  nights?: number;
  tag?: string;
}

export interface Category {
  label: string;
  icon: string;
}

export type { User, Room, Booking, PendingBookingData } from "./types/index";
