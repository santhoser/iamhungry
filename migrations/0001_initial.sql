    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','cashier')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tables(id INTEGER PRIMARY KEY,number INTEGER UNIQUE NOT NULL,token TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
    CREATE TABLE IF NOT EXISTS groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,sort INTEGER NOT NULL DEFAULT 0,deleted_at TEXT);
    CREATE TABLE IF NOT EXISTS menu(id INTEGER PRIMARY KEY,group_id INTEGER NOT NULL REFERENCES groups(id),code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),details TEXT NOT NULL DEFAULT '',images TEXT NOT NULL DEFAULT '[]',video TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,ran_out INTEGER NOT NULL DEFAULT 0,today_special INTEGER NOT NULL DEFAULT 0,dashboard_fav INTEGER NOT NULL DEFAULT 0,deleted_at TEXT);
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,number TEXT UNIQUE NOT NULL,token TEXT UNIQUE NOT NULL,request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,table_id INTEGER NOT NULL REFERENCES tables(id),name TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'New',created_at TEXT NOT NULL,closed_at TEXT,version INTEGER NOT NULL DEFAULT 1,amounts TEXT NOT NULL,restaurant TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),item_id INTEGER NOT NULL REFERENCES menu(id),code TEXT NOT NULL,name TEXT NOT NULL,price INTEGER NOT NULL,quantity INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),previous TEXT,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',actor TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),kind TEXT NOT NULL CHECK(kind IN ('payment','refund')),amount INTEGER NOT NULL CHECK(amount>0),actor TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS events_order ON events(order_id);
    CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS items_order ON order_items(order_id);

CREATE INDEX IF NOT EXISTS menu_group ON menu(group_id);
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE transaction_guard(ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE uploads(name TEXT PRIMARY KEY,content_type TEXT NOT NULL,size INTEGER NOT NULL);
CREATE TABLE upload_chunks(name TEXT NOT NULL REFERENCES uploads(name),position INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(name,position));
CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
INSERT INTO settings(key,value) VALUES('restaurant','{"name":"Cafe77","tagline":"From the house of Cake Dew","address":"","phone":"","gstin":"","gstRate":10,"gstInclusive":true,"currency":"INR","timezone":"Asia/Kolkata","logo":"/cafe77-logo.jpg","qrBaseUrl":"https://cafe77-staging.santhoser.workers.dev/","menuCodeSearch":true,"upiEnabled":false,"receiptFooter":"Thank you for visiting Cafe77. See you again soon!"}');

WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<15) INSERT INTO tables(number,token) SELECT n,lower(hex(randomblob(12))) FROM numbers;
