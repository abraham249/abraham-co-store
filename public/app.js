/* =========================================================
   ABRAHAM CO STORE
   Frontend JavaScript
   ========================================================= */

const state = {
  settings: {},
  products: [],
  categories: [],
  cart: JSON.parse(localStorage.getItem("abraham_cart") || "[]"),
  wishlist: JSON.parse(localStorage.getItem("abraham_wishlist") || "[]"),
  user: JSON.parse(localStorage.getItem("abraham_user") || "null")
};

/* =========================
   BASIC HELPERS
   ========================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function saveCart() {
  localStorage.setItem("abraham_cart", JSON.stringify(state.cart));
  updateCartCount();
}

function saveWishlist() {
  localStorage.setItem(
    "abraham_wishlist",
    JSON.stringify(state.wishlist)
  );
}

function money(value) {
  const amount = Number(value || 0);

  if (amount <= 0) {
    return "Contact for price";
  }

  return "₦" + amount.toLocaleString("en-NG");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

/* =========================
   INITIALIZE WEBSITE
   ========================= */

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupButtons();
  updateCartCount();
  updateWishlistCount();

  await loadSettings();
  await loadCategories();
  await loadProducts();
  await loadFAQs();

  renderCart();
});

/* =========================
   SETTINGS
   ========================= */

async function loadSettings() {
  try {
    const data = await api("/api/settings");

    state.settings = data.settings || data || {};

    const businessName =
      state.settings.business_name || "Abraham Co Store";

    const tagline =
      state.settings.tagline ||
      "Quality Products. Reliable Solutions.";

    const phone =
      state.settings.phone ||
      "09074828638";

    const whatsapp =
      state.settings.whatsapp_url ||
      "https://wa.me/2349074828638";

    const facebook =
      state.settings.facebook ||
      "https://www.facebook.com/profile.php?id=61591989816314";

    const businessNameElements =
      document.querySelectorAll("[data-business-name]");

    businessNameElements.forEach((element) => {
      element.textContent = businessName;
    });

    const taglineElements =
      document.querySelectorAll("[data-tagline]");

    taglineElements.forEach((element) => {
      element.textContent = tagline;
    });

    const phoneElements =
      document.querySelectorAll("[data-phone]");

    phoneElements.forEach((element) => {
      element.textContent = phone;
      element.href = `tel:${phone}`;
    });

    const whatsappElements =
      document.querySelectorAll("[data-whatsapp]");

    whatsappElements.forEach((element) => {
      element.href = whatsapp;
    });

    const facebookElements =
      document.querySelectorAll("[data-facebook]");

    facebookElements.forEach((element) => {
      element.href = facebook;
    });

    const heroTitle = $("#hero-title");

    if (heroTitle && state.settings.hero_title) {
      heroTitle.textContent = state.settings.hero_title;
    }

    const heroDescription = $("#hero-description");

    if (
      heroDescription &&
      state.settings.hero_description
    ) {
      heroDescription.textContent =
        state.settings.hero_description;
    }

    const announcement = $("#announcement");

    if (
      announcement &&
      state.settings.announcement
    ) {
      announcement.textContent =
        state.settings.announcement;
    }

    document.title =
      `${businessName} | ${tagline}`;
  } catch (error) {
    console.error("Settings error:", error);
  }
}

/* =========================
   CATEGORIES
   ========================= */

async function loadCategories() {
  try {
    const data = await api("/api/categories");

    state.categories = Array.isArray(data)
      ? data
      : data.categories || [];

    renderCategories();
    populateCategoryFilter();
  } catch (error) {
    console.error("Categories error:", error);
  }
}

