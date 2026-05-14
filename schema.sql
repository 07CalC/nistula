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

-- all the misc details will go in metadata field
CREATE TABLE properties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_code   TEXT NOT NULL UNIQUE,   -- like villa-b1
    display_name    TEXT NOT NULL,
    location        TEXT,
    max_guests      INT,
    base_rate       NUMERIC(10, 2),
    extra_guest_rate NUMERIC(10, 2),
    check_in_time   TIME,
    check_out_time  TIME,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_properties_property_code ON properties(property_code);
CREATE INDEX idx_properties_location ON properties(location);


CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    booking_reference TEXT NOT NULL,  -- like a unique code for the reservation
    channel TEXT NOT NULL,  -- like airbnb, booking.com, etc.
    external_id TEXT NOT NULL,  -- the reservation ID provided the channel
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    num_guests INT NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'pending', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel, external_id)
);

CREATE INDEX idx_reservations_guest_id ON reservations(guest_id);
CREATE INDEX idx_reservations_property_id ON reservations(property_id);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID NOT NULL REFERENCES guests(id),
    property_id UUID REFERENCES properties(id),
    reservation_id  UUID REFERENCES reservations(id),
    channel TEXT NOT NULL, -- channel (whatsapp, email, etc.)
    subject TEXT, -- optional human label
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'resolved', 'archived')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_conversations_guest_id ON conversations(guest_id);
CREATE INDEX idx_conversations_property_id ON conversations(property_id);


CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    -- from guest to host is inbound, from host to guest is outbound, system messages are either
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    -- source message ID from the channel like WhatsApp message ID
    channel_message_id  TEXT,
    -- the raw message content from the channel
    message_text TEXT NOT NULL,
    -- query classification applied to inbound messages
    query_type TEXT CHECK (query_type IN (
'pre_sales_availability',
'pre_sales_pricing',
'post_sales_checkin',
'special_request',
'complaint',
'general_enquiry'
)),
    -- AI confidence score (0-1)
    confidence_score NUMERIC(4, 3),
    -- authorship tracking
    authored_by TEXT NOT NULL DEFAULT 'ai' CHECK (authored_by IN ('ai', 'agent', 'guest')),
    -- outbound message states
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
'draft',        -- AI drafted, not yet sent
'agent_edited', -- agent modified before sending
'auto_sent',    -- sent automatically (confidence > threshold)
'agent_sent',   -- sent by agent after review
'failed'        -- sent failed
)),
    -- action determined by confidence scoring
    action TEXT CHECK (action IN (
'auto_send',
'agent_review',
'escalate'
)),

    -- final message sent to the guest after agent review (may differ from original message_text if edited by agent)
    sent_text           TEXT,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);



CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_channel_message_id ON messages(channel_message_id);
CREATE INDEX idx_messages_query_type ON messages(status);


CREATE TABLE escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT NOT NULL, -- like 'low_confidence', 'agent_request', etc.
    assigned_to TEXT, -- optional agent identifier
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE INDEX idx_escalations_message_id ON escalations(message_id);


CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('agent', 'manager', 'admin')),
    is_on_call BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- HARDEST DESIGN DECISION
-- single messages table or per channel tables.
--
-- the hardest decision was whether to use one messages table
-- for all channels or separate tables per channel.
--
-- per channel tables wins on: schema isolation (WhatsApp has
-- different metadata than Airbnb), query simplicity, and
-- reduced contention.
--
-- single table wins on: cross-channel analytics (e.g. "show
-- all messages for this guest"), unified threading, simpler
-- application code, and easier migrations.
--
-- i chose a single table because the unifying of the messages
-- messages from different channels are semantically the same thing, a guest communicating with a property. The channel specific metadata can live in a JSONB column or a separate channel_metadata table. 
-- This avoids JOIN hell when building the unified inbox and
-- makes the "all messages for guest X" query a single
-- index seek.

