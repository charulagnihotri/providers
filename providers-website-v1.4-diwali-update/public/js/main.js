/* ============ Providers Real Estate — Client Frontend Logic ============ */

/* ═══════════════════════════════════════════════════════════════════════
   ✏️  EDIT-ME — YOUR WEBSITE FACTS (no coding knowledge needed)
   These four blocks are the only things you ever need to touch.
   Everything on the website updates automatically from here.
   ═══════════════════════════════════════════════════════════════════════ */
const SITE_FACTS = {
  // CONFIRMED number (you know this one for sure)
  yearsInBusiness: 25,

  // Diwali theme shows between these dates, then quietly switches off.
  // Format: "YYYY-MM-DD"  ·  next Diwali just change the year here.
  festive: { start: "2026-11-01", end: "2026-11-15" },

  // PARKED — Recently Closed wall is off the homepage for now (confirm
  // the real deals with Dad first). Paste the section's HTML back from
  // README-DIWALI-UPDATE.md and this data renders again automatically.
  // outcome: "Sold" or "Leased"  ·  note: one short detail, no fake dates
  closedDeals: [
    { title: "3 BHK Builder Floor", locality: "Greater Kailash-I", outcome: "Sold", note: "Park-facing · negotiated above floor rate" },
    { title: "Ground-Floor Retail Showroom", locality: "M3M Urbana, Sector 67", outcome: "Leased", note: "Pre-leased to F&B brand · strong yearly yield" },
    { title: "4 BHK Builder Floor", locality: "Defence Colony", outcome: "Sold", note: "Corner plot · freehold, clean title" },
    { title: "Independent Villa", locality: "DLF Phase 1", outcome: "Sold", note: "Private pool · bought & resold for the same family" },
    { title: "2 BHK Builder Floor", locality: "Vasant Vihar", outcome: "Leased", note: "Expatriate tenant · managed end-to-end by us" },
    { title: "Commercial Unit", locality: "Golf Course Road", outcome: "Sold", note: "Investor purchase · rental-yield verified first" },
  ],

  // PARKED with the Recently Closed wall — see the note above.
  testimonials: [
    {
      quote:
        "We saw four floors with other brokers, but Providers was the only one who told us which one NOT to buy. That honesty saved us lakhs.",
      name: "R. Sharma",
      area: "Greater Kailash-II",
    },
    {
      quote:
        "They checked the title papers before we even asked, and explained everything in simple language. For my parents, that trust meant everything.",
      name: "S. Kapoor",
      area: "Defence Colony",
    },
    {
      quote:
        "My retail unit was rented out in three weeks, and Vipul ji still calls every Diwali. It never felt like a transaction.",
      name: "A. Gupta",
      area: "Golf Course Road, Gurugram",
    },
  ],
};
/* ═════════════════ END OF EDIT-ME BLOCK ═══════════════════════════ */

/* Tiny HTML escaper for anything rendered from SITE_FACTS */
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- Festive (Diwali) window — auto-on, auto-off ---------- */
(function applyFestiveWindow() {
  try {
    // Today's date in IST, "YYYY-MM-DD"
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" });
    const { start, end } = SITE_FACTS.festive || {};
    if (start && end && today >= start && today <= end) {
      document.body.classList.add("festive");
      setupDiwaliPopup();
      buildFairyLights();
      startFireworks();
    }
  } catch {
    /* never break the page over a date */
  }
})();

/* ---------- Diwali wish card — popup on load, click-outside to close ---------- */
function setupDiwaliPopup() {
  const pop = document.getElementById("diwaliPop");
  if (!pop) return;
  const close = () => {
    pop.classList.remove("show");
    pop.setAttribute("aria-hidden", "true");
    setTimeout(() => (pop.style.display = "none"), 350);
    document.removeEventListener("keydown", onKey);
  };
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  // Let the page paint first, then rise in
  setTimeout(() => {
    pop.style.display = "flex";
    requestAnimationFrame(() => {
      pop.classList.add("show");
      pop.setAttribute("aria-hidden", "false");
    });
  }, 700);
  // Close: the X button, a click anywhere outside the card, or Esc
  document.getElementById("diwaliPopClose")?.addEventListener("click", close);
  document.getElementById("diwaliPopBackdrop")?.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.getElementById("diwaliCta")?.addEventListener("click", close);
}

/* ---------- Fairy lights strung along the header's bottom edge ----------
   A real garland: one sagging wire (SVG) with glowing bulbs hanging from
   little caps along it. Lives INSIDE the sticky header, so it follows the
   header and never covers the phone number / email / menu. */
function buildFairyLights() {
  const holder = document.getElementById("fairyLights");
  if (!holder) return;
  const colors = ["#ffd88a", "#ffe9b8", "#ffb35c", "#ff9d9d", "#a8d8b9", "#fff3d6"];
  const H = 38; // container height (px)
  const w = holder.clientWidth || window.innerWidth || 1200;
  const count = Math.max(9, Math.round(w / 78)); // one bulb every ~78px

  // The wire: gentle swags. 3 dips across the width; the curve is quadratic
  // per third, so bulb positions can be computed with the same maths.
  const topY = 4;
  const ctrlY = 28; // control point → mid-swag dip ≈ (ctrlY - topY) / 2
  const swags = 3;
  let path = `M 0 ${topY}`;
  for (let s = 0; s < swags; s++) {
    const x1 = (w / swags) * s;
    const x2 = (w / swags) * (s + 1);
    path += ` Q ${(x1 + x2) / 2} ${ctrlY} ${x2} ${topY}`;
  }

  let bulbs = "";
  for (let i = 0; i < count; i++) {
    const x = ((i + 0.5) / count) * w;
    const seg = Math.min(swags - 1, Math.floor(x / (w / swags)));
    let t = (x - seg * (w / swags)) / (w / swags);
    t = Math.min(1, Math.max(0, t));
    const y = topY + 2 * t * (1 - t) * (ctrlY - topY); // quadratic bezier y
    const c = colors[(i * 5 + seg) % colors.length];
    const delay = ((i % 9) * 0.23).toFixed(2);
    const dur = (1.6 + ((i * 37) % 9) / 10).toFixed(2);
    bulbs +=
      '<span class="fl-bulb" style="left:' +
      x.toFixed(1) +
      "px;top:" +
      (y + 4).toFixed(1) +
      "px;--c:" +
      c +
      ";--d:" +
      delay +
      "s;--bd:" +
      dur +
      's"></span>';
  }

  holder.innerHTML =
    '<svg class="fl-wire" width="' +
    w +
    '" height="' +
    H +
    '" viewBox="0 0 ' +
    w +
    " " +
    H +
    '" fill="none" preserveAspectRatio="none"><path d="' +
    path +
    '"/></svg>' +
    bulbs;
}
let fairyResizeTimer = null;
window.addEventListener("resize", () => {
  if (!document.body.classList.contains("festive")) return;
  clearTimeout(fairyResizeTimer);
  fairyResizeTimer = setTimeout(buildFairyLights, 200);
});

