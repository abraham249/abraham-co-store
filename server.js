require("dotenv").config();

const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured.");
}

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be configured.");
}

const JWT_SECRET = process.env.JWT_SECRET;
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

const db = new Database(path.join(__dirname, "store.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function now() {
  return new Date().toISOString();
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    created_at: user.created_at
  };
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  try {
    const token = header.substring(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Your session has expired. Please log in again."
    });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required."
    });
  }

  next();
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";

  if (header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.substring(7), JWT_SECRET);
    } catch {}
  }

  next();
}

function error(res, message = "Something went wrong.", status = 400) {
  return res.status(status).json({
    success: false,
    message
  });
}

/* =========================================================
   DATABASE
========================================================= */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category_id INTEGER,
  description TEXT DEFAULT '',
  features TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  video TEXT DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  user_id INTEGER,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  delivery_option TEXT DEFAULT 'standard',
  delivery_fee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'moniepoint',
  payment_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  total REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  review TEXT NOT NULL,
  photo TEXT DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quote_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  product TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  location TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'new',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  minimum_order REAL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT DEFAULT '',
  fee REAL NOT NULL DEFAULT 0,
  estimated_time TEXT DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

/* =========================================================
   INITIAL DATA
========================================================= */

const initialCategories = [
  ["Packaging Products", "packaging-products"],
  ["Gate Automation", "gate-automation"],
  ["Accessories", "accessories"]
];

for (const [name, slug] of initialCategories) {
  run(
    `INSERT OR IGNORE INTO categories
     (name, slug, visible, created_at)
     VALUES (?, ?, 1, ?)`,
    [name, slug, now()]
  );
}

const adminEmail = process.env.ADMIN_EMAIL.toLowerCase().trim();
const existingAdmin = get(
  `SELECT id FROM users WHERE email = ?`,
  [adminEmail]
);

if (!existingAdmin) {
  const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);

  run(
    `INSERT INTO users
     (name, email, phone, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'admin', ?)`,
    [
      "Ayeni Abraham",
      adminEmail,
      "09074828638",
      passwordHash,
      now()
    ]
  );
}

const defaultSettings = {
  business_name: "Abraham Co Store",
  tagline: "Quality Products. Reliable Solutions.",
  founder: "Ayeni Abraham",
  phone: "09074828638",
  whatsapp: "2349074828638",
  whatsapp_url: "https://wa.me/2349074828638",
  facebook:
    "https://www.facebook.com/profile.php?id=61591989816314",
  tiktok: "https://www.tiktok.com/@abrahamcostore",
  instagram: "https://www.instagram.com/abrahamcostore",
  bank: "Moniepoint",
  account_name: "Ayeni Abraham Ola",
  account_number: "9074828638",
  hero_title: "Quality Products. Reliable Solutions.",
  hero_description:
    "Discover quality products and smart solutions from Abraham Co Store.",
  announcement: "Quality Products. Reliable Solutions.",
  delivery_note: "Delivery options are available during checkout."
};

for (const [key, value] of Object.entries(defaultSettings)) {
  run(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    [key, value]
  );
}

const productCount = get(`SELECT COUNT(*) AS count FROM products`).count;

if (productCount === 0) {
  const packaging = get(
    `SELECT id FROM categories WHERE slug = 'packaging-products'`
  );

  const automation = get(
    `SELECT id FROM categories WHERE slug = 'gate-automation'`
  );

  run(
    `INSERT INTO products
     (name, slug, category_id, description, features, price, stock,
      image, images, available, featured, visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "Transparent PET Can/Bottle",
      "transparent-pet-can-bottle",
      packaging.id,
      "Quality transparent PET can/bottle suitable for packaging needs.",
      "Clear transparent design\nDurable PET material\nEasy to use\nSuitable for different packaging needs",
      0,
      0,
      "/assets/transparent-can.jpg",
      JSON.stringify(["/assets/transparent-can.jpg"]),
      1,
      1,
      1,
      now(),
      now()
    ]
  );

  run(
    `INSERT INTO products
     (name, slug, category_id, description, features, price, stock,
      image, images, available, featured, visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "Centurion D6 Smart Automatic Gate Machine",
      "centurion-d6-smart-automatic-gate-machine",
      automation.id,
      "Smart automatic gate machine designed for reliable gate automation.",
      "Smart automation\nReliable operation\nProfessional gate solution\nSuitable for automatic gates",
      0,
      0,
      "/assets/d6-machine.jpg",
      JSON.stringify(["/assets/d6-machine.jpg"]),
      1,
      1,
      1,
      now(),
      now()
    ]
  );
}

