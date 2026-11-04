-- Versioned v1 Feature catalog. Keep in sync with src/domain/features/feature-catalog.ts.
INSERT INTO "Feature" ("code", "name") VALUES
    ('WIFI', 'Wi-Fi'),
    ('PARKING', 'Parking'),
    ('POOL', 'Pool'),
    ('AIR_CONDITIONING', 'Air conditioning'),
    ('KITCHEN', 'Kitchen'),
    ('PETS_ALLOWED', 'Pets allowed'),
    ('BREAKFAST_INCLUDED', 'Breakfast included')
ON CONFLICT ("code") DO NOTHING;
