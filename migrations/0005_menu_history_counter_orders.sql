ALTER TABLE groups ADD COLUMN counter_only INTEGER NOT NULL DEFAULT 0;
CREATE TABLE menu_history(id INTEGER PRIMARY KEY,menu_item_id INTEGER NOT NULL REFERENCES menu(id),item_code TEXT NOT NULL,item_name TEXT NOT NULL,changed_at TEXT NOT NULL,actor TEXT NOT NULL,change_type TEXT NOT NULL,system_comments TEXT NOT NULL,user_comments TEXT NOT NULL DEFAULT '',is_price_change INTEGER NOT NULL DEFAULT 0,old_price INTEGER,new_price INTEGER,old_ran_out INTEGER,new_ran_out INTEGER,old_today_special INTEGER,new_today_special INTEGER,old_dashboard_fav INTEGER,new_dashboard_fav INTEGER,old_active INTEGER,new_active INTEGER,before_json TEXT,after_json TEXT);
CREATE INDEX menu_history_date ON menu_history(changed_at DESC,id DESC);
CREATE INDEX menu_history_item ON menu_history(menu_item_id,changed_at DESC);
CREATE TABLE order_custom_items(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),quantity INTEGER NOT NULL CHECK(quantity>0),actor TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX order_custom_items_order ON order_custom_items(order_id,id);