/* =========================================================
   PUBLIC SETTINGS
========================================================= */

app.get("/api/settings", (req, res) => {
  const rows = all(`SELECT key, value FROM settings`);
  const settings = {};

  rows.forEach(row => {
    settings[row.key] = row.value;
  });

  res.json({
    success: true,
    settings
  });
});

/* =========================================================
   AUTHENTICATION
========================================================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone = "", password } = req.body;

    if (!name || !email || !password) {
      return error(res, "Name, email and password are required.");
    }

    if (password.length < 6) {
      return error(res, "Password must be at least 6 characters.");
    }

    const normalizedEmail = email.toLowerCase().trim();

    const exists = get(
      `SELECT id FROM users WHERE email = ?`,
      [normalizedEmail]
    );

    if (exists) {
      return error(res, "An account with this email already exists.");
    }

    const hash = await bcrypt.hash(password, 12);

    const result = run(
      `INSERT INTO users
       (name, email, phone, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, 'customer', ?)`,
      [name.trim(), normalizedEmail, phone.trim(), hash, now()]
    );

    const user = get(
      `SELECT * FROM users WHERE id = ?`,
      [result.lastInsertRowid]
    );

    res.status(201).json({
      success: true,
      token: createToken(user),
      user: safeUser(user)
    });
  } catch (err) {
    console.error(err);
    error(res, "Unable to create your account.", 500);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return error(res, "Email and password are required.");
    }

    const user = get(
      `SELECT * FROM users WHERE email = ?`,
      [email.toLowerCase().trim()]
    );

    if (!user) {
      return error(res, "Invalid email or password.", 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return error(res, "Invalid email or password.", 401);
    }

    res.json({
      success: true,
      token: createToken(user),
      user: safeUser(user)
    });
  } catch (err) {
    console.error(err);
    error(res, "Unable to log in.", 500);
  }
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = get(
    `SELECT * FROM users WHERE id = ?`,
    [req.user.id]
  );

  if (!user) {
    return error(res, "User account not found.", 404);
  }

  res.json({
    success: true,
    user: safeUser(user)
  });
});

app.put("/api/auth/profile", auth, (req, res) => {
  const { name, phone } = req.body;

  if (!name) {
    return error(res, "Name is required.");
  }

  run(
    `UPDATE users SET name = ?, phone = ? WHERE id = ?`,
    [name.trim(), String(phone || "").trim(), req.user.id]
  );

  const user = get(
    `SELECT * FROM users WHERE id = ?`,
    [req.user.id]
  );

  res.json({
    success: true,
    user: safeUser(user)
  });
});

app.put("/api/auth/password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return error(res, "Both passwords are required.");
  }

  if (newPassword.length < 6) {
    return error(res, "New password must be at least 6 characters.");
  }

  const user = get(
    `SELECT * FROM users WHERE id = ?`,
    [req.user.id]
  );

  const valid = await bcrypt.compare(
    currentPassword,
    user.password_hash
  );

  if (!valid) {
    return error(res, "Current password is incorrect.", 401);
  }

  const hash = await bcrypt.hash(newPassword, 12);

  run(
    `UPDATE users SET password_hash = ? WHERE id = ?`,
    [hash, req.user.id]
  );

  res.json({
    success: true,
    message: "Password changed successfully."
  });
});

/* =========================================================
   CATEGORIES
========================================================= */

app.get("/api/categories", (req, res) => {
  const categories = all(
    `SELECT * FROM categories
     WHERE visible = 1
     ORDER BY name ASC`
  );

  res.json({
    success: true,
    categories
  });
});

app.get("/api/admin/categories", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    categories: all(
      `SELECT * FROM categories ORDER BY id DESC`
    )
  });
});

app.post("/api/admin/categories", auth, adminOnly, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return error(res, "Category name is required.");
  }

  const slug = slugify(name);

  try {
    const result = run(
      `INSERT INTO categories
       (name, slug, visible, created_at)
       VALUES (?, ?, 1, ?)`,
      [name.trim(), slug, now()]
    );

    res.status(201).json({
      success: true,
      category: get(
        `SELECT * FROM categories WHERE id = ?`,
        [result.lastInsertRowid]
      )
    });
  } catch {
    error(res, "Category already exists.");
  }
});

