import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const schemaPath = fileURLToPath(new URL("./mysql-schema.sql", import.meta.url));
const transactionConnection = new AsyncLocalStorage();
const tableNames = [
  "users", "stores", "products", "orders", "order_items", "favorites", "reviews",
  "notifications", "order_store_status", "support_tickets", "auth_otps",
  "rider_locations", "platform_settings", "coupons",
];
const tablePattern = new RegExp(
  `\\b(FROM|JOIN|UPDATE|INTO)\\s+(\`?)(${tableNames.join("|")})(\`?)(?=\\b)`,
  "gi",
);

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "shopee_ecommerce",
  waitForConnections: true,
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: false,
  dateStrings: true,
});

function adaptSql(statement) {
  let sql = statement
    .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, "INSERT IGNORE")
    .replace(
      /\bON\s+CONFLICT\s*\(\s*user_id\s*,\s*product_id\s*\)\s+DO\s+UPDATE\s+SET\s+rating\s*=\s*excluded\.rating\s*,\s*comment\s*=\s*excluded\.comment/gi,
      "ON DUPLICATE KEY UPDATE rating=VALUES(rating),comment=VALUES(comment)",
    );
  if (/\bplatform_settings\b/i.test(sql)) {
    sql = sql
      .replace(/\bSELECT\s+key\s*,\s*value\b/gi, "SELECT `key`,`value`")
      .replace(/\bplatform_settings\s*\(\s*key\s*,\s*value\s*\)/gi, "platform_settings (`key`,`value`)")
      .replace(/\bWHERE\s+key\s*=/gi, "WHERE `key`=")
      .replace(/\bSELECT\s+value\s+FROM/gi, "SELECT `value` FROM")
      .replace(
        /\bON\s+CONFLICT\s*\(\s*key\s*\)\s+DO\s+UPDATE\s+SET\s+value\s*=\s*excluded\.value/gi,
        "ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)",
      );
  }
  return sql.replace(tablePattern, (_match, operation, _open, table) => `${operation} \`app_${table}\``);
}

function execute(statement, params) {
  const connection = transactionConnection.getStore();
  const query = adaptSql(statement);
  return (connection || pool).execute(query, params);
}

function prepare(statement) {
  return {
    async get(...params) {
      const [rows] = await execute(statement, params);
      return rows[0];
    },
    async all(...params) {
      const [rows] = await execute(statement, params);
      return rows;
    },
    async run(...params) {
      const [result] = await execute(statement, params);
      return { changes: result.affectedRows, lastInsertRowid: result.insertId };
    },
  };
}

function transaction(callback) {
  return async (...args) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await transactionConnection.run(connection, () => callback(...args));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  };
}

const db = { prepare, transaction };

export async function initialize() {
  const schema = await readFile(schemaPath, "utf8");
  for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}

export async function seedData() {
  const userCount = await db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (!Number(userCount.count)) {
    const passwordHash = bcrypt.hashSync("password123", 10);
    const insertUser = db.prepare(
      "INSERT INTO users (name,email,phone,password_hash,role,verified) VALUES (?,?,?,?,?,?)",
    );
    for (const [name, email, role, verified] of [
      ["Demo Customer", "customer@shopease.local", "customer", 1],
      ["Demo Rider", "rider@shopease.local", "rider", 1],
      ["Demo Admin", "admin@shopease.local", "admin", 1],
      ["Demo Merchant", "merchant@shopease.local", "merchant", 0],
    ]) {
      await insertUser.run(name, email, "", passwordHash, role, verified);
    }
  }

  const merchant = await db.prepare("SELECT id FROM users WHERE email=?").get("merchant@shopease.local");
  if (merchant) {
    await db.prepare("INSERT IGNORE INTO stores (owner_id,name,description) VALUES (?,?,?)")
      .run(merchant.id, "Cebu Local Store", "Demo store account for the merchant dashboard.");
  }

  for (const [key, value] of [
    ["shopping_delivery_fee", "59"],
    ["service_delivery_fee", "69"],
    ["merchant_commission_percent", "10"],
  ]) {
    await db.prepare("INSERT IGNORE INTO platform_settings(key,value) VALUES (?,?)").run(key, value);
  }

  const productCount = await db.prepare("SELECT COUNT(*) AS count FROM products").get();
  if (Number(productCount.count)) return;
  const products = [
    ["Cebu Lechon Meal","Food","Local favorite, serving for one",180,0],
    ["Fresh Mangoes","Groceries","Sweet Cebu mangoes, 1 kg",140,0],
    ["Mineral Water","Essentials","1 gallon purified drinking water",45,0],
    ["Laundry Detergent","Essentials","Family-size detergent pack",125,0],
    ["Chicken BBQ Meal","Food","Grilled chicken with rice",115,0],
    ["Fresh Vegetables","Groceries","Assorted market vegetables",95,0],
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
    ["Coloring Book Set","Books","Kids' coloring book with crayons",155,0],
  ];
  const insertProduct = db.prepare(
    "INSERT INTO products (name,category,description,price,image,stock,featured) VALUES (?,?,?,?,?,30,?)",
  );
  for (const [name, category, description, price, featured] of products) {
    await insertProduct.run(name, category, description, price, "", featured);
  }
}

export default db;
