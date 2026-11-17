-- Grand Horizon Hotel: MySQL schema
-- NOTE: no "USE <db>;" line on purpose. The MySQL Docker image runs this
-- script against the database named in MYSQL_DATABASE (from your .env),
-- so the database name is never hardcoded here.

SET NAMES utf8mb4;

-- ── GUESTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guests (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,         -- No duplicate accounts
  password_hash VARCHAR(255) NOT NULL,                -- NEVER plain text
  phone         VARCHAR(30),                          -- Optional
  role          ENUM('guest', 'staff', 'admin') NOT NULL DEFAULT 'guest',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── ROOM TYPES (category + pricing) ────────────────────
CREATE TABLE IF NOT EXISTS room_types (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  capacity    INT NOT NULL,
  base_price  DECIMAL(10, 2) NOT NULL,   -- price per night (RM)
  description TEXT,
  badge       VARCHAR(50),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── ROOMS (physical rooms that can be booked) ──────────
CREATE TABLE IF NOT EXISTS rooms (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  room_number  VARCHAR(10) NOT NULL UNIQUE,
  room_type_id INT NOT NULL,
  floor        INT NOT NULL,
  status       ENUM('available', 'maintenance') NOT NULL DEFAULT 'available',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rooms_room_type
    FOREIGN KEY (room_type_id) REFERENCES room_types(id)
    ON DELETE RESTRICT
);


-- ── BOOKINGS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  guest_id         INT NOT NULL,
  room_id          INT NOT NULL,
  check_in         DATE NOT NULL,
  check_out        DATE NOT NULL,
  num_guests       INT NOT NULL DEFAULT 1,
  total_amount     DECIMAL(10, 2) NOT NULL,          -- nights x room_types.base_price
  status           ENUM('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled')
                   DEFAULT 'pending',
  special_requests TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id)  REFERENCES rooms(id)  ON DELETE RESTRICT,
  CONSTRAINT chk_booking_dates CHECK (check_out > check_in),
  INDEX idx_guest_id  (guest_id),
  INDEX idx_status    (status),
  INDEX idx_room_dates (room_id, check_in, check_out)
);



-- ── SEED DATA (INSERT IGNORE = safe to re-run) ─────────
INSERT IGNORE INTO room_types (id, name, capacity, base_price, description, badge) VALUES
  (1, 'Standard Queen',  2, 180.00, 'Queen bed, air-conditioning and private bathroom',          NULL),
  (2, 'Deluxe King',     2, 260.00, 'King bed, city view, work desk and free Wi-Fi',             'Most Booked'),
  (3, 'Family Suite',    4, 420.00, 'Two bedrooms, living area and kitchenette',                 NULL),
  (4, 'Executive Suite', 2, 550.00, 'Top-floor suite with lounge access and bathtub',            'New');

INSERT IGNORE INTO rooms (id, room_number, room_type_id, floor, status) VALUES
  (1, '101', 1, 1, 'available'),
  (2, '102', 1, 1, 'available'),
  (3, '201', 2, 2, 'available'),
  (4, '202', 2, 2, 'available'),
  (5, '203', 2, 2, 'maintenance'),
  (6, '301', 3, 3, 'available'),
  (7, '302', 3, 3, 'available'),
  (8, '401', 4, 4, 'available');