app.put("/api/admin/categories/:id", auth, adminOnly, (req, res) => {
  const { name, visible } = req.body;

  if (!name) {
    return error(res, "Category name is required.");
  }

  run(
    `UPDATE categories
     SET name = ?, slug = ?, visible = ?
     WHERE id = ?`,
    [
      name.trim(),
      slugify(name),
      visible === undefined ? 1 : Number(visible),
      req.params.id
    ]
  );

  res.json({
    success: true,
    message: "Category updated."
  });
});

app.delete("/api/admin/categories/:id", auth, adminOnly, (req, res) => {
  run(
    `DELETE FROM categories WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Category deleted."
  });
});

/* =========================================================
   PRODUCTS
========================================================= */

app.get("/api/products", (req, res) => {
  const {
    search = "",
    category = "",
    available = "",
    featured = "",
    sort = "newest"
  } = req.query;

  let sql = `
    SELECT
      p.*,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.visible = 1
  `;

  const params = [];

  if (search) {
    sql += `
      AND (
        p.name LIKE ?
        OR p.description LIKE ?
      )
    `;

    const q = `%${search}%`;
    params.push(q, q);
  }

  if (category) {
    sql += ` AND p.category_id = ? `;
    params.push(category);
  }

  if (available === "1") {
    sql += ` AND p.available = 1 AND p.stock > 0 `;
  }

  if (available === "0") {
    sql += ` AND (p.available = 0 OR p.stock <= 0) `;
  }

  if (featured === "1") {
    sql += ` AND p.featured = 1 `;
  }

  if (sort === "price-low") {
    sql += ` ORDER BY p.price ASC `;
  } else if (sort === "price-high") {
    sql += ` ORDER BY p.price DESC `;
  } else if (sort === "name") {
    sql += ` ORDER BY p.name ASC `;
  } else {
    sql += ` ORDER BY p.created_at DESC `;
  }

  res.json({
    success: true,
    products: all(sql, params)
  });
});

app.get("/api/products/:id", (req, res) => {
  const product = get(
    `SELECT
       p.*,
       c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = ? AND p.visible = 1`,
    [req.params.id]
  );

  if (!product) {
    return error(res, "Product not found.", 404);
  }

  res.json({
    success: true,
    product
  });
});

app.get("/api/admin/products", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    products: all(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.id DESC
    `)
  });
});

app.post("/api/admin/products", auth, adminOnly, (req, res) => {
  const {
    name,
    category_id,
    description = "",
    features = "",
    price = 0,
    stock = 0,
    image = "",
    images = [],
    video = "",
    available = 1,
    featured = 0,
    visible = 1
  } = req.body;

  if (!name) {
    return error(res, "Product name is required.");
  }

  let slug = slugify(name);

  const existing = get(
    `SELECT id FROM products WHERE slug = ?`,
    [slug]
  );

  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  const result = run(
    `INSERT INTO products
     (name, slug, category_id, description, features, price, stock,
      image, images, video, available, featured, visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      slug,
      category_id || null,
      description,
      features,
      Number(price) || 0,
      Number(stock) || 0,
      image,
      JSON.stringify(Array.isArray(images) ? images : []),
      video,
      Number(available),
      Number(featured),
      Number(visible),
      now(),
      now()
    ]
  );

  res.status(201).json({
    success: true,
    product: get(
      `SELECT * FROM products WHERE id = ?`,
      [result.lastInsertRowid]
    )
  });
});

app.put("/api/admin/products/:id", auth, adminOnly, (req, res) => {
  const {
    name,
    category_id,
    description = "",
    features = "",
    price = 0,
    stock = 0,
    image = "",
    images = [],
    video = "",
    available = 1,
    featured = 0,
    visible = 1
  } = req.body;

  if (!name) {
    return error(res, "Product name is required.");
  }

  run(
    `UPDATE products SET
      name = ?,
      category_id = ?,
      description = ?,
      features = ?,
      price = ?,
      stock = ?,
      image = ?,
      images = ?,
      video = ?,
      available = ?,
      featured = ?,
      visible = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      name.trim(),
      category_id || null,
      description,
      features,
      Number(price) || 0,
      Number(stock) || 0,
      image,
      JSON.stringify(Array.isArray(images) ? images : []),
      video,
      Number(available),
      Number(featured),
      Number(visible),
      now(),
      req.params.id
    ]
  );

  res.json({
    success: true,
    message: "Product updated."
  });
});