/* ---------- Crackers bursting on screen (first ~14 seconds only) ---------- */
function startFireworks() {
  const canvas = document.getElementById("fireworksCanvas");
  if (!canvas) return;
  // Respect visitors who prefer less motion
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  };
  resize();
  window.addEventListener("resize", resize);

  const PALETTE = ["#ffd88a", "#c5a059", "#fff3d6", "#ffb35c", "#e86a5c", "#ffe9a8"];
  let sparks = [];
  let raf = null;
  const DURATION = 14000; // crackers stop on their own after this
  const endAt = Date.now() + DURATION;

  function burst() {
    const x = (0.15 + Math.random() * 0.7) * canvas.width;
    const y = (0.08 + Math.random() * 0.38) * canvas.height;
    const color = PALETTE[(Math.random() * PALETTE.length) | 0];
    const n = 46 + ((Math.random() * 26) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + Math.random() * 3.4) * dpr;
      sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 0.012 + Math.random() * 0.02,
        r: (1 + Math.random() * 1.8) * dpr,
        c: color,
      });
    }
  }

  function frame() {
    // soft-fade the previous frame so sparks leave a faint trail
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    sparks = sparks.filter((s) => s.life > 0);
    for (const s of sparks) {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.028 * dpr; // gravity
      s.vx *= 0.985;
      s.vy *= 0.985;
      s.life -= s.decay;
      ctx.globalAlpha = Math.max(s.life, 0);
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (Date.now() < endAt || sparks.length) {
      raf = requestAnimationFrame(frame);
    } else {
      stop();
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    window.removeEventListener("resize", resize);
  }

  // Opening salute: three quick bursts, then one every ~1.2s until the window ends
  burst();
  setTimeout(burst, 420);
  setTimeout(burst, 900);
  const iv = setInterval(() => {
    if (Date.now() >= endAt || document.hidden) {
      clearInterval(iv);
      return;
    }
    burst();
  }, 1250);
  frame();
}

/* ---------- Recently Closed ledger (dark, distinct from live listings) ---------- */
function renderClosedWall() {
  const wrap = document.getElementById("closedWall");
  const section = wrap ? wrap.closest(".closed-wall") : null;
  if (!wrap || !section) return;
  const deals = SITE_FACTS.closedDeals || [];
  if (!deals.length) {
    section.hidden = true;
    return;
  }
  wrap.innerHTML = deals
    .map(
      (d) => `
      <article class="ledger-row">
        <div class="lr-main">
          <h3 class="serif">${esc(d.title)}</h3>
          <p class="lr-locality">${esc(d.locality)}</p>
          <p class="lr-note">${esc(d.note || "")}</p>
        </div>
        <div class="lr-stamp ${d.outcome === "Leased" ? "leased" : ""}">
          <span>${esc(d.outcome || "Closed")}</span>
        </div>
      </article>`
    )
    .join("");
  section.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
}

/* ---------- Testimonials ---------- */
function renderTestimonials() {
  const wrap = document.getElementById("testimonialGrid");
  const section = wrap ? wrap.closest("#testimonials") : null;
  if (!wrap || !section) return;
  const items = SITE_FACTS.testimonials || [];
  if (!items.length) {
    section.hidden = true;
    return;
  }
  wrap.innerHTML = items
    .map(
      (t) => `
      <figure class="testimonial-card reveal">
        <span class="tq serif">“</span>
        <blockquote>${esc(t.quote)}</blockquote>
        <figcaption><strong>${esc(t.name)}</strong><span>${esc(t.area || "")}</span></figcaption>
      </figure>`
    )
    .join("");
}

/* ---------- 25+ years counter (counts up when it scrolls into view) ---------- */
function setupYearsCounter() {
  const el = document.getElementById("yearsCounter");
  if (!el) return;
  const target = Number(SITE_FACTS.yearsInBusiness) || 25;
  const run = () => {
    let n = 0;
    const tick = () => {
      n += 1;
      el.textContent = n > 0 ? `${n}+` : `${n}`;
      if (n < target) setTimeout(tick, 60);
      else el.textContent = `${target}+`;
    };
    tick();
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    },
    { threshold: 0.4 }
  );
  io.observe(el);
}

/* ---------- Validation helpers ---------- */
const RX_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const RX_MOBILE = /^[6-9]\d{9}$/; // Indian mobile: 10 digits, starts 6-9