function renderCategories() {
  const container = $("#category-grid");

  if (!container) return;

  if (!state.categories.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = state.categories
    .map(
      (category) => `
        <article class="category-card">
          <div class="category-icon">▦</div>

          <h3>
            ${escapeHTML(category.name)}
          </h3>

          <p>
            ${
              escapeHTML(
                category.description ||
                "Quality products and reliable solutions."
              )
            }
          </p>

          <br>

          <button
            class="btn btn-light"
            onclick="filterProductsByCategory('${category.id}')"
          >
            View Products
          </button>
        </article>
      `
    )
    .join("");
}

function populateCategoryFilter() {
  const select = $("#category-filter");

  if (!select) return;

  select.innerHTML = `
    <option value="">All Categories</option>

    ${state.categories
      .map(
        (category) => `
          <option value="${category.id}">
            ${escapeHTML(category.name)}
          </option>
        `
      )
      .join("")}
  `;
}

/* =========================
   PRODUCTS
   ========================= */

async function loadProducts() {
  try {
    const data = await api("/api/products");

    state.products = Array.isArray(data)
      ? data
      : data.products || [];

    renderProducts(state.products);
  } catch (error) {
    console.error("Products error:", error);

    const container = $("#product-grid");

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Unable to load products</h3>
          <p>Please refresh the page and try again.</p>
        </div>
      `;
    }
  }
}

function renderProducts(products) {
  const container = $("#product-grid");

  if (!container) return;

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No products found</h3>
        <p>Check back soon for new products.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = products
    .map((product) => {
      const isWishlisted =
        state.wishlist.includes(product.id);

      return `
        <article class="product-card">

          <button
            class="favorite-btn"
            onclick="toggleWishlist(${product.id})"
            aria-label="Add to wishlist"
          >
            ${isWishlisted ? "♥" : "♡"}
          </button>

          <div class="product-image">
            <img
              src="${escapeAttribute(
                product.image ||
                "/assets/placeholder.jpg"
              )}"
              alt="${escapeAttribute(product.name)}"
              onerror="this.src='/assets/placeholder.jpg'"
            >
          </div>

          <div class="product-info">

            <div class="product-category">
              ${escapeHTML(
                product.category_name ||
                "Product"
              )}
            </div>

            <h3 class="product-title">
              ${escapeHTML(product.name)}
            </h3>

            <p class="product-description">
              ${escapeHTML(
                product.description ||
                "Quality product from Abraham Co Store."
              )}
            </p>

            <div class="product-price">
              ${money(product.price)}
            </div>

            <div class="product-actions">

              <button
                class="btn btn-light"
                onclick="viewProduct(${product.id})"
              >
                View
              </button>

              <button
                class="btn btn-primary"
                onclick="addToCart(${product.id})"
              >
                Add to Cart
              </button>

            </div>

          </div>
        </article>
      `;
    })
    .join("");
}

/* =========================
   PRODUCT SEARCH
   ========================= */

function filterProducts() {
  const search =
    ($("#product-search")?.value || "")
      .trim()
      .toLowerCase();

  const category =
    $("#category-filter")?.value || "";

  const filtered = state.products.filter(
    (product) => {
      const matchesSearch =
        !search ||
        product.name
          .toLowerCase()
          .includes(search) ||
        (product.description || "")
          .toLowerCase()
          .includes(search);

      const matchesCategory =
        !category ||
        String(product.category_id) ===
          String(category);

      return matchesSearch && matchesCategory;
    }
  );

  renderProducts(filtered);
}

function filterProductsByCategory(categoryId) {
  const select = $("#category-filter");

  if (select) {
    select.value = categoryId;
  }

  filterProducts();

  const productsSection =
    document.querySelector("#products");

  if (productsSection) {
    productsSection.scrollIntoView({
      behavior: "smooth"
    });
  }
}

/* =========================
   PRODUCT DETAILS
   ========================= */

async function viewProduct(id) {
  try {
    const data = await api(`/api/products/${id}`);

    const product =
      data.product || data;

    showProductModal(product);
  } catch (error) {
    alert(error.message);
  }
}

function showProductModal(product) {
  const modal = $("#product-modal");

  if (!modal) {
    alert(
      `${product.name}\n\n${product.description || ""}`
    );

    return;
  }

  const image =
    product.image ||
    "/assets/placeholder.jpg";

  modal.innerHTML = `
    <div class="modal">

      <button
        class="modal-close"
        onclick="closeModal('product-modal')"
      >
        ×
      </button>

      <img
        src="${escapeAttribute(image)}"
        alt="${escapeAttribute(product.name)}"
        style="
          width:100%;
          max-height:350px;
          object-fit:contain;
          background:#f7f7f7;
          border-radius:10px;
          margin-bottom:20px;
        "
      >

      <div class="product-category">
        ${escapeHTML(
          product.category_name ||
          "Product"
        )}
      </div>

      <h2 style="margin:8px 0;">
        ${escapeHTML(product.name)}
      </h2>

      <h3 style="margin-bottom:15px;">
        ${money(product.price)}
      </h3>

      <p style="color:#666;margin-bottom:20px;">
        ${escapeHTML(
          product.description ||
          "Quality product from Abraham Co Store."
        )}
      </p>

      <button
        class="btn btn-primary"
        onclick="addToCart(${product.id}); closeModal('product-modal')"
      >
        Add to Cart
      </button>

    </div>
  `;

  modal.classList.add("active");
}

/* =========================
   CART
   ========================= */

function addToCart(productId) {
  const product = state.products.find(
    (item) =>
      Number(item.id) === Number(productId)
  );

  if (!product) {
    alert("Product not found.");
    return;
  }

  const existing =
    state.cart.find(
      (item) =>
        Number(item.product_id) ===
        Number(productId)
    );

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      product_id: product.id,
      name: product.name,
      price: Number(product.price || 0),
      image:
        product.image ||
        "/assets/placeholder.jpg",
      quantity: 1
    });
  }

  saveCart();
  renderCart();
  openCart();
}

function removeFromCart(productId) {
  state.cart =
    state.cart.filter(
      (item) =>
        Number(item.product_id) !==
        Number(productId)
    );

  saveCart();
  renderCart();
}

function changeQuantity(productId, change) {
  const item =
    state.cart.find(
      (cartItem) =>
        Number(cartItem.product_id) ===
        Number(productId)
    );

  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    removeFromCart(productId);
    return;
  }

  saveCart();
  renderCart();
}

function renderCart() {
  const container = $("#cart-items");

  if (!container) return;

  if (!state.cart.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Your cart is empty</h3>
        <p>Add products to your cart to continue.</p>
      </div>
    `;
  } else {
    container.innerHTML =
      state.cart
        .map(
          (item) => `
            <div class="cart-item">

              <div class="cart-item-image">
                <img
                  src="${escapeAttribute(item.image)}"
                  alt="${escapeAttribute(item.name)}"
                  onerror="this.src='/assets/placeholder.jpg'"
                >
              </div>

              <div class="cart-item-info">

                <h4>
                  ${escapeHTML(item.name)}
                </h4>

                <div class="cart-item-price">
                  ${money(item.price)}
                </div>

                <div class="quantity-controls">

                  <button
                    onclick="changeQuantity(${item.product_id}, -1)"
                  >
                    −
                  </button>

                  <span>
                    ${item.quantity}
                  </span>

                  <button
                    onclick="changeQuantity(${item.product_id}, 1)"
                  >
                    +
                  </button>

                  <button
                    onclick="removeFromCart(${item.product_id})"
                    style="margin-left:auto;"
                  >
                    Remove
                  </button>

                </div>

              </div>

            </div>
          `
        )
        .join("");
  }

  updateCartTotal();
}

