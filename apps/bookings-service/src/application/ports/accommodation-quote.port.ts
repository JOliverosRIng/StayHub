export interface AccommodationQuote { propertyId:string; roomId:string; ownerId:string; propertyName:string; roomName:string; propertyStatus:'PUBLISHED'; capacity:number; basePrice:{amount:string;currency:string}; propertyVersion:number; roomUpdatedAt:string; }
export interface AccommodationQuotePort { getQuote(propertyId:string,roomId:string,guests:number,traceId?:string):Promise<AccommodationQuote>; }
export const ACCOMMODATION_QUOTE_PORT=Symbol('ACCOMMODATION_QUOTE_PORT');
