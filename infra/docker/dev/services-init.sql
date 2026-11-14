-- Bases de desarrollo local de `npm run dev:backend`. Una base por servicio dentro de una sola
-- instancia PostgreSQL (PostGIS para Search); ningún servicio lee la base de otro.
-- Solo se ejecuta al crear el volumen por primera vez.
CREATE DATABASE accommodations_db;
CREATE DATABASE search_db;
CREATE DATABASE bookings_db;
CREATE DATABASE reviews_db;
CREATE DATABASE payments_db;
CREATE DATABASE notifications_db;
