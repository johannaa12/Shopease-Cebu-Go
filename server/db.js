import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const db = new Database("shopease.sqlite");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  image TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  pickup TEXT NOT NULL,
  destination TEXT NOT NULL,
  notes TEXT DEFAULT '',
  payment_method TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 59,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  rider_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(rider_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);
`);

const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (!userCount) {
  const insertUser = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)");
  const hash = bcrypt.hashSync("password123", 10);
  insertUser.run("Demo Customer", "customer@shopease.local", hash, "customer");
  insertUser.run("Demo Rider", "rider@shopease.local", hash, "rider");
  insertUser.run("Demo Admin", "admin@shopease.local", hash, "admin");
}
const productCount = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (!productCount) {
  const add = db.prepare("INSERT INTO products (name,category,description,price,image) VALUES (?,?,?,?,?)");
  [
    ["Cebu Lechon Meal","Food","Local favorite, serving for one",180,""],
    ["Fresh Mangoes","Groceries","Sweet Cebu mangoes, 1 kg",140,""],
    ["Mineral Water","Essentials","1 gallon purified drinking water",45,""],
    ["Laundry Detergent","Essentials","Family-size detergent pack",125,""],
    ["Chicken BBQ Meal","Food","Grilled chicken with rice",115,""],
    ["Fresh Vegetables","Groceries","Assorted market vegetables",95,""]
  ].forEach(p => add.run(...p));
}
// Additive migrations keep existing local databases usable as the MVP grows.
function addColumn(table, column, sql) {
  const names = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!names.includes(column)) db.exec(sql);
}
addColumn("users", "phone", "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''");
addColumn("users", "address", "ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''");
addColumn("users", "verified", "ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 1");
addColumn("users", "online", "ALTER TABLE users ADD COLUMN online INTEGER NOT NULL DEFAULT 0");
addColumn("users", "suspended", "ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0");
addColumn("products", "stock", "ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 100");
addColumn("products", "featured", "ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0");
addColumn("products", "store_id", "ALTER TABLE products ADD COLUMN store_id INTEGER");
const catalogProducts = [
  ["Cebu Chorizo Pack","Food","Sweet Cebu-style chorizo, 500 g",220,1],
  ["Puso (Hanging Rice)","Food","Freshly cooked local rice wraps, pack of 5",50,1],
  ["Danggit Breakfast Set","Food","Crispy danggit with garlic rice",165,0],
  ["Otap Pasalubong Box","Food","Buttery Cebu otap biscuits, 12 pieces",135,1],
  ["Tablea Hot Chocolate","Food","Local cacao tablea, pack of 10",180,0],
  ["Cebu Mango Float","Food","Chilled mango dessert, good for sharing",280,1],
  ["Calamansi Juice","Food","Freshly squeezed, 1 liter",95,0],
  ["Banana Chips","Food","Crispy sweet banana chips, 200 g",85,0],
  ["Fresh Avocados","Groceries","Ripe local avocados, 1 kg",160,1],
  ["Eggs (Tray of 12)","Groceries","Farm-fresh medium eggs",115,0],
  ["Rice (Sinandomeng)","Groceries","Well-milled rice, 2 kg",130,1],
  ["Coconut Water","Groceries","Fresh buko juice, 1 liter",75,0],
  ["Pandesal (Dozen)","Groceries","Soft, freshly baked morning rolls",60,0],
  ["Dishwashing Liquid","Essentials","Lemon-scented refill pouch, 800 ml",89,0],
  ["Bath Soap Bundle","Essentials","Gentle everyday soap, set of 3",105,0],
  ["Reusable Water Bottle","Home","Insulated stainless bottle, 500 ml",249,1],
  ["Cebu Sinamay Tote Bag","Fashion","Handwoven local-style everyday tote",320,1],
  ["Canvas Market Bag","Fashion","Reusable canvas shopper with long handles",145,0],
  ["Cotton T-Shirt","Fashion","Soft unisex crew-neck shirt",299,0],
  ["Kids' Raincoat","Fashion","Lightweight hooded raincoat for rainy days",220,0],
  ["Aloe Vera Hand Cream","Beauty","Moisturizing hand cream, 60 g",125,0],
  ["Everyday Sunscreen","Beauty","Lightweight SPF 50 sunscreen, 50 ml",285,1],
  ["Hair Claw Clip Set","Beauty","Neutral-color styling clips, set of 4",99,0],
  ["USB-C Charging Cable","Electronics","Braided 1 m charging cable",149,1],
  ["Phone Stand","Electronics","Adjustable folding desk phone holder",119,0],
  ["Wireless Earbuds Case","Electronics","Protective silicone case with clip",89,0],
  ["Yoga Mat","Sports","Non-slip exercise mat, 6 mm",499,1],
  ["Jump Rope","Sports","Adjustable lightweight fitness rope",129,0],
  ["Pet Treats","Pets","Crunchy chicken bites for dogs, 100 g",110,0],
  ["Cat Toy Bundle","Pets","Playful assorted cat toys, set of 5",95,0],
  ["Baby Gentle Wipes","Baby","Unscented soft wipes, pack of 80",99,0],
  ["Coloring Book Set","Books","Kids' coloring book with crayons",155,0]
];
const addCatalogProduct = db.prepare(`
  INSERT INTO products (name,category,description,price,stock,featured)
  SELECT ?,?,?,?,30,?
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE name=? AND store_id IS NULL)
`);
for (const [name, category, description, price, featured] of catalogProducts) {
  addCatalogProduct.run(name, category, description, price, featured, name);
}
addColumn("orders", "scheduled_at", "ALTER TABLE orders ADD COLUMN scheduled_at TEXT DEFAULT ''");
addColumn("orders", "delivery_pin", "ALTER TABLE orders ADD COLUMN delivery_pin TEXT DEFAULT ''");
addColumn("orders", "payment_status", "ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'Pending'");
addColumn("orders", "payment_reference", "ALTER TABLE orders ADD COLUMN payment_reference TEXT DEFAULT ''");
addColumn("orders", "coupon_code", "ALTER TABLE orders ADD COLUMN coupon_code TEXT DEFAULT ''");
addColumn("orders", "discount_amount", "ALTER TABLE orders ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0");
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    approved INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    PRIMARY KEY(user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS order_store_status (
    order_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    PRIMARY KEY(order_id, store_id),
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(store_id) REFERENCES stores(id)
  );
  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    admin_reply TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS auth_otps (
    id TEXT PRIMARY KEY,
    contact TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('login','signup','reset')),
    code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at INTEGER,
    used_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS auth_otps_contact_created ON auth_otps(contact,purpose,created_at);
  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    discount_percent INTEGER NOT NULL CHECK(discount_percent BETWEEN 1 AND 100),
    active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT NOT NULL DEFAULT '',
    max_uses INTEGER NOT NULL DEFAULT 0,
    uses_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.prepare("INSERT OR IGNORE INTO platform_settings (key,value) VALUES (?,?)").run("shopping_delivery_fee", "59");
db.prepare("INSERT OR IGNORE INTO platform_settings (key,value) VALUES (?,?)").run("service_delivery_fee", "69");
db.prepare("INSERT OR IGNORE INTO platform_settings (key,value) VALUES (?,?)").run("merchant_commission_percent", "10");
const demoMerchant = db.prepare("SELECT id FROM users WHERE email=?").get("merchant@shopease.local");
let demoMerchantId = demoMerchant?.id;
if (!demoMerchantId) {
  const result = db.prepare("INSERT INTO users (name,email,password_hash,role,verified) VALUES (?,?,?,?,0)")
    .run("Demo Merchant", "merchant@shopease.local", bcrypt.hashSync("password123", 10), "merchant");
  demoMerchantId = result.lastInsertRowid;
}
db.prepare("INSERT OR IGNORE INTO stores (owner_id,name,description) VALUES (?,?,?)")
  .run(demoMerchantId, "Cebu Local Store", "Demo store account for the merchant dashboard.");
db.exec(`
  INSERT OR IGNORE INTO order_store_status (order_id, store_id, status)
  SELECT DISTINCT o.id, p.store_id,
    CASE WHEN o.status IN ('Ready for Pickup','Accepted','Picked Up','On the Way','Delivered') THEN 'Ready for Pickup'
         WHEN o.status='Rejected' THEN 'Rejected'
         ELSE 'Pending' END
  FROM orders o
  JOIN order_items i ON i.order_id=o.id
  JOIN products p ON p.id=i.product_id
  WHERE p.store_id IS NOT NULL
`);

export default db;