function updateCartTotal() {
  const totalElement =
    $("#cart-total");

  if (!totalElement) return;

  const total =
    state.cart.reduce(
      (sum, item) =>
        sum +
        Number(item.price || 0) *
          Number(item.quantity || 0),
      0
    );

  totalElement.textContent =
    money(total);
}

function updateCartCount() {
  const count =
    state.cart.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 0),
      0
    );

  $$(".cart-count").forEach(
    (element) => {
      element.textContent = count;
    }
  );
}

function openCart() {
  $("#cart-overlay")?.classList.add("active");
  $("#cart-sidebar")?.classList.add("active");
}

function closeCart() {
  $("#cart-overlay")?.classList.remove("active");
  $("#cart-sidebar")?.classList.remove("active");
}

/* =========================
   WISHLIST
   ========================= */

function toggleWishlist(productId) {
  const id = Number(productId);

  if (state.wishlist.includes(id)) {
    state.wishlist =
      state.wishlist.filter(
        (item) => item !== id
      );
  } else {
    state.wishlist.push(id);
  }

  saveWishlist();
  updateWishlistCount();
  renderProducts(state.products);
}

function updateWishlistCount() {
  $$(".wishlist-count").forEach(
    (element) => {
      element.textContent =
        state.wishlist.length;
    }
  );
}

/* =========================
   FAQ
   ========================= */

async function loadFAQs() {
  try {
    const data = await api("/api/faqs");

    const faqs =
      Array.isArray(data)
        ? data
        : data.faqs || [];

    renderFAQs(faqs);
  } catch (error) {
    console.error("FAQ error:", error);
  }
}