app.patch("/api/admin/products/:id/toggle", auth, adminOnly, (req, res) => {
  const product = get(
    `SELECT visible FROM products WHERE id = ?`,
    [req.params.id]
  );

  if (!product) {
    return error(res, "Product not found.", 404);
  }

  run(
    `UPDATE products SET visible = ? WHERE id = ?`,
    [product.visible ? 0 : 1, req.params.id]
  );

  res.json({
    success: true,
    message: "Product visibility updated."
  });
});

app.delete("/api/admin/products/:id", auth, adminOnly, (req, res) => {
  run(
    `DELETE FROM products WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Product deleted."
  });
});

/* =========================================================
   REVIEWS
========================================================= */

app.get("/api/reviews", (req, res) => {
  const reviews = all(`
    SELECT id, name, rating, review, photo, created_at
    FROM reviews
    WHERE approved = 1 AND visible = 1
    ORDER BY created_at DESC
  `);

  res.json({
    success: true,
    reviews
  });
});

app.post("/api/reviews", optionalAuth, (req, res) => {
  const {
    name,
    rating,
    review,
    photo = ""
  } = req.body;

  if (!name || !review) {
    return error(res, "Name and review are required.");
  }

  const stars = Number(rating);

  if (stars < 1 || stars > 5) {
    return error(res, "Rating must be between 1 and 5.");
  }

  run(
    `INSERT INTO reviews
     (user_id, name, rating, review, photo, approved, visible, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
    [
      req.user ? req.user.id : null,
      name.trim(),
      stars,
      review.trim(),
      photo,
      now()
    ]
  );

  run(
    `INSERT INTO notifications
     (type, title, message, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      "review",
      "New review",
      `A new review was submitted by ${name}.`,
      now()
    ]
  );

  res.status(201).json({
    success: true,
    message: "Thank you. Your review is waiting for approval."
  });
});

app.get("/api/admin/reviews", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    reviews: all(`
      SELECT *
      FROM reviews
      ORDER BY id DESC
    `)
  });
});

app.patch("/api/admin/reviews/:id/approve", auth, adminOnly, (req, res) => {
  run(
    `UPDATE reviews SET approved = 1, visible = 1 WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Review approved."
  });
});

app.patch("/api/admin/reviews/:id/hide", auth, adminOnly, (req, res) => {
  run(
    `UPDATE reviews SET visible = 0 WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Review hidden."
  });
});

app.delete("/api/admin/reviews/:id", auth, adminOnly, (req, res) => {
  run(
    `DELETE FROM reviews WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Review deleted."
  });
});

/* =========================================================
   FAQ
========================================================= */

app.get("/api/faqs", (req, res) => {
  res.json({
    success: true,
    faqs: all(`
      SELECT *
      FROM faqs
      WHERE visible = 1
      ORDER BY id ASC
    `)
  });
});

app.get("/api/admin/faqs", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    faqs: all(`
      SELECT *
      FROM faqs
      ORDER BY id DESC
    `)
  });
});

app.post("/api/admin/faqs", auth, adminOnly, (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return error(res, "Question and answer are required.");
  }

  const result = run(
    `INSERT INTO faqs
     (question, answer, visible, created_at)
     VALUES (?, ?, 1, ?)`,
    [question.trim(), answer.trim(), now()]
  );

  res.status(201).json({
    success: true,
    faq: get(
      `SELECT * FROM faqs WHERE id = ?`,
      [result.lastInsertRowid]
    )
  });
});

app.put("/api/admin/faqs/:id", auth, adminOnly, (req, res) => {
  const { question, answer, visible } = req.body;

  if (!question || !answer) {
    return error(res, "Question and answer are required.");
  }

  run(
    `UPDATE faqs
     SET question = ?, answer = ?, visible = ?
     WHERE id = ?`,
    [
      question.trim(),
      answer.trim(),
      visible === undefined ? 1 : Number(visible),
      req.params.id
    ]
  );

  res.json({
    success: true,
    message: "FAQ updated."
  });
});

