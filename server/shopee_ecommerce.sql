
-- =====================================================
-- SHOPEE-INSPIRED E-COMMERCE DATABASE
-- MySQL 8.0+
-- Complete Combined Database Schema
-- =====================================================

CREATE DATABASE IF NOT EXISTS shopee_ecommerce
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE shopee_ecommerce;

-- =====================================================
-- 1. USER MANAGEMENT
-- =====================================================

CREATE TABLE users (
    user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    profile_image VARCHAR(255),
    account_status ENUM('active','inactive','suspended') DEFAULT 'active',
    email_verified_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE roles (
    role_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE user_roles (
    user_role_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    UNIQUE KEY uq_user_role (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
) ENGINE=InnoDB;

INSERT INTO roles (role_name)
VALUES ('buyer'), ('seller'), ('admin');

-- =====================================================
-- 2. ADDRESS MANAGEMENT
-- =====================================================

CREATE TABLE addresses (
    address_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    recipient_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    region VARCHAR(100),
    province VARCHAR(100),
    city VARCHAR(100),
    barangay VARCHAR(100),
    street_address VARCHAR(255) NOT NULL,
    postal_code VARCHAR(10),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- =====================================================
-- 3. SELLER / SHOP MANAGEMENT
-- =====================================================

CREATE TABLE shops (
    shop_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    shop_name VARCHAR(150) NOT NULL,
    shop_description TEXT,
    shop_logo VARCHAR(255),
    shop_status ENUM('active','inactive','suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_shop_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- =====================================================
-- 4. CATEGORY MANAGEMENT
-- =====================================================

CREATE TABLE categories (
    category_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parent_id INT UNSIGNED NULL,
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    FOREIGN KEY (parent_id)
        REFERENCES categories(category_id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================
-- 5. PRODUCT MANAGEMENT
-- =====================================================

CREATE TABLE products (
    product_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    shop_id BIGINT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    description TEXT,
    brand VARCHAR(100),
    product_status ENUM('active','inactive','archived') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_name (product_name),
    INDEX idx_product_shop (shop_id),
    INDEX idx_product_category (category_id),
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
) ENGINE=InnoDB;

CREATE TABLE product_variants (
    variant_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    variant_name VARCHAR(100),
    price DECIMAL(12,2) NOT NULL,
    stock_quantity INT UNSIGNED DEFAULT 0,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (price >= 0),
    FOREIGN KEY (product_id)
        REFERENCES products(product_id)
) ENGINE=InnoDB;

CREATE TABLE product_images (
    image_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (product_id)
        REFERENCES products(product_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 6. SHOPPING CART
-- =====================================================

CREATE TABLE carts (
    cart_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cart_user (user_id),
    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cart_items (
    cart_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cart_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cart_variant (cart_id, variant_id),
    CHECK (quantity > 0),
    FOREIGN KEY (cart_id)
        REFERENCES carts(cart_id)
        ON DELETE CASCADE,
    FOREIGN KEY (variant_id)
        REFERENCES product_variants(variant_id)
) ENGINE=InnoDB;

-- =====================================================
-- 7. WISHLIST
-- =====================================================

CREATE TABLE wishlists (
    wishlist_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wishlist_user (user_id),
    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE wishlist_items (
    wishlist_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    wishlist_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY uq_wishlist_product (wishlist_id, product_id),
    FOREIGN KEY (wishlist_id)
        REFERENCES wishlists(wishlist_id)
        ON DELETE CASCADE,
    FOREIGN KEY (product_id)
        REFERENCES products(product_id)
) ENGINE=InnoDB;

-- =====================================================
-- 8. VOUCHERS AND PROMOTIONS
-- =====================================================

CREATE TABLE vouchers (
    voucher_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    voucher_code VARCHAR(50) NOT NULL UNIQUE,
    discount_type ENUM('fixed','percentage','free_shipping') NOT NULL,
    discount_value DECIMAL(12,2) DEFAULT 0,
    minimum_purchase DECIMAL(12,2) DEFAULT 0,
    maximum_discount DECIMAL(12,2) NULL,
    usage_limit INT UNSIGNED NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    voucher_status ENUM('active','inactive','expired') DEFAULT 'active',
    CHECK (discount_value >= 0),
    CHECK (minimum_purchase >= 0),
    CHECK (maximum_discount IS NULL OR maximum_discount >= 0),
    CHECK (end_date > start_date)
) ENGINE=InnoDB;

-- =====================================================
-- 9. ORDER MANAGEMENT
-- =====================================================

CREATE TABLE orders (
    order_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    address_id BIGINT UNSIGNED NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    recipient_name VARCHAR(150) NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    shipping_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    order_status ENUM(
        'pending','confirmed','processing','shipped',
        'delivered','completed','cancelled','refunded'
    ) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_user (user_id),
    INDEX idx_order_status (order_status),
    CHECK (subtotal >= 0),
    CHECK (shipping_fee >= 0),
    CHECK (discount_amount >= 0),
    CHECK (total_amount >= 0),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (address_id)
        REFERENCES addresses(address_id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- One main order can contain multiple seller orders.

CREATE TABLE seller_orders (
    seller_order_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    shop_id BIGINT UNSIGNED NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    shipping_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    seller_order_status ENUM(
        'pending','confirmed','processing','shipped',
        'delivered','completed','cancelled','refunded'
    ) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_order_shop (order_id, shop_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
    order_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seller_order_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NULL,
    product_name VARCHAR(200) NOT NULL,
    variant_name VARCHAR(100),
    sku VARCHAR(100),
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (subtotal >= 0),
    FOREIGN KEY (seller_order_id)
        REFERENCES seller_orders(seller_order_id),
    FOREIGN KEY (variant_id)
        REFERENCES product_variants(variant_id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================
-- 10. VOUCHER USAGE
-- =====================================================

CREATE TABLE voucher_usages (
    usage_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    voucher_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_voucher_order (voucher_id, order_id),
    FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB;

-- =====================================================
-- 11. PAYMENT MANAGEMENT
-- =====================================================

CREATE TABLE payments (
    payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    payment_method ENUM(
        'cash_on_delivery','gcash','maya','bank_transfer',
        'credit_card','debit_card'
    ) NOT NULL,
    transaction_reference VARCHAR(150),
    amount DECIMAL(12,2) NOT NULL,
    payment_status ENUM(
        'pending','processing','paid','failed','refunded'
    ) DEFAULT 'pending',
    paid_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payment_order (order_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB;

-- =====================================================
-- 12. SHIPPING AND DELIVERY
-- =====================================================

CREATE TABLE shipments (
    shipment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seller_order_id BIGINT UNSIGNED NOT NULL,
    courier_name VARCHAR(100),
    tracking_number VARCHAR(100) UNIQUE,
    shipping_status ENUM(
        'preparing','picked_up','in_transit',
        'out_for_delivery','delivered','failed','returned'
    ) DEFAULT 'preparing',
    shipped_at DATETIME NULL,
    delivered_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_order_id)
        REFERENCES seller_orders(seller_order_id)
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(30) NOT NULL,
    remarks TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)
        REFERENCES orders(order_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 13. INVENTORY MANAGEMENT
-- =====================================================

CREATE TABLE inventory_logs (
    inventory_log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    variant_id BIGINT UNSIGNED NOT NULL,
    change_type ENUM(
        'stock_in','stock_out','sale','return','adjustment'
    ) NOT NULL,
    quantity INT NOT NULL,
    previous_stock INT UNSIGNED NOT NULL,
    new_stock INT UNSIGNED NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (variant_id)
        REFERENCES product_variants(variant_id)
) ENGINE=InnoDB;

-- =====================================================
-- 14. PRODUCT REVIEWS AND RATINGS
-- =====================================================

CREATE TABLE reviews (
    review_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    order_item_id BIGINT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_order_item (user_id, order_item_id),
    CHECK (rating BETWEEN 1 AND 5),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id)
) ENGINE=InnoDB;

-- =====================================================
-- 15. NOTIFICATIONS
-- =====================================================

CREATE TABLE notifications (
    notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_user (user_id, is_read),
    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 16. BUYER AND SELLER CHAT
-- =====================================================

CREATE TABLE conversations (
    conversation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    buyer_id BIGINT UNSIGNED NOT NULL,
    shop_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_buyer_shop (buyer_id, shop_id),
    FOREIGN KEY (buyer_id) REFERENCES users(user_id),
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
) ENGINE=InnoDB;

CREATE TABLE chat_messages (
    message_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chat_conversation (conversation_id, sent_at),
    FOREIGN KEY (conversation_id)
        REFERENCES conversations(conversation_id)
        ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- =====================================================
-- 17. PRODUCT QUESTIONS
-- =====================================================

CREATE TABLE product_questions (
    question_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    answered_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- =====================================================
-- 18. SHOP FOLLOWERS
-- =====================================================

CREATE TABLE shop_followers (
    follower_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    shop_id BIGINT UNSIGNED NOT NULL,
    followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_shop_follow (user_id, shop_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
) ENGINE=InnoDB;

-- =====================================================
-- 19. RETURNS AND REFUNDS
-- =====================================================

CREATE TABLE returns_refunds (
    return_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_item_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    reason TEXT NOT NULL,
    refund_amount DECIMAL(12,2) NOT NULL,
    return_status ENUM(
        'requested','approved','rejected','in_transit',
        'received','refunded','cancelled'
    ) DEFAULT 'requested',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    FOREIGN KEY (order_item_id)
        REFERENCES order_items(order_item_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- =====================================================
-- END OF DATABASE SCHEMA
-- =====================================================

-- Check all created tables:
SHOW TABLES;