function renderFAQs(faqs) {
  const container = $("#faq-list");

  if (!container) return;

  if (!faqs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No FAQs available yet.</p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    faqs
      .map(
        (faq) => `
          <div class="faq-item">

            <button
              class="faq-question"
              onclick="toggleFAQ(this)"
            >
              <span>
                ${escapeHTML(faq.question)}
              </span>

              <span>+</span>
            </button>

            <div class="faq-answer">
              ${escapeHTML(faq.answer)}
            </div>

          </div>
        `
      )
      .join("");
}

function toggleFAQ(button) {
  const item =
    button.closest(".faq-item");

  if (!item) return;

  item.classList.toggle("active");

  const symbol =
    button.querySelector("span:last-child");

  if (symbol) {
    symbol.textContent =
      item.classList.contains("active")
        ? "−"
        : "+";
  }
}

/* =========================
   NAVIGATION
   ========================= */

function setupNavigation() {
  const menuButton =
    $("#menu-btn");

  const nav =
    $("#main-nav");

  if (menuButton && nav) {
    menuButton.addEventListener(
      "click",
      () => {
        nav.classList.toggle("active");
      }
    );
  }

  $$("#main-nav a").forEach(
    (link) => {
      link.addEventListener(
        "click",
        () => {
          nav?.classList.remove("active");
        }
      );
    }
  );
}

function setupButtons() {
  $("#cart-button")?.addEventListener(
    "click",
    openCart
  );

  $("#cart-overlay")?.addEventListener(
    "click",
    closeCart
  );

  $("#close-cart")?.addEventListener(
    "click",
    closeCart
  );

  $("#product-search")?.addEventListener(
    "input",
    filterProducts
  );

  $("#category-filter")?.addEventListener(
    "change",
    filterProducts
  );
}

/* =========================
   CHECKOUT
   ========================= */

function openCheckout() {
  if (!state.cart.length) {
    alert("Your cart is empty.");
    return;
  }

  closeCart();

  const checkout =
    $("#checkout-section");

  if (checkout) {
    checkout.classList.remove("hidden");

    checkout.scrollIntoView({
      behavior: "smooth"
    });
  }
}

async function submitOrder(event) {
  event.preventDefault();

  if (!state.cart.length) {
    alert("Your cart is empty.");
    return;
  }

  const form =
    event.target;

  const formData =
    new FormData(form);

  const customerName =
    formData.get("customer_name");

  const phone =
    formData.get("phone");

  const email =
    formData.get("email");

  const address =
    formData.get("address");

  const paymentMethod =
    formData.get("payment_method") ||
    "Moniepoint Transfer";

  try {
    const response =
      await api("/api/orders", {
        method: "POST",

        body: JSON.stringify({
          customer_name: customerName,
          phone,
          email,
          address,
          payment_method: paymentMethod,

          items: state.cart.map(
            (item) => ({
              product_id: item.product_id,
              quantity: item.quantity
            })
          )
        })
      });

    const order =
      response.order || response;

    state.cart = [];

    saveCart();
    renderCart();

    form.reset();

    alert(
      `Order placed successfully.\n\nOrder ID: ${
        order.id || "Created"
      }\n\nWe will contact you to confirm your order.`
    );

    const checkout =
      $("#checkout-section");

    checkout?.classList.add("hidden");

  } catch (error) {
    alert(error.message);
  }
}

/* =========================
   CONTACT FORM
   ========================= */

async function submitContact(event) {
  event.preventDefault();

  const form =
    event.target;

  const formData =
    new FormData(form);

  try {
    await api("/api/contact", {
      method: "POST",

      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        subject: formData.get("subject"),
        message: formData.get("message")
      })
    });

    alert(
      "Thank you. Your message has been sent successfully."
    );

    form.reset();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================
   QUOTE REQUEST
   ========================= */

async function submitQuote(event) {
  event.preventDefault();

  const form =
    event.target;

  const formData =
    new FormData(form);

  try {
    await api("/api/quotes", {
      method: "POST",

      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        product_id:
          formData.get("product_id"),
        quantity:
          formData.get("quantity"),
        message:
          formData.get("message")
      })
    });

    alert(
      "Your quote request has been submitted."
    );

    form.reset();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================
   MODALS
   ========================= */

function closeModal(id) {
  const modal =
    document.getElementById(id);

  modal?.classList.remove("active");
}

document.addEventListener(
  "click",
  (event) => {
    if (
      event.target.classList.contains(
        "modal-overlay"
      )
    ) {
      event.target.classList.remove(
        "active"
      );
    }
  }
);

/* =========================
   HTML SECURITY HELPERS
   ========================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value);
}

/* =========================
   MAKE FUNCTIONS AVAILABLE
   ========================= */

window.loadProducts = loadProducts;
window.filterProducts = filterProducts;
window.filterProductsByCategory =
  filterProductsByCategory;

window.viewProduct = viewProduct;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;

window.openCart = openCart;
window.closeCart = closeCart;
window.openCheckout = openCheckout;

window.toggleWishlist =
  toggleWishlist;

window.toggleFAQ = toggleFAQ;
window.closeModal = closeModal;

window.submitOrder = submitOrder;
window.submitContact = submitContact;
window.submitQuote = submitQuote;
