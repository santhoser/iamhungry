ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'DineIn' CHECK(order_type IN ('DineIn','TakeAway'));
ALTER TABLE orders ADD COLUMN payment_mode TEXT CHECK(payment_mode IN ('Cash','UPI'));
ALTER TABLE payments ADD COLUMN mode TEXT CHECK(mode IN ('Cash','UPI'));
CREATE INDEX orders_payment_mode_date ON orders(payment_mode,created_at DESC);
