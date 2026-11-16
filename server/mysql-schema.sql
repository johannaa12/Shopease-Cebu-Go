CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  address VARCHAR(300) NOT NULL DEFAULT '',
  verified TINYINT(1) NOT NULL DEFAULT 1,
  online TINYINT(1) NOT NULL DEFAULT 0,
  suspended TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY app_users_email (email),
  KEY app_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_stores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY app_stores_owner (owner_id),
  CONSTRAINT app_stores_owner_fk FOREIGN KEY (owner_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  price DECIMAL(12,2) NOT NULL,
  image VARCHAR(500) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  stock INT NOT NULL DEFAULT 100,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  store_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY app_products_store (store_id),
  KEY app_products_catalog (active, stock, featured),
  CONSTRAINT app_products_store_fk FOREIGN KEY (store_id) REFERENCES app_stores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(30) NOT NULL,
  pickup VARCHAR(500) NOT NULL,
  destination VARCHAR(500) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  payment_method VARCHAR(80) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 59,
  total DECIMAL(12,2) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  rider_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scheduled_at VARCHAR(40) NOT NULL DEFAULT '',
  delivery_pin VARCHAR(10) NOT NULL DEFAULT '',
  payment_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  payment_reference VARCHAR(100) NOT NULL DEFAULT '',
  coupon_code VARCHAR(30) NOT NULL DEFAULT '',
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY app_orders_user (user_id, id),
  KEY app_orders_rider (rider_id, status),
  CONSTRAINT app_orders_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT app_orders_rider_fk FOREIGN KEY (rider_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY app_order_items_order (order_id),
  CONSTRAINT app_order_items_order_fk FOREIGN KEY (order_id) REFERENCES app_orders(id),
  CONSTRAINT app_order_items_product_fk FOREIGN KEY (product_id) REFERENCES app_products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_favorites (
  user_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT app_favorites_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT app_favorites_product_fk FOREIGN KEY (product_id) REFERENCES app_products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY app_reviews_user_product (user_id, product_id),
  KEY app_reviews_product (product_id),
  CONSTRAINT app_reviews_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT app_reviews_product_fk FOREIGN KEY (product_id) REFERENCES app_products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  message VARCHAR(1000) NOT NULL,
  `read` TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY app_notifications_user (user_id, id),
  CONSTRAINT app_notifications_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_order_store_status (
  order_id BIGINT UNSIGNED NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  PRIMARY KEY (order_id, store_id),
  CONSTRAINT app_order_store_status_order_fk FOREIGN KEY (order_id) REFERENCES app_orders(id),
  CONSTRAINT app_order_store_status_store_fk FOREIGN KEY (store_id) REFERENCES app_stores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_support_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(120) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'General',
  message VARCHAR(2000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Open',
  admin_reply VARCHAR(2000) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY app_support_tickets_updated (updated_at),
  CONSTRAINT app_support_tickets_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_auth_otps (
  id CHAR(36) NOT NULL,
  contact VARCHAR(254) NOT NULL,
  purpose VARCHAR(10) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  verified_at BIGINT NULL,
  used_at BIGINT NULL,
  PRIMARY KEY (id),
  KEY app_auth_otps_contact_created (contact, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_rider_locations (
  order_id BIGINT UNSIGNED NOT NULL,
  rider_id BIGINT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  accuracy_m DECIMAL(8,2) NULL,
  sharing TINYINT(1) NOT NULL DEFAULT 1,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (order_id),
  KEY app_rider_locations_expiry (updated_at, started_at),
  CONSTRAINT app_rider_locations_order_fk FOREIGN KEY (order_id) REFERENCES app_orders(id),
  CONSTRAINT app_rider_locations_rider_fk FOREIGN KEY (rider_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_platform_settings (
  `key` VARCHAR(100) NOT NULL,
  `value` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  discount_percent INT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  expires_at VARCHAR(40) NOT NULL DEFAULT '',
  max_uses INT NOT NULL DEFAULT 0,
  uses_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY app_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