app.delete("/api/admin/faqs/:id", auth, adminOnly, (req, res) => {
  run(
    `DELETE FROM faqs WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "FAQ deleted."
  });
});

/* =========================================================
   QUOTES
========================================================= */

app.post("/api/quotes", (req, res) => {
  const {
    name,
    phone,
    email = "",
    product = "",
    quantity = 1,
    location = "",
    message = ""
  } = req.body;

  if (!name || !phone) {
    return error(res, "Name and phone are required.");
  }

  run(
    `INSERT INTO quote_requests
     (name, phone, email, product, quantity, location, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [
      name.trim(),
      phone.trim(),
      email.trim(),
      product.trim(),
      Number(quantity) || 1,
      location.trim(),
      message.trim(),
      now()
    ]
  );

  run(
    `INSERT INTO notifications
     (type, title, message, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      "quote",
      "New quote request",
      `A new quote request was submitted by ${name}.`,
      now()
    ]
  );

  res.status(201).json({
    success: true,
    message: "Your quote request has been received."
  });
});

app.get("/api/admin/quotes", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    quotes: all(`
      SELECT *
      FROM quote_requests
      ORDER BY id DESC
    `)
  });
});

app.patch("/api/admin/quotes/:id/status", auth, adminOnly, (req, res) => {
  const { status } = req.body;

  run(
    `UPDATE quote_requests SET status = ? WHERE id = ?`,
    [status || "new", req.params.id]
  );

  res.json({
    success: true,
    message: "Quote status updated."
  });
});

/* =========================================================
   PROMOTIONS
========================================================= */

app.get("/api/promotions/active", (req, res) => {
  const date = new Date().toISOString().slice(0, 10);

  const promotions = all(
    `SELECT *
     FROM promotions
     WHERE active = 1
       AND (start_date = '' OR start_date <= ?)
       AND (end_date = '' OR end_date >= ?)
     ORDER BY id DESC`,
    [date, date]
  );

  res.json({
    success: true,
    promotions
  });
});

app.post("/api/promotions/apply", (req, res) => {
  const { code, subtotal = 0 } = req.body;

  if (!code) {
    return error(res, "Discount code is required.");
  }

  const date = new Date().toISOString().slice(0, 10);

  const promotion = get(
    `SELECT *
     FROM promotions
     WHERE code = ?
       AND active = 1
       AND (start_date = '' OR start_date <= ?)
       AND (end_date = '' OR end_date >= ?)`,
    [code.trim().toUpperCase(), date, date]
  );

  if (!promotion) {
    return error(res, "Invalid or expired discount code.");
  }

  if (Number(subtotal) < Number(promotion.minimum_order)) {
    return error(
      res,
      `Minimum order for this code is ₦${Number(
        promotion.minimum_order
      ).toLocaleString()}`
    );
  }

  let discount = 0;

  if (promotion.type === "percentage") {
    discount = Number(subtotal) * (Number(promotion.value) / 100);
  } else {
    discount = Number(promotion.value);
  }

  discount = Math.min(discount, Number(subtotal));

  res.json({
    success: true,
    discount
  });
});

app.get("/api/admin/promotions", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    promotions: all(`
      SELECT *
      FROM promotions
      ORDER BY id DESC
    `)
  });
});

app.post("/api/admin/promotions", auth, adminOnly, (req, res) => {
  const {
    code,
    type,
    value,
    start_date = "",
    end_date = "",
    minimum_order = 0,
    active = 1
  } = req.body;

  if (!code || !type) {
    return error(res, "Code and promotion type are required.");
  }

  try {
    const result = run(
      `INSERT INTO promotions
       (code, type, value, start_date, end_date, minimum_order, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code.trim().toUpperCase(),
        type,
        Number(value) || 0,
        start_date,
        end_date,
        Number(minimum_order) || 0,
        Number(active),
        now()
      ]
    );

    res.status(201).json({
      success: true,
      promotion: get(
        `SELECT * FROM promotions WHERE id = ?`,
        [result.lastInsertRowid]
      )
    });
  } catch {
    error(res, "That promotion code already exists.");
  }
});

app.put("/api/admin/promotions/:id", auth, adminOnly, (req, res) => {
  const {
    code,
    type,
    value,
    start_date = "",
    end_date = "",
    minimum_order = 0,
    active = 1
  } = req.body;

  run(
    `UPDATE promotions SET
      code = ?,
      type = ?,
      value = ?,
      start_date = ?,
      end_date = ?,
      minimum_order = ?,
      active = ?
     WHERE id = ?`,
    [
      code.trim().toUpperCase(),
      type,
      Number(value) || 0,
      start_date,
      end_date,
      Number(minimum_order) || 0,
      Number(active),
      req.params.id
    ]
  );

  res.json({
    success: true,
    message: "Promotion updated."
  });
});

