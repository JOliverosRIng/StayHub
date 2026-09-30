export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

export interface Room {
  id: string;
  title: string;
  location: string;
  country: string;
  pricePerNight: number;
  cleaningFee: number;
  images: string[];
  description: string;
  maxGuests: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  rating: number;
  reviewCount: number;
  tag?: string;
  category: string;
}

export interface Booking {
  id: string;
  userId: string;
  roomId: string;
  roomTitle: string;
  roomImage: string;
  roomLocation: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  pricePerNight: number;
  accommodationFee: number;
  cleaningFee: number;
  serviceFee: number;
  totalPrice: number;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface PendingBookingData {
  roomId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  pricePerNight: number;
  accommodationFee: number;
  cleaningFee: number;
  serviceFee: number;
  totalPrice: number;
}
