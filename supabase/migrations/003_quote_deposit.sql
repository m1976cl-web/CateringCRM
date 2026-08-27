-- Anticipo (CLP) en cotizaciones
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount double precision NOT NULL DEFAULT 0;
