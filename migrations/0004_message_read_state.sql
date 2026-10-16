ALTER TABLE order_messages ADD COLUMN read_at TEXT;
UPDATE order_messages SET read_at=at;
