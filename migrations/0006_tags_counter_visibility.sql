ALTER TABLE groups ADD COLUMN customer_visible INTEGER NOT NULL DEFAULT 0;
CREATE TABLE tags(id INTEGER PRIMARY KEY,name TEXT NOT NULL,image TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX tags_name_unique ON tags(lower(name));
CREATE TABLE menu_tags(menu_item_id INTEGER NOT NULL REFERENCES menu(id),tag_id INTEGER NOT NULL REFERENCES tags(id),PRIMARY KEY(menu_item_id,tag_id));
CREATE INDEX menu_tags_tag ON menu_tags(tag_id,menu_item_id);
