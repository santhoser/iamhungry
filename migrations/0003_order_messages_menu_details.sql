ALTER TABLE menu ADD COLUMN calories TEXT NOT NULL DEFAULT '';
ALTER TABLE menu ADD COLUMN show_calories INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu ADD COLUMN ingredients TEXT NOT NULL DEFAULT '';
ALTER TABLE menu ADD COLUMN show_ingredients INTEGER NOT NULL DEFAULT 0;
CREATE TABLE order_messages(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),sender TEXT NOT NULL CHECK(sender IN ('customer','staff')),text TEXT NOT NULL,at TEXT NOT NULL);
CREATE INDEX messages_order ON order_messages(order_id,id);