app.delete("/api/admin/promotions/:id", auth, adminOnly, (req, res) => {
  run(
    `DELETE FROM promotions WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Promotion deleted."
  });
});

/* =========================================================
   DELIVERY
========================================================= */

app.get("/api/delivery", (req, res) => {
  res.json({
    success: true,
    options: all(`
      SELECT *
      FROM delivery_options
      WHERE visible = 1
      ORDER BY fee ASC
    `)
  });
});

app.get("/api/admin/delivery", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    options: all(`
      SELECT *
      FROM delivery_options
      ORDER BY id DESC
    `)
  });
});

app.post("/api/admin/delivery", auth, adminOnly, (req, res) => {
  const {
    name,
    location = "",
    fee = 0,
    estimated_time = "",
    visible = 1
  } = req.body;

  if (!name) {
    return error(res, "Delivery name is required.");
  }

  const result = run(
    `INSERT INTO delivery_options
     (name, location, fee, estimated_time, visible, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      location.trim(),
      Number(fee) || 0,
      estimated_time.trim(),
      Number(visible),
      now()
    ]
  );

  res.status(201).json({
    success: true,
    option: get(
      `SELECT * FROM delivery_options WHERE id = ?`,
      [result.lastInsertRowid]
    )
  });
});

app.put("/api/admin/delivery/:id", auth, adminOnly, (req, res) => {
  const {
    name,
    location = "",
    fee = 0,
    estimated_time = "",
    visible = 1
  } = req.body;

  run(
    `UPDATE delivery_options SET
      name = ?,
      location = ?,
      fee = ?,
      estimated_time = ?,
      visible = ?
     WHERE id = ?`,
    [
      name.trim(),
      location.trim(),
      Number(fee) || 0,
      estimated_time.trim(),
      Number(visible),
      req.params.id
    ]
  );

  res.json({
    success: true,
    message: "Delivery option updated."
  });
});

app.delete("/api/admin/delivery/:id", auth, adminOnly, (req, res) => {
  run(
    `DELETE FROM delivery_options WHERE id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Delivery option deleted."
  });
});

/* =========================================================
   ORDERS
========================================================= */

function generateOrderNumber() {
  return `ACS-${Date.now()}-${Math.floor(
    100 + Math.random() * 900
  )}`;
}

app.post("/api/orders", optionalAuth, (req, res) => {
  try {
    const {
      full_name,
      phone,
      email = "",
      address = "",
      city = "",
      state = "",
      delivery_option = "standard",
      delivery_fee = 0,
      discount = 0,
      payment_method = "moniepoint",
      notes = "",
      items
    } = req.body;

    if (!full_name || !phone) {
      return error(res, "Full name and phone are required.");
    }

    if (!Array.isArray(items) || items.length === 0) {
      return error(res, "Your cart is empty.");
    }

    let subtotal = 0;
    const preparedItems = [];

    for (const item of items) {
      const product = get(
        `SELECT * FROM products WHERE id = ? AND visible = 1`,
        [item.product_id]
      );

      if (!product) {
        return error(res, "One of the products is no longer available.");
      }

      const quantity = Math.max(1, Number(item.quantity) || 1);

      if (product.stock > 0 && quantity > product.stock) {
        return error(
          res,
          `${product.name} has only ${product.stock} available.`
        );
      }

      const lineTotal = Number(product.price) * quantity;

      subtotal += lineTotal;

      preparedItems.push({
        product,
        quantity,
        lineTotal
      });
    }

    const safeDeliveryFee = Number(delivery_fee) || 0;
    const safeDiscount = Math.min(
      Number(discount) || 0,
      subtotal
    );

    const total =
      subtotal + safeDeliveryFee - safeDiscount;

    const orderNumber = generateOrderNumber();

    const orderResult = run(
      `INSERT INTO orders
       (order_number, user_id, full_name, phone, email, address, city, state,
        delivery_option, delivery_fee, discount, subtotal, total,
        payment_method, payment_status, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, ?)`,
      [
        orderNumber,
        req.user ? req.user.id : null,
        full_name.trim(),
        phone.trim(),
        email.trim(),
        address.trim(),
        city.trim(),
        state.trim(),
        delivery_option,
        safeDeliveryFee,
        safeDiscount,
        subtotal,
        total,
        payment_method,
        notes.trim(),
        now(),
        now()
      ]
    );

    const orderId = orderResult.lastInsertRowid;

    for (const item of preparedItems) {
      run(
        `INSERT INTO order_items
         (order_id, product_id, product_name, price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product.id,
          item.product.name,
          item.product.price,
          item.quantity,
          item.lineTotal
        ]
      );

      if (item.product.stock > 0) {
        run(
          `UPDATE products
           SET stock = MAX(stock - ?, 0),
               available = CASE
                 WHEN stock - ? <= 0 THEN 0
                 ELSE available
               END
           WHERE id = ?`,
          [
            item.quantity,
            item.quantity,
            item.product.id
          ]
        );
      }
    }

    run(
      `INSERT INTO notifications
       (type, title, message, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        "order",
        "New order",
        `New order ${orderNumber} was received.`,
        now()
      ]
    );

    res.status(201).json({
      success: true,
      order: {
        id: orderId,
        order_number: orderNumber,
        subtotal,
        delivery_fee: safeDeliveryFee,
        discount: safeDiscount,
        total,
        payment_method,
        payment_status: "pending",
        status: "pending"
      }
    });
  } catch (err) {
    console.error(err);
    error(res, "Unable to create your order.", 500);
  }
});

app.get("/api/orders/:id", (req, res) => {
  const order = get(
    `SELECT *
     FROM orders
     WHERE order_number = ?`,
    [req.params.id]
  );

  if (!order) {
    return error(res, "Order not found.", 404);
  }

  const items = all(
    `SELECT *
     FROM order_items
     WHERE order_id = ?`,
    [order.id]
  );

  res.json({
    success: true,
    order: {
      ...order,
      items
    }
  });
});

app.get("/api/orders/track", (req, res) => {
  const { order_number, phone } = req.query;

  if (!order_number || !phone) {
    return error(res, "Order number and phone number are required.");
  }

  const order = get(
    `SELECT *
     FROM orders
     WHERE order_number = ? AND phone = ?`,
    [order_number.trim(), phone.trim()]
  );

  if (!order) {
    return error(res, "We could not find that order.", 404);
  }

  const items = all(
    `SELECT *
     FROM order_items
     WHERE order_id = ?`,
    [order.id]
  );

  res.json({
    success: true,
    order: {
      ...order,
      items
    }
  });
});

app.get("/api/orders/my", auth, (req, res) => {
  const orders = all(
    `SELECT *
     FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  res.json({
    success: true,
    orders
  });
});

