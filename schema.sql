-- one record per guest accross all channels,
-- we'll use a unique phone + email constraint to prevent duplication, but allow for multiple channels per guest
CREATE TABLE guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    email_normal TEXT GENERATED ALWAYS AS (lower(trim(email))) STORED
    phone_normal TEXT GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_guests_email on guests(email_normal) WHERE email_normal IS NOT NULL;
CREATE UNIQUE INDEX idx_guests_phone ON guests (phone_normal) WHERE phone_normal IS NOT NULL;