function normalisePhone(v) {
  let d = String(v).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
const isPhone = (v) => RX_MOBILE.test(normalisePhone(v));
const isEmail = (v) => RX_EMAIL.test(String(v).trim());

function setErr(input, msg) {
  const holder = input.closest(".field, .hero-capture") || input.parentElement;
  let e = holder.querySelector(".field-error");
  if (msg) {
    if (!e) {
      e = document.createElement("p");
      e.className = "field-error";
      holder.appendChild(e);
    }
    e.textContent = msg;
    input.classList.add("invalid");
  } else if (e) {
    e.remove();
    input.classList.remove("invalid");
  }
}

/* ---------- Listings & Search / Filter logic ---------- */
let LISTINGS = [];
let activeTab = "sale"; // "sale" | "rent"
let currentCategory = "all"; // "all" | "residential" | "retail"
let searchQuery = "";

const grid = document.getElementById("listingGrid");
const rentEmpty = document.getElementById("rentEmpty");
const searchInput = document.getElementById("listingSearch");
const clearSearchBtn = document.getElementById("clearSearch");

async function loadListings() {
  try {
    const res = await fetch("/api/listings");
    const data = await res.json();
    if (data.ok && data.listings?.length) LISTINGS = data.listings;
  } catch {
    LISTINGS = [];
  }
  renderListings();
  buildSlider();
}

function getFilteredListings() {
  const query = searchQuery.trim().toLowerCase();
  return LISTINGS.filter((l) => {
    // Tab check (Buy / Rent)
    if (l.status !== activeTab) return false;

    // Category filter
    if (
      currentCategory === "residential" &&
      !l.type.toLowerCase().includes("residential")
    )
      return false;
    if (
      currentCategory === "retail" &&
      !l.type.toLowerCase().includes("retail") &&
      !l.type.toLowerCase().includes("commercial")
    )
      return false;

    // Search query
    if (query) {
      const haystack = `${l.title} ${l.location} ${l.type} ${l.price} ${(
        l.specs || []
      ).join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

function renderListings() {
  document
    .querySelectorAll(".tabs .tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));

  const items = getFilteredListings();
  if (!grid) return;
  grid.innerHTML = "";

  if (activeTab === "rent" && items.length === 0 && !searchQuery) {
    rentEmpty?.classList.remove("hidden");
  } else {
    rentEmpty?.classList.add("hidden");
  }

  if (items.length === 0 && (searchQuery || currentCategory !== "all")) {
    grid.innerHTML = `
      <div class="empty-search-results">
        <p class="serif" style="font-size: 22px; margin-bottom: 8px;">No matching ad listings found</p>
        <p style="color: var(--muted); margin-bottom: 16px;">Try adjusting your search criteria or explore our complete portfolio.</p>
        <button type="button" class="btn-solid" id="resetFiltersBtn">Reset filters</button>
      </div>`;
    document.getElementById("resetFiltersBtn")?.addEventListener("click", () => {
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      clearSearchBtn?.classList.add("hidden");
      currentCategory = "all";
      document.querySelectorAll(".filter-pills .pill").forEach((p) => {
        p.classList.toggle("active", p.dataset.cat === "all");
      });
      renderListings();
    });
    return;
  }

  items.forEach((l) => {
    const card = document.createElement("article");
    card.className = "card reveal in";

    const photoCount = (l.images && l.images.length) || 1;
    const photoBadge = photoCount > 1
      ? `<span class="card-photo-pill">🖼️ ${photoCount} Pictures</span>`
      : "";

    card.innerHTML = `
      <div class="card-media" data-open-modal="${l.id}">
        <img src="${l.image}" alt="${l.title}, ${l.location}" loading="lazy" />
        <span class="badge">${l.badge}</span>
        <div class="card-media-tags">
          ${photoBadge}
        </div>
        <div class="card-media-overlay">
          <span>View Ad Listing & Pictures &#8594;</span>
        </div>
      </div>
      <div class="card-body">
        <p class="eyebrow">${l.type} · ${l.location}</p>
        <h3 class="serif card-clickable-title" data-open-modal="${l.id}">${l.title}</h3>
        <ul class="specs">${l.specs.map((s) => `<li>${s}</li>`).join("")}</ul>
        <div class="card-foot">
          <span class="price">${l.price}</span>
          <div class="card-btns">
            <button class="link detail-link" data-open-modal="${l.id}">Ad & Pictures</button>
            <span class="btn-dot">·</span>
            <button class="link enquire-link" data-enquire="${l.title}">Enquire &#8594;</button>
          </div>
        </div>
      </div>`;
    grid.appendChild(card);
  });

  // Attach card modal click handlers
  grid.querySelectorAll("[data-open-modal]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.openModal);
      const targetListing = LISTINGS.find((l) => l.id === id);
      if (targetListing) openListingModal(targetListing);
    });
  });

  // Attach enquire click handlers
  grid.querySelectorAll("[data-enquire]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const interest = document.getElementById("cf-interest");
      const msg = document.getElementById("cf-msg");
      if (interest)
        interest.value = activeTab === "rent" ? "Renting" : "Buying";
      if (msg) msg.value = `Enquiry about: ${btn.dataset.enquire}`;
      document.getElementById("contact").scrollIntoView({ behavior: "smooth" });
    })
  );
}

// Search and filter listeners
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    clearSearchBtn?.classList.toggle("hidden", !searchQuery);
    renderListings();
  });
}
if (clearSearchBtn) {
  clearSearchBtn.addEventListener("click", () => {
    searchQuery = "";
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    renderListings();
  });
}

document.querySelectorAll(".filter-pills .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    if (pill.dataset.cat) {
      currentCategory = pill.dataset.cat;
      document
        .querySelectorAll(".filter-pills [data-cat]")
        .forEach((p) => p.classList.toggle("active", p === pill));
      renderListings();
    }
  });
});

document.querySelectorAll(".tabs .tab").forEach((t) =>
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    renderListings();
  })
);
document.querySelectorAll("[data-tab-link]").forEach((a) =>
  a.addEventListener("click", () => {
    activeTab = a.dataset.tabLink;
    renderListings();
  })
);

/* ---------- Property Details & Picture Lightbox Modal ---------- */
const modal = document.getElementById("listingModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalBody = document.getElementById("modalBody");

function openListingModal(l) {
  if (!modal || !modalBody) return;
  const images = (l.images && l.images.length) ? l.images : [l.image];
  let activeImgIndex = 0;

  function renderModalContent() {
    modalBody.innerHTML = `
      <div class="modal-layout">
        <!-- Media Column: Full-Height Ad Creative & Pictures -->
        <div class="modal-media-pane">
          <div class="modal-photo-stage">
            <img src="${images[activeImgIndex]}" alt="${l.title}" id="modalMainPhoto" class="modal-active-img" />
            ${
              images.length > 1
                ? `
              <button type="button" class="modal-nav-arrow prev" id="modalPrevPhoto" aria-label="Previous image">&#8592;</button>
              <button type="button" class="modal-nav-arrow next" id="modalNextPhoto" aria-label="Next image">&#8594;</button>
              <span class="modal-photo-counter">${activeImgIndex + 1} / ${images.length}</span>
              `
                : ""
            }
          </div>
          ${
            images.length > 1
              ? `
            <div class="modal-thumb-strip">
              ${images
                .map(
                  (img, idx) => `
                <button type="button" class="m-thumb ${idx === activeImgIndex ? "active" : ""}" data-idx="${idx}">
                  <img src="${img}" alt="Thumbnail ${idx + 1}" />
                </button>
              `
                )
                .join("")}
            </div>`
              : ""
          }
        </div>

        <!-- Details Column -->
        <div class="modal-details-pane">
          <div class="modal-head">
            <p class="eyebrow">${l.type} · ${l.location}</p>
            <h2 class="serif modal-title">${l.title}</h2>
            <div class="modal-price-line">
              <span class="modal-price">${l.price}</span>
              <span class="modal-badge">${l.badge}</span>
            </div>
          </div>

          ${
            l.description
              ? `<div class="modal-description"><p>${l.description}</p></div>`
              : ""
          }

          <div class="modal-section">
            <h4 class="modal-subhead">Property Specifications</h4>
            <ul class="modal-spec-list">
              ${(l.specs || []).map((s) => `<li>${s}</li>`).join("")}
            </ul>
          </div>

          ${
            l.features && l.features.length
              ? `
            <div class="modal-section">
              <h4 class="modal-subhead">Key Highlights</h4>
              <div class="modal-feature-pills">
                ${l.features.map((f) => `<span class="feat-pill">${f}</span>`).join("")}
              </div>
            </div>`
              : ""
          }

          <div class="modal-ctas">
            <a
              href="https://wa.me/919810333886?text=${encodeURIComponent(
                `Hello Vipul, I am inquiring about: ${l.title} in ${l.location} (${l.price}). Could you please share more pictures or schedule a private viewing?`
              )}"
              target="_blank"
              rel="noopener"
              class="btn-solid whatsapp-cta"
            >
              💬 WhatsApp Vipul Agnihotri
            </a>
            <button type="button" class="btn-ghost dark modal-visit-btn" id="modalVisitBtn">
              Book Private Site Visit
            </button>
          </div>
        </div>
      </div>
    `;

    // Arrow navigation
    document.getElementById("modalPrevPhoto")?.addEventListener("click", () => {
      activeImgIndex = (activeImgIndex - 1 + images.length) % images.length;
      renderModalContent();
    });
    document.getElementById("modalNextPhoto")?.addEventListener("click", () => {
      activeImgIndex = (activeImgIndex + 1) % images.length;
      renderModalContent();
    });

    // Thumbnail navigation
    modalBody.querySelectorAll(".m-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        activeImgIndex = Number(thumb.dataset.idx);
        renderModalContent();
      });
    });

    // Book site visit action
    document.getElementById("modalVisitBtn")?.addEventListener("click", () => {
      closeListingModal();
      const interest = document.getElementById("cf-interest");
      const msg = document.getElementById("cf-msg");
      if (interest) interest.value = "Consultation";
      if (msg)
        msg.value = `Request for private site visit: ${l.title} (${l.location})`;
      document.getElementById("contact").scrollIntoView({ behavior: "smooth" });
    });
  }

  renderModalContent();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden"; // lock scroll
}

function closeListingModal() {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (modalBody) modalBody.innerHTML = "";
}

modalClose?.addEventListener("click", closeListingModal);
modalBackdrop?.addEventListener("click", closeListingModal);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal?.classList.contains("open")) {
    closeListingModal();
  }
});

/* ---------- Showcase slider ---------- */
const slidesEl = document.getElementById("slides");
const dotsEl = document.getElementById("dots");
const toggleBtn = document.getElementById("slideToggle");
let current = 0,
  timer = null,
  playing = true,
  sliderBuilt = false;

function buildSlider() {
  if (!slidesEl || sliderBuilt) return;
  slidesEl.innerHTML = "";
  dotsEl.innerHTML = "";
  if (!LISTINGS.length) return;
  sliderBuilt = true;

  LISTINGS.forEach((l, i) => {
    const s = document.createElement("div");
    s.className = "slide" + (i === 0 ? " active" : "");
    s.style.backgroundImage = `url('${l.image.replace("/1400/900", "/1800/1000")}')`;
    s.innerHTML = `
      <div class="slide-caption">
        <p class="eyebrow">${l.location}</p>
        <h3>${l.title}</h3>
        <p class="slide-meta">${l.type} &nbsp;·&nbsp; ${l.price}</p>
        <button class="slide-link" data-goto-id="${l.id}">View listing &nbsp;&#8594;</button>
      </div>`;
    slidesEl.appendChild(s);

    const d = document.createElement("button");
    d.className = i === 0 ? "active" : "";
    d.setAttribute("aria-label", `Slide ${i + 1}`);
    d.addEventListener("click", () => go(i));
    dotsEl.appendChild(d);
  });

  slidesEl.querySelectorAll("[data-goto-id]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = Number(b.dataset.gotoId);
      const target = LISTINGS.find((l) => l.id === id);
      if (target) openListingModal(target);
      else document.getElementById("properties").scrollIntoView({ behavior: "smooth" });
    })
  );

  if (playing) play();
}

function go(i) {
  if (!LISTINGS.length) return;
  const slides = slidesEl.children,
    dots = dotsEl.children;
  slides[current].classList.remove("active");
  dots[current].classList.remove("active");
  current = (i + LISTINGS.length) % LISTINGS.length;
  slides[current].classList.add("active");
  dots[current].classList.add("active");
}

function play() {
  timer = setInterval(() => go(current + 1), 6000);
  playing = true;
  if (toggleBtn) toggleBtn.innerHTML = "&#10074;&#10074;";
}
function pause() {
  clearInterval(timer);
  playing = false;
  if (toggleBtn) toggleBtn.innerHTML = "&#9654;";
}
if (toggleBtn)
  toggleBtn.addEventListener("click", () => (playing ? pause() : play()));

loadListings();

/* ---------- 100% FREE AI Property Matcher ("Find Your Fit") ---------- */
const EXPLORER_STEPS = [
  {
    key: "intent",
    q: "What is your primary investment or residential goal?",
    options: [
      { v: "retail", l: "Commercial High-Street Retail (M3M Urbana)" },
      { v: "floor", l: "Bespoke Builder Floor (South Delhi)" },
      { v: "villa", l: "Luxury Independent Villa (DLF Phase 1)" },
      { v: "rent", l: "Curated Luxury Rental" },
    ],
  },
  {
    key: "area",
    q: "Target micro-market preference",
    options: [
      { v: "gurugram", l: "Gurugram (Golf Course Rd / Sector 67)" },
      { v: "south delhi", l: "South Delhi Prime (GK, Defence Colony)" },
      { v: "any", l: "Open to prime opportunities in both" },
    ],
  },
  {
    key: "budget",
    q: "Target capital allocation bracket",
    options: [
      { v: "1.5-2.5cr", l: "₹ 1.5 Cr – ₹ 2.5 Cr (Boutique Commercial)" },
      { v: "4-6cr", l: "₹ 4 Cr – ₹ 6 Cr (Luxury Floor)" },
      { v: "10cr+", l: "₹ 10 Cr+ (Trophy Independent Villa)" },
    ],
  },
  {
    key: "timeline",
    q: "Acquisition timeline & priority",
    options: [
      { v: "now", l: "Immediate acquisition (Pre-leased / Ready to move)" },
      { v: "quarter", l: "Strategic investment review (1–3 months)" },
      { v: "exploring", l: "Discreet portfolio exploration" },
    ],
  },
];

const explorerAnswers = {};
let explorerIndex = 0;
const explorerStepEl = document.getElementById("explorerStep");
const explorerResultEl = document.getElementById("explorerResult");
const explorerProgressEl = document.getElementById("explorerProgress");

function renderExplorerStep() {
  if (!explorerStepEl) return;
  const step = EXPLORER_STEPS[explorerIndex];
  explorerProgressEl.textContent = `Step ${explorerIndex + 1} of ${EXPLORER_STEPS.length}`;
  explorerStepEl.innerHTML = `
    <h3 class="serif">${step.q}</h3>
    <div class="explorer-options">
      ${step.options
        .map(
          (o) =>
            `<button type="button" class="explorer-opt" data-v="${o.v}">${o.l}</button>`
        )
        .join("")}
    </div>`;
  explorerStepEl.querySelectorAll(".explorer-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      explorerAnswers[step.key] = btn.dataset.v;
      explorerIndex += 1;
      if (explorerIndex >= EXPLORER_STEPS.length) finishExplorer();
      else renderExplorerStep();
    });
  });
}

async function finishExplorer() {
  explorerStepEl.classList.add("hidden");
  explorerResultEl.classList.remove("hidden");
  explorerResultEl.innerHTML =
    '<p class="explorer-loading">Analyzing portfolio & matching optimal ad listings…</p>';
  try {
    const res = await fetch("/api/explorer/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(explorerAnswers),
    });
    const data = await res.json();
    const cards = (data.listings || [])
      .map(
        (l, i) => `
      <article class="explorer-match">
        <img src="${l.image}" alt="${l.title}" loading="lazy" class="em-flyer-thumb" />
        <div>
          <div class="match-badge">${data.matchScores?.[i] || 98}% Strategic Fit</div>
          <h4 class="serif">${l.title}</h4>
          <p class="em-meta">${l.location} · <strong>${l.price}</strong></p>
          <div class="em-actions">
            <button type="button" class="btn-solid-sm" data-modal-explorer="${l.id}">View Ad & Pictures</button>
            <a href="https://wa.me/919810333886?text=${encodeURIComponent(
              `Hello Vipul, I matched with ${l.title} (${l.location}) through your AI taste quiz. Could you share more details?`
            )}" target="_blank" rel="noopener" class="link-sm">💬 WhatsApp Vipul</a>
          </div>
        </div>
      </article>`
      )
      .join("");
    const areas = (data.suggestedAreas || [])
      .map((a) => `<span class="area-chip">${a}</span>`)
      .join("");
    explorerResultEl.innerHTML = `
      <p class="explorer-summary">${data.summary || ""}</p>
      ${data.tip ? `<p class="explorer-tip">💡 ${data.tip}</p>` : ""}
      <div class="explorer-matches">${cards || "<p>Register your requirement — we will shortlist off-market options for you.</p>"}</div>
      ${areas ? `<p class="eyebrow">Prime Micro-Markets to Consider</p><div class="area-chips">${areas}</div>` : ""}
      <div style="margin-top: 24px;">
        <button type="button" class="btn-ghost dark" id="explorerRestart">Start over</button>
      </div>`;

    // View Modal
    explorerResultEl.querySelectorAll("[data-modal-explorer]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = Number(b.dataset.modalExplorer);
        const match = LISTINGS.find((l) => l.id === id);
        if (match) openListingModal(match);
      })
    );

    document.getElementById("explorerRestart")?.addEventListener("click", () => {
      explorerIndex = 0;
      Object.keys(explorerAnswers).forEach((k) => delete explorerAnswers[k]);
      explorerResultEl.classList.add("hidden");
      explorerStepEl.classList.remove("hidden");
      renderExplorerStep();
    });
  } catch {
    explorerResultEl.innerHTML =
      '<p>Something went wrong. Please connect with our team directly via WhatsApp or Phone.</p>';
  }
}

if (explorerStepEl) renderExplorerStep();

/* ---------- CTA buttons that preset the contact form ---------- */
document.querySelectorAll("[data-intent]").forEach((btn) =>
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const sel = document.getElementById("cf-interest");
    if (sel) sel.value = btn.dataset.intent;
    document.getElementById("contact").scrollIntoView({ behavior: "smooth" });
  })
);

/* ---------- Area cards: ask the concierge / see listings ---------- */
document.querySelectorAll("[data-area-ask]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const q = btn.dataset.areaAsk;
    if (chatPanel && !chatPanel.classList.contains("open")) openChat();
    setTimeout(() => handleUser(q), chatPanel.classList.contains("open") ? 350 : 650);
  })
);

document.querySelectorAll("[data-area-listings]").forEach((link) =>
  link.addEventListener("click", (e) => {
    // Let the browser jump to #properties, then filter the grid to that area
    setTimeout(() => {
      const area = (link.dataset.areaListings || "").toLowerCase();
      const input = document.getElementById("listingSearch");
      const clear = document.getElementById("clearSearch");
      if (!input) return;
      searchQuery = area;
      input.value = area;
      clear?.classList.remove("hidden");
      renderListings();
    }, 120);
  })
);

/* ---------- Lead API ---------- */
async function postLead(payload) {
  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Network error — please call or WhatsApp us." };
  }
}

/* ---------- Hero callback form ---------- */
const heroForm = document.getElementById("heroForm");
if (heroForm) {
  heroForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = heroForm.contact;
    const v = input.value.trim();
    setErr(input, null);

    let payload,
      err = null;
    if (v.includes("@")) {
      if (!isEmail(v)) err = "Please enter a valid email address.";
      else payload = { email: v };
    } else {
      if (!isPhone(v))
        err = "Please enter a valid 10-digit Indian mobile number.";
      else payload = { phone: normalisePhone(v) };
    }
    if (err) {
      setErr(input, err);
      return;
    }

    const data = await postLead({
      ...payload,
      interest: "General",
      source: "hero callback",
    });
    if (data.ok) {
      heroForm.reset();
      heroForm.querySelector(".hero-note").textContent =
        "Thank you — our founding team will reach out within 24 hours.";
    } else {
      setErr(
        input,
        data.error || "Something went wrong. Please call us directly."
      );
    }
  });
}

/* ---------- Contact form ---------- */
const contactForm = document.getElementById("contactForm");
if (contactForm) {
  const cfPhone = contactForm.phone;
  cfPhone.maxLength = 13;

  cfPhone.addEventListener("input", () => {
    cfPhone.value = cfPhone.value.replace(/[^\d+\s-]/g, "");
    setErr(cfPhone, null);
  });
  contactForm.name.addEventListener("input", () =>
    setErr(contactForm.name, null)
  );
  contactForm.email.addEventListener("input", () =>
    setErr(contactForm.email, null)
  );

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("formStatus");
    const btn = document.getElementById("contactSubmit");
    statusEl.textContent = "";
    setErr(contactForm.name, null);
    setErr(cfPhone, null);
    setErr(contactForm.email, null);

    let ok = true;
    if (contactForm.name.value.trim().length < 2) {
      setErr(contactForm.name, "Please enter your name.");
      ok = false;
    }
    if (!isPhone(cfPhone.value)) {
      setErr(cfPhone, "Please enter a valid 10-digit Indian mobile number.");
      ok = false;
    }
    if (contactForm.email.value.trim() && !isEmail(contactForm.email.value)) {
      setErr(contactForm.email, "Please enter a valid email address.");
      ok = false;
    }
    if (!ok) return;

    btn.disabled = true;
    const data = await postLead({
      name: contactForm.name.value.trim(),
      phone: normalisePhone(cfPhone.value),
      email: contactForm.email.value.trim(),
      interest: contactForm.interest.value,
      message: contactForm.message.value,
      source: "website contact form",
    });
    if (data.ok) {
      contactForm.reset();
      statusEl.textContent =
        "Thank you. Vipul Agnihotri will personally reach out within 24 hours.";
    } else {
      statusEl.textContent =
        data.error || "Something went wrong. Please call or WhatsApp us.";
    }
    btn.disabled = false;
  });
}

/* ---------- AI Concierge Chat Assistant (100% Free Built-in) ---------- */
const chatFloat = document.getElementById("chatFloat");
const chatPanel = document.getElementById("chatPanel");
const chatClose = document.getElementById("chatClose");
const chatBody = document.getElementById("chatBody");
const chatChips = document.getElementById("chatChips");
const chatForm = document.getElementById("chatForm");
const chatText = document.getElementById("chatText");

let chatHistory = [];
let awaiting = null;
let chatLead = {};
let greeted = false;
let lastRecTitles = [];

/* ---------- Conversation-flow intent helpers (mirror server logic) ----------
   These keep the concierge coherent even when the AI backend is unreachable:
   "yes please" after an offer opens lead capture, a locality answer is
   acknowledged instead of restarting the conversation. */
const CHAT_AFFIRM_RX =
  /^(yes|yep|yeah|ya|haan|haan\s?ji|hanji|ok|okay|sure|please|pls|plz|kindly|why not|of course|certainly|definitely|absolutely|sounds good|sounds great|great|perfect|interested|book it|arrange it|do it|i would like that|i would love that|i'?d like that|i'?d love that)\b/i;
const CHAT_NEGATIVE_RX =
  /^(no|nope|nah|nahi|not now|no thanks|no thank you|not interested|maybe later)\b/i;
const CHAT_OFFER_RX =
  /(arrange|schedule|coordinate|inspection|site visit|private viewing|viewing|floor plans|consultation|callback|connect with you|reach out|note your (contact|number)|share matching options)/i;
const CHAT_TOPIC_RX =
  /\b(villas?|floors?|shops?|retail|commercial|bhk|rent|lease|tenant|budget|crore|cr|lakh|lac|sector|colony|kailash|vihar|niketan|dlf|price|valuation|sell|selling|picture|photo)s?\b/i;
const CHAT_LOCALITY_RX =
  /(colony|kailash|vihar|kunj|niketan|golf links|jor bagh|green park|hauz khas|safdarjung|pamposh|geetanjali|chanakyapuri|friends colony|cr park|kalkaji|malviya nagar|golf course|sohna|dlf|cyber city|sushant lok|south city|mg road|sector\s*\d+|gurugram|gurgaon|delhi)/i;
const MONEY_RX = /(\d+\s?(cr|crore|lakh|lac)|budget|₹|rs\.?\s?\d|price range)/i;
const NAME_RX = /^[a-z][a-z .'-]{1,39}$/i;

function lastBotText() {
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "assistant") return chatHistory[i].content || "";
  }
  return "";
}
const isAffirmative = (t) => {
  const s = String(t).trim();
  return s.length <= 30 && CHAT_AFFIRM_RX.test(s) && !CHAT_TOPIC_RX.test(s);
};
const isNegative = (t) => {
  const s = String(t).trim();
  return s.length <= 30 && CHAT_NEGATIVE_RX.test(s);
};

function deriveInterest() {
  if (lastRecTitles.length) {
    return ("Site Visit — " + lastRecTitles[lastRecTitles.length - 1]).slice(0, 60);
  }
  const last = lastBotText().toLowerCase();
  if (/m3m|urbana|retail|commercial|shop/.test(last))
    return "Commercial Retail — M3M Urbana";
  if (/villa|dlf|pool/.test(last)) return "Luxury Villa — DLF Phase 1";
  if (/floor|greater kailash|south delhi|defence colony/.test(last))
    return "South Delhi Builder Floor";
  if (/rent/.test(last)) return "Luxury Rental Enquiry";
  if (/valuation|sell/.test(last)) return "Sell / Valuation";
  return "AI Concierge Consultation";
}

function buildChatLeadMessage() {
  let m = "Enquiry via AI Concierge — " + (chatLead.interest || "Consultation");
  if (chatLead.prefs && chatLead.prefs.length) {
    m += " — Preferences: " + chatLead.prefs.join("; ");
  }
  return m.slice(0, 2000);
}

/* Capture started by the client itself (guest said "yes" to an offer) */
function startLeadCapture() {
  awaiting = "name";
  chatLead = { interest: deriveInterest(), prefs: [] };
  showChips([]);
  botSay(
    "Wonderful. May I have your good name, and the best 10-digit mobile number or email for Vipul Agnihotri to coordinate with you discreetly?"
  );
}

/* Capture announced by the server (action: "start_capture") — the reply that
   asks for the name has already been printed by respondWithAI. */
function beginCaptureFromServer() {
  if (awaiting) return;
  awaiting = "name";
  chatLead = { interest: deriveInterest(), prefs: [] };
  showChips([]);
}

const DEFAULT_CHIPS = [
  "M3M Urbana Retail",
  "GK-1 Builder Floor",
  "DLF Villa",
  "Find your fit",
  "WhatsApp Vipul",
];

function addMsg(text, who, html = false) {
  const d = document.createElement("div");
  d.className = "msg " + who;
  if (html) d.innerHTML = text;
  else d.textContent = text;
  chatBody.appendChild(d);
  chatBody.scrollTop = chatBody.scrollHeight;
  return d;
}
const botSay = (text, html = false) => addMsg(text, "bot", html);

function showTyping() {
  const t = document.createElement("div");
  t.className = "msg bot typing";
  t.innerHTML = "<span></span><span></span><span></span>";
  chatBody.appendChild(t);
  chatBody.scrollTop = chatBody.scrollHeight;
  return t;
}

function showChips(list) {
  chatChips.innerHTML = "";
  (list || []).forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => {
      showChips([]);
      if (c === "WhatsApp Vipul") {
        window.open("https://wa.me/919810333886", "_blank");
        return;
      }
      handleUser(c);
    });
    chatChips.appendChild(b);
  });
}

function renderRecCardInChat(listing) {
  const rec = document.createElement("div");
  rec.className = "chat-listing-card";
  rec.innerHTML = `
    <img src="${listing.image}" alt="${listing.title}" class="chat-listing-img" />
    <div class="chat-listing-info">
      <span class="chat-listing-badge">${listing.badge || listing.type}</span>
      <h5 class="serif">${listing.title}</h5>
      <p class="chat-listing-loc">${listing.location}</p>
      <div class="chat-listing-foot">
        <span class="chat-listing-price">${listing.price}</span>
        <button type="button" class="chat-listing-view-btn" data-modal="${listing.id}">View Ad & Pictures &#8594;</button>
      </div>
    </div>
  `;
  rec.querySelector(".chat-listing-view-btn").addEventListener("click", () => {
    openListingModal(listing);
  });
  chatBody.appendChild(rec);
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function respondWithAI(text) {
  const t = showTyping();
  let reply = null;
  let recommendedListings = [];
  let action = null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...chatHistory.slice(-10)] }),
    });
    const d = await res.json();
    if (d.ok) {
      reply = d.reply;
      recommendedListings = d.recommendedListings || [];
      action = d.action || null;
    }
  } catch {
    /* fallback */
  }

  t.remove();

  // Safety net: the welcome must never repeat mid-conversation
  if (
    reply &&
    /welcome to providers real estate|how may i assist your property search today/i.test(
      reply
    ) &&
    chatHistory.filter((m) => m.role === "user").length > 1
  ) {
    reply =
      "So I may curate precisely — which location (South Delhi or Gurugram) and budget range should I focus on? I can also arrange a private consultation with Vipul Agnihotri.";
  }

  if (reply) {
    botSay(reply);
    chatHistory.push({ role: "assistant", content: reply });

    if (recommendedListings.length) {
      recommendedListings.forEach((rec) => renderRecCardInChat(rec));
      lastRecTitles = recommendedListings.map((r) => r.title);
    }

    if (action === "start_capture") {
      beginCaptureFromServer();
    } else {
      showChips(DEFAULT_CHIPS);
    }
  } else {
    botSay(
      'Our advisors are available directly on Call or WhatsApp at +91 98103 33886 or <a href="mailto:vipulproviders@gmail.com">vipulproviders@gmail.com</a>.',
      true
    );
    showChips(DEFAULT_CHIPS);
  }
}

async function handleUser(raw) {
  const text = raw.trim();
  if (!text) return;
  addMsg(text, "user");
  chatHistory.push({ role: "user", content: text });

  if (awaiting === "name") {
    handleNameStep(text);
    return;
  }
  if (awaiting === "contact") {
    handleContactStep(text);
    return;
  }

  // Guest accepted an earlier offer (inspection / viewing / callback) →
  // start capture locally — no round-trip, works even if the AI is down.
  if (isAffirmative(text) && CHAT_OFFER_RX.test(lastBotText())) {
    startLeadCapture();
    return;
  }

  respondWithAI(text);
}

function handleNameStep(text) {
  const t = text.trim();

  // Contact details given right away — accept them and move on
  if (isPhone(t) || t.includes("@")) {
    awaiting = "contact";
    handleContactStep(t);
    return;
  }
  // A preference (locality / budget) instead of a name — remember it
  if (MONEY_RX.test(t) || CHAT_LOCALITY_RX.test(t)) {
    chatLead.prefs.push(t.slice(0, 120));
    botSay("Noted, thank you. And your good name? (You may also type 'skip')");
    return;
  }
  if (/^skip$/i.test(t)) {
    chatLead.name = "";
    awaiting = "contact";
    botSay(
      "No problem. What is the best 10-digit mobile number or email for Vipul Agnihotri to connect with you?"
    );
    return;
  }
  if (!NAME_RX.test(t)) {
    botSay("Could you kindly share your name (or type 'skip')?");
    return;
  }
  chatLead.name = t.slice(0, 120);
  awaiting = "contact";
  botSay(
    `Thank you, ${chatLead.name.split(" ")[0]}. And the best 10-digit mobile number or email for Vipul Agnihotri to connect with you?`
  );
}

async function handleContactStep(text) {
  const t = text.trim();

  // Guest typed words here instead of contact details — slot-fill gracefully
  if (!/\d/.test(t) && !t.includes("@")) {
    if (MONEY_RX.test(t) || CHAT_LOCALITY_RX.test(t)) {
      chatLead.prefs.push(t.slice(0, 120));
      botSay(
        "Noted. And the best 10-digit mobile number or email for Vipul Agnihotri?"
      );
    } else if (!chatLead.name && NAME_RX.test(t)) {
      chatLead.name = t.slice(0, 120);
      botSay(
        `Thank you, ${chatLead.name.split(" ")[0]}. And the best 10-digit mobile number or email?`
      );
    } else {
      botSay(
        "Please share a valid 10-digit Indian mobile number or an email address."
      );
    }
    return;
  }

  const payload = {};
  let err = null;
  const emailMatch = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

  if (emailMatch) {
    if (!isEmail(emailMatch[0]))
      err = "Please check the email address and try again.";
    else payload.email = emailMatch[0];
  } else if (/\d/.test(t)) {
    if (!isPhone(t))
      err = "Please enter a valid 10-digit Indian mobile number.";
    else payload.phone = normalisePhone(t);
  } else {
    err = "Please enter a valid 10-digit Indian mobile number or an email address.";
  }

  if (err) {
    botSay(err);
    return;
  }

  const data = await postLead({
    name: chatLead.name || "",
    ...payload,
    interest: chatLead.interest || "AI Concierge Consultation",
    message: buildChatLeadMessage(),
    source: "AI Chatbot",
  });

  if (data.ok) {
    awaiting = null;
    const first = chatLead.name ? chatLead.name.split(" ")[0] : "";
    const prefLine =
      chatLead.prefs && chatLead.prefs.length
        ? ` I have also noted your preferences (${chatLead.prefs.join(", ")}).`
        : "";
    botSay(
      `Confirmed${first ? ", " + first : ""}. Vipul Agnihotri will personally reach out within 24 hours regarding ${chatLead.interest}.${prefLine} Would you like to review any particular property ad in the meantime?`
    );
    showChips(DEFAULT_CHIPS);
    chatLead = {};
  } else {
    botSay(
      data.error ||
        "We could not record your details. Please call or WhatsApp us at +91 98103 33886."
    );
  }
}

chatForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = chatText.value;
  chatText.value = "";
  handleUser(v);
});

function openChat() {
  chatPanel.classList.add("open");
  if (!greeted) {
    greeted = true;
    setTimeout(() => {
      botSay(
        "Namaste! 🙏 Welcome to Providers Real Estate Concierge. I can assist you with our curated South Delhi and Gurugram portfolio, commercial retail investments at M3M Urbana, or schedule a private consultation. How can I help you today?"
      );
      showChips(DEFAULT_CHIPS);
    }, 300);
  }
  setTimeout(() => chatText.focus(), 350);
}

chatFloat?.addEventListener("click", openChat);
chatClose?.addEventListener("click", () => chatPanel.classList.remove("open"));

/* ---------- Mobile nav & scroll reveal ---------- */
const burger = document.getElementById("burger"),
  nav = document.getElementById("nav");
burger?.addEventListener("click", () => {
  nav.classList.toggle("open");
  burger.classList.toggle("open");
  burger.setAttribute("aria-expanded", nav.classList.contains("open"));
});
nav
  ?.querySelectorAll("a")
  .forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      burger?.classList.remove("open");
    })
  );

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Builder ticker: duplicate the names once for a seamless loop ---------- */
(function setupBuilderTicker() {
  const track = document.getElementById("tickerTrack");
  if (!track) return;
  track.innerHTML += track.innerHTML; // second copy → translateX(-50%) loops perfectly
})();

/* ---------- Little AI host on the Find-Your-Fit section ----------
   Waves for a few seconds when the section scrolls into view, then docks. */
function setupAiBot() {
  const bot = document.getElementById("aiBot");
  const host = bot ? bot.closest(".explorer-in") : null;
  if (!bot || !host) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    host.classList.add("is-lit"); // show it statically, no theatre
    return;
  }
  const io2 = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io2.disconnect();
        host.classList.add("is-lit");
        bot.classList.add("wave");
        setTimeout(() => bot.classList.add("is-docked"), 6800); // a few seconds, then away
      });
    },
    { threshold: 0.3 }
  );
  io2.observe(host);
}
setupAiBot();

/* ---------- Render the Edit-Me sections ---------- */
renderClosedWall();
renderTestimonials();
setupYearsCounter();