/* =========================================================
   ADMIN ORDERS
========================================================= */

app.get("/api/admin/orders", auth, adminOnly, (req, res) => {
  const orders = all(`
    SELECT *
    FROM orders
    ORDER BY id DESC
  `);

  for (const order of orders) {
    order.items = all(
      `SELECT *
       FROM order_items
       WHERE order_id = ?`,
      [order.id]
    );
  }

  res.json({
    success: true,
    orders
  });
});

app.patch("/api/admin/orders/:id/status", auth, adminOnly, (req, res) => {
  const { status } = req.body;

  const allowed = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled"
  ];

  if (!allowed.includes(status)) {
    return error(res, "Invalid order status.");
  }

  run(
    `UPDATE orders
     SET status = ?, updated_at = ?
     WHERE id = ?`,
    [status, now(), req.params.id]
  );

  run(
    `INSERT INTO notifications
     (type, title, message, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      "order_status",
      "Order status updated",
      `Order #${req.params.id} is now ${status}.`,
      now()
    ]
  );

  res.json({
    success: true,
    message: "Order status updated."
  });
});

app.patch("/api/admin/orders/:id/payment", auth, adminOnly, (req, res) => {
  const allowed = ["pending", "paid", "unpaid"];
  const { payment_status } = req.body;

  if (!allowed.includes(payment_status)) {
    return error(res, "Invalid payment status.");
  }

  run(
    `UPDATE orders
     SET payment_status = ?, updated_at = ?
     WHERE id = ?`,
    [payment_status, now(), req.params.id]
  );

  res.json({
    success: true,
    message: "Payment status updated."
  });
});

/* =========================================================
   CONTACT
========================================================= */

app.post("/api/contact", (req, res) => {
  const {
    name,
    email = "",
    phone = "",
    message
  } = req.body;

  if (!name || !message) {
    return error(res, "Name and message are required.");
  }

  run(
    `INSERT INTO contact_messages
     (name, email, phone, message, status, created_at)
     VALUES (?, ?, ?, ?, 'new', ?)`,
    [
      name.trim(),
      email.trim(),
      phone.trim(),
      message.trim(),
      now()
    ]
  );

  run(
    `INSERT INTO notifications
     (type, title, message, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      "contact",
      "New contact message",
      `New contact message from ${name}.`,
      now()
    ]
  );

  res.status(201).json({
    success: true,
    message: "Your message has been sent."
  });
});

app.get("/api/admin/contact", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    messages: all(`
      SELECT *
      FROM contact_messages
      ORDER BY id DESC
    `)
  });
});

app.patch("/api/admin/contact/:id/status", auth, adminOnly, (req, res) => {
  run(
    `UPDATE contact_messages
     SET status = ?
     WHERE id = ?`,
    [
      req.body.status || "read",
      req.params.id
    ]
  );

  res.json({
    success: true,
    message: "Message status updated."
  });
});

/* =========================================================
   CUSTOMERS
========================================================= */

app.get("/api/admin/customers", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    customers: all(`
      SELECT id, name, email, phone, role, created_at
      FROM users
      ORDER BY id DESC
    `)
  });
});

/* =========================================================
   ADMIN SETTINGS
========================================================= */

app.put("/api/admin/settings", auth, adminOnly, (req, res) => {
  const settings = req.body || {};

  const allowedKeys = new Set([
    "business_name",
    "tagline",
    "founder",
    "phone",
    "whatsapp",
    "whatsapp_url",
    "facebook",
    "tiktok",
    "instagram",
    "bank",
    "account_name",
    "account_number",
    "hero_title",
    "hero_description",
    "announcement",
    "delivery_note"
  ]);

  for (const [key, value] of Object.entries(settings)) {
    if (!allowedKeys.has(key)) continue;

    run(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key)
       DO UPDATE SET value = excluded.value`,
      [key, String(value ?? "")]
    );
  }

  res.json({
    success: true,
    message: "Store settings updated."
  });
});

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

app.get("/api/admin/stats", auth, adminOnly, (req, res) => {
  const products = get(
    `SELECT COUNT(*) AS count FROM products`
  ).count;

  const customers = get(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE role = 'customer'`
  ).count;

  const orders = get(
    `SELECT COUNT(*) AS count FROM orders`
  ).count;

  const revenue = get(
    `SELECT COALESCE(SUM(total), 0) AS total
     FROM orders
     WHERE payment_status = 'paid'
       AND status != 'cancelled'`
  ).total;

  const pending = get(
    `SELECT COUNT(*) AS count
     FROM orders
     WHERE status = 'pending'`
  ).count;

  const confirmed = get(
    `SELECT COUNT(*) AS count
     FROM orders
     WHERE status = 'confirmed'`
  ).count;

  const processing = get(
    `SELECT COUNT(*) AS count
     FROM orders
     WHERE status = 'processing'`
  ).count;

  const delivered = get(
    `SELECT COUNT(*) AS count
     FROM orders
     WHERE status = 'delivered'`
  ).count;

  const bestSelling = all(`
    SELECT
      product_id,
      product_name,
      SUM(quantity) AS quantity
    FROM order_items
    GROUP BY product_id, product_name
    ORDER BY quantity DESC
    LIMIT 5
  `);

  const recentOrders = all(`
    SELECT *
    FROM orders
    ORDER BY id DESC
    LIMIT 10
  `);

  const recentCustomers = all(`
    SELECT id, name, email, phone, created_at
    FROM users
    WHERE role = 'customer'
    ORDER BY id DESC
    LIMIT 10
  `);

  const revenueOverTime = all(`
    SELECT
      substr(created_at, 1, 10) AS date,
      SUM(total) AS revenue
    FROM orders
    WHERE payment_status = 'paid'
    GROUP BY substr(created_at, 1, 10)
    ORDER BY date ASC
    LIMIT 30
  `);

  res.json({
    success: true,
    stats: {
      products,
      customers,
      orders,
      revenue,
      pending,
      confirmed,
      processing,
      delivered,
      bestSelling,
      recentOrders,
      recentCustomers,
      revenueOverTime
    }
  });
});

/* =========================================================
   NOTIFICATIONS
========================================================= */

app.get("/api/admin/notifications", auth, adminOnly, (req, res) => {
  res.json({
    success: true,
    notifications: all(`
      SELECT *
      FROM notifications
      ORDER BY id DESC
      LIMIT 100
    `)
  });
});

app.patch(
  "/api/admin/notifications/:id/read",
  auth,
  adminOnly,
  (req, res) => {
    run(
      `UPDATE notifications SET read = 1 WHERE id = ?`,
      [req.params.id]
    );

    res.json({
      success: true
    });
  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Abraham Co Store API is running.",
    time: now()
  });
});

/* =========================================================
   STATIC WEBSITE
========================================================= */

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again."
  });
});

app.listen(PORT, () => {
  console.log(`Abraham Co Store running on port ${PORT}`);
});
