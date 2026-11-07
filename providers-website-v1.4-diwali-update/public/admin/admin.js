/* ============ Providers Real Estate — Dashboard & Brokerage Firm OS ============ */

const STATUSES = [
  "new",
  "contacted",
  "site visit",
  "negotiation",
  "closed",
  "lost",
];

const MARKETING_STAGES = [
  "needs ad",
  "ad ready",
  "published",
  "negotiation",
  "closed",
];

// App State
let me = null;
let stats = {};
let leads = [];
let listings = [];
let visits = [];
let campaigns = [];
let activity = [];

/* iPhone photos often arrive as HEIC (.heic/.heif). They upload fine, but
   Chrome/Edge/Firefox cannot display them — buyers would see broken images.
   Warn early and skip them, with a one-line how-to-fix. */
function splitHeic(files) {
  const ok = [];
  let heic = 0;
  for (const f of files) {
    if (/\.hei[cf]$/i.test(f.name || "") || /image\/hei[cf]/i.test(f.type || "")) {
      heic++;
    } else ok.push(f);
  }
  if (heic)
    toast(
      `${heic} photo${heic > 1 ? "s" : ""} skipped: iPhone HEIC files don't display in browsers. Fix once on the iPhone: Settings → Camera → Formats → Most Compatible (or export as JPEG from Photos), then re-upload.`
    );
  return ok;
}

let leadFilter = "all";
let leadSearchQuery = "";
let activeKanbanMode = "leads"; // "leads" | "listings"
let activeView = "overview";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );

async function api(url, opts = {}) {
  const isFormData = opts.body instanceof FormData;
  const headers = isFormData ? {} : { "Content-Type": "application/json" };

  const res = await fetch(url, {
    headers: { ...headers, ...(opts.headers || {}) },
    ...opts,
  });

  if (res.status === 401) {
    location.href = "/login";
    throw new Error("Unauthorized");
  }
  return res.json();
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    me = await api("/api/admin/me");
  } catch {
    return;
  }
  if (!me || !me.ok) {
    location.replace("/login");
    return;
  }

  $("#who").textContent = `Signed in as ${me.name}`;
  if ($("#roleBadge")) {
    $("#roleBadge").textContent = me.role.toUpperCase();
    $("#roleBadge").classList.toggle("viewer", me.role === "viewer");
  }

  setupNavigation();
  setupQuickActions();
  setupModals();
  setupLeadCRM();
  setupListingManagement();
  setupSiteVisits();
  setupEmailMarketing();
  setupKanban();
  setupAdStudio();
  setupPasswordForm();
  setupPersonalSettings();

  $("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    location.href = "/login";
  });

  await refreshAllData();

  // Personal landing view (Personal Settings preference)
  const prefs = loadPrefs();
  if (prefs.landing && prefs.landing !== "overview") {
    switchView(prefs.landing);
  }
}

async function refreshAllData() {
  try {
    const [s, l, props, v, c, act] = await Promise.all([
      api("/api/admin/stats"),
      api("/api/admin/leads"),
      api("/api/admin/listings"),
      api("/api/admin/site-visits"),
      api("/api/admin/email-campaigns"),
      api("/api/admin/activity?limit=50"),
    ]);

    stats = s;
    leads = l.leads || [];
    listings = props.listings || [];
    visits = v.visits || [];
    campaigns = c.campaigns || [];
    activity = act.activity || [];

    // Update Leads badge
    if ($("#leadsCountBadge")) {
      $("#leadsCountBadge").textContent = leads.length;
    }

    renderOverview();
    renderLeads();
    renderKanban();
    renderListings();
    renderVisits();
    renderCampaignTemplates();
    renderReminders();
    renderActivity();
    renderAiOptions();
    renderAdStudioOptions();
  } catch (err) {
    console.error("Data refresh failed", err);
  }
}

/* ---------- Toast notifications ---------- */
let toastTimer = null;
function toast(msg) {
  const el = $("#adminToast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3400);
}

/* ---------- Personal Settings: account, preferences, activity ---------- */
const PREFS_KEY = "providers_admin_prefs_v1";

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode — ignore */
  }
}

function applyPrefs() {
  const p = loadPrefs();
  document.body.classList.toggle("compact-rows", !!p.compact);
  if ($("#prefCompact")) $("#prefCompact").checked = !!p.compact;
  if ($("#prefConfirm")) $("#prefConfirm").checked = p.confirm !== false;
  if ($("#prefLanding")) $("#prefLanding").value = p.landing || "overview";
}

function setupPersonalSettings() {
  applyPrefs();

  if (me) {
    if ($("#acctName")) $("#acctName").textContent = me.name || "—";
    if ($("#acctUsername")) $("#acctUsername").textContent = me.username || "—";
    if ($("#acctRole"))
      $("#acctRole").textContent =
        me.role === "admin"
          ? "Admin — full access"
          : me.role === "viewer"
          ? "Viewer — read-only"
          : "Editor";
  }

  $("#prefCompact")?.addEventListener("change", (e) => {
    const p = loadPrefs();
    p.compact = e.target.checked;
    savePrefs(p);
    applyPrefs();
    toast(e.target.checked ? "Compact tables on." : "Comfortable tables on.");
  });

  $("#prefConfirm")?.addEventListener("change", (e) => {
    const p = loadPrefs();
    p.confirm = e.target.checked;
    savePrefs(p);
    toast(
      e.target.checked
        ? "Delete confirmations are ON."
        : "Delete confirmations are OFF — deletions are instant."
    );
  });

  $("#prefLanding")?.addEventListener("change", (e) => {
    const p = loadPrefs();
    p.landing = e.target.value;
    savePrefs(p);
    toast(`You will land on “${e.target.selectedOptions[0].textContent}” next sign-in.`);
  });

  $("#activityScope")?.addEventListener("change", renderActivity);
}

function askConfirm(message) {
  const p = loadPrefs();
  if (p.confirm === false) return true;
  return confirm(message);
}

/* ---------- Navigation ---------- */
function setupNavigation() {
  $$(".shelf-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetView = btn.dataset.view;
      switchView(targetView);
    });
  });
}

function switchView(viewName) {
  activeView = viewName;
  $$(".shelf-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === viewName)
  );
  $$(".view-panel").forEach((p) => {
    p.classList.toggle("hidden", p.id !== `view-${viewName}`);
  });

  if (viewName === "kanban") renderKanban();
  if (viewName === "email-marketing") updateEmailLivePreview();
}

function setupQuickActions() {
  $("#btnQuickAddLead")?.addEventListener("click", () => openLeadModal());
  $("#btnQuickAddListing")?.addEventListener("click", () => openListingModal());
  $("#btnQuickScheduleVisit")?.addEventListener("click", () => openVisitModal());
  $("#btnQuickEmail")?.addEventListener("click", () => switchView("email-marketing"));
  $("#btnViewAllLeads")?.addEventListener("click", () => switchView("leads"));
  $("#btnViewAllVisits")?.addEventListener("click", () => switchView("visits"));
}

/* ---------- 1. Overview Section ---------- */
function renderOverview() {
  const kpis = [
    { num: stats.total || leads.length, label: "Total Leads", icon: "👥" },
    { num: stats.byStatus?.new || 0, label: "New Inquiries", icon: "🔥" },
    { num: stats.scheduledVisits || 0, label: "Scheduled Visits", icon: "📅" },
    { num: stats.byStatus?.negotiation || 0, label: "In Negotiation", icon: "🤝" },
    { num: stats.byStatus?.closed || 0, label: "Closed Deals", icon: "🏆" },
    { num: stats.liveListings || 0, label: "Live Listings", icon: "🏡" },
  ];

  $("#overviewCards").innerHTML = kpis
    .map(
      (k) => `
    <div class="card">
      <div class="card-icon-line"><span>${k.icon}</span></div>
      <div class="num">${k.num}</div>
      <div class="lbl">${k.label}</div>
    </div>`
    )
    .join("");

  // Recent 5 leads
  const recent = leads.slice(0, 5);
  $("#overviewRecentLeadsTable tbody").innerHTML = recent.length
    ? recent
        .map(
          (l) => `
      <tr>
        <td class="when">${esc(l.created_at.split(" ")[0])}</td>
        <td><strong>${esc(l.name) || "Anonymous"}</strong></td>
        <td>${esc(l.interest)}</td>
        <td><span class="status-pill s-${l.status.replace(" ", "-")}">${esc(
            l.status
          )}</span></td>
        <td>
          ${
            l.phone
              ? `<a href="https://wa.me/91${esc(
                  l.phone
                )}" target="_blank" rel="noopener" class="wa-action-btn">WhatsApp</a>`
              : "—"
          }
        </td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No recent leads.</td></tr>`;

  // Upcoming Visits
  const upcomingVisits = visits.slice(0, 4);
  $("#overviewVisitsList").innerHTML = upcomingVisits.length
    ? upcomingVisits
        .map(
          (v) => `
      <div class="visit-card-compact">
        <div class="vcc-date">
          <span class="vcc-d">${v.visit_date}</span>
          <span class="vcc-t">${v.visit_time || "11:00 AM"}</span>
        </div>
        <div class="vcc-details">
          <strong>${esc(v.client_name)}</strong>
          <p>${esc(v.property_title || "General Property Inspection")}</p>
        </div>
        <div class="vcc-status">
          <span class="status-pill s-${v.status}">${v.status}</span>
        </div>
      </div>`
        )
        .join("")
    : `<p class="empty" style="padding: 24px;">No upcoming visits scheduled.</p>`;
}

/* ---------- 2. Leads CRM ---------- */
function setupLeadCRM() {
  $("#btnOpenNewLeadModal")?.addEventListener("click", () => openLeadModal());

  $("#leadSearchInput")?.addEventListener("input", (e) => {
    leadSearchQuery = e.target.value.toLowerCase();
    $("#leadSearchClear")?.classList.toggle("hidden", !leadSearchQuery);
    renderLeads();
  });

  $("#leadSearchClear")?.addEventListener("click", () => {
    leadSearchQuery = "";
    $("#leadSearchInput").value = "";
    $("#leadSearchClear").classList.add("hidden");
    renderLeads();
  });

  $("#newLeadForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: $("#nl-name").value,
      phone: $("#nl-phone").value,
      email: $("#nl-email").value,
      interest: $("#nl-interest").value,
      source: $("#nl-source").value,
      assigned_to: $("#nl-assigned").value,
      status: $("#nl-status").value,
      notes: $("#nl-notes").value,
    };

    const res = await api("/api/admin/leads", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      closeLeadModal();
      e.target.reset();
      await refreshAllData();
      toast("Lead added to the CRM.");
    } else {
      $("#nl-msg").textContent = res.error || "Failed to create lead.";
    }
  });
}

function openLeadModal() {
  $("#leadModal").classList.add("open");
  $("#leadModal").setAttribute("aria-hidden", "false");
}
function closeLeadModal() {
  $("#leadModal").classList.remove("open");
  $("#leadModal").setAttribute("aria-hidden", "true");
}
$("#closeLeadModal")?.addEventListener("click", closeLeadModal);
$("#leadModalBackdrop")?.addEventListener("click", closeLeadModal);
$("#cancelLeadModal")?.addEventListener("click", closeLeadModal);

function renderLeads() {
  // Render status filter pills
  const counts = { all: leads.length };
  STATUSES.forEach(
    (st) => (counts[st] = leads.filter((l) => l.status === st).length)
  );

  $("#leadStatusFilters").innerHTML = ["all", ...STATUSES]
    .map(
      (st) => `
    <button type="button" class="crm-pill ${leadFilter === st ? "active" : ""}" data-st="${st}">
      ${st} (${counts[st] || 0})
    </button>`
    )
    .join("");

  $("#leadStatusFilters").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      leadFilter = b.dataset.st;
      renderLeads();
    });
  });

  // Filter leads
  const filtered = leads.filter((l) => {
    if (leadFilter !== "all" && l.status !== leadFilter) return false;
    if (leadSearchQuery) {
      const haystack = `${l.name} ${l.phone} ${l.email} ${l.interest} ${l.source} ${l.notes} ${l.assigned_to}`.toLowerCase();
      if (!haystack.includes(leadSearchQuery)) return false;
    }
    return true;
  });

  $("#emptyLeadsMsg").classList.toggle("hidden", filtered.length > 0);

  $("#leadsTable tbody").innerHTML = filtered
    .map((l) => {
      const waMsg = encodeURIComponent(
        `Hello ${
          l.name || "Sir/Ma'am"
        }, thank you for connecting with Providers Real Estate. Vipul Agnihotri here. I wanted to follow up regarding your requirement (${
          l.interest || "property advisory"
        }). When would be a convenient time to speak?`
      );

      return `
      <tr>
        <td class="when">${esc(l.created_at)}</td>
        <td>
          <strong>${esc(l.name) || "—"}</strong>
        </td>
        <td>
          ${
            l.phone
              ? `<div>
                  <a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>
                  <span class="pipe-sep">·</span>
                  <a href="https://wa.me/91${esc(
                    l.phone
                  )}?text=${waMsg}" target="_blank" rel="noopener" class="wa-link" title="Open WhatsApp chat">
                    💬 WhatsApp
                  </a>
                </div>`
              : ""
          }
          ${
            l.email
              ? `<div><a href="mailto:${esc(l.email)}" class="email-link">${esc(
                  l.email
                )}</a></div>`
              : ""
          }
        </td>
        <td><span class="interest-tag">${esc(l.interest)}</span></td>
        <td><span class="source-tag">${esc(l.source)}</span></td>
        <td>
          <select class="assigned-sel" data-id="${l.id}">
            <option value="Vipul" ${
              l.assigned_to === "Vipul" ? "selected" : ""
            }>Vipul</option>
            <option value="Charul" ${
              l.assigned_to === "Charul" ? "selected" : ""
            }>Charul</option>
            <option value="Rohan" ${
              l.assigned_to === "Rohan" ? "selected" : ""
            }>Rohan</option>
          </select>
        </td>
        <td>
          <select class="status-select s-${l.status.replace(" ", "-")}" data-id="${l.id}">
            ${STATUSES.map(
              (st) =>
                `<option value="${st}" ${
                  st === l.status ? "selected" : ""
                }>${st}</option>`
            ).join("")}
          </select>
        </td>
        <td>
          <input class="notes-input" data-id="${l.id}" value="${esc(
        l.notes
      )}" placeholder="Add private note (auto-saves)…" />
        </td>
        <td>
          <button class="delete-btn" data-del-lead="${
            l.id
          }" title="Delete lead">&times;</button>
        </td>
      </tr>`;
    })
    .join("");

  // Event handlers
  $$(".status-select").forEach((sel) =>
    sel.addEventListener("change", async () => {
      await api(`/api/admin/leads/${sel.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: sel.value }),
      });
      const target = leads.find((l) => String(l.id) === sel.dataset.id);
      if (target) target.status = sel.value;
      sel.className = `status-select s-${sel.value.replace(" ", "-")}`;
      await refreshAllData();
    })
  );

  $$(".assigned-sel").forEach((sel) =>
    sel.addEventListener("change", async () => {
      await api(`/api/admin/leads/${sel.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assigned_to: sel.value }),
      });
      const target = leads.find((l) => String(l.id) === sel.dataset.id);
      if (target) target.assigned_to = sel.value;
    })
  );

  $$(".notes-input").forEach((inp) =>
    inp.addEventListener("change", async () => {
      await api(`/api/admin/leads/${inp.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: inp.value }),
      });
      inp.style.borderColor = "#1f7a45";
      setTimeout(() => (inp.style.borderColor = ""), 1000);
    })
  );

  $$("[data-del-lead]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!askConfirm("Permanently delete this client lead?")) return;
      await api(`/api/admin/leads/${btn.dataset.delLead}`, {
        method: "DELETE",
      });
      await refreshAllData();
    })
  );
}

/* ---------- 3. Deals & Marketing Kanban Board ---------- */
function setupKanban() {
  $("#kbTabLeads")?.addEventListener("click", () => {
    activeKanbanMode = "leads";
    $("#kbTabLeads").classList.add("active");
    $("#kbTabListings").classList.remove("active");
    renderKanban();
  });
  $("#kbTabListings")?.addEventListener("click", () => {
    activeKanbanMode = "listings";
    $("#kbTabListings").classList.add("active");
    $("#kbTabLeads").classList.remove("active");
    renderKanban();
  });
}

function renderKanban() {
  const container = $("#kanbanBoard");
  if (!container) return;

  if (activeKanbanMode === "leads") {
    // Leads pipeline Kanban
    container.innerHTML = STATUSES.map((st) => {
      const colLeads = leads.filter((l) => l.status === st);
      return `
      <div class="kanban-col" data-col="${st}">
        <div class="kanban-col-head">
          <span class="status-pill s-${st.replace(" ", "-")}">${st}</span>
          <span class="col-count">${colLeads.length}</span>
        </div>
        <div class="kanban-cards-wrap" ondragover="event.preventDefault()">
          ${colLeads
            .map(
              (l) => `
            <div class="kanban-card" draggable="true" data-drag-id="${l.id}">
              <div class="kc-title">${esc(l.name) || "Untitled Lead"}</div>
              <div class="kc-meta">${esc(l.interest)}</div>
              ${
                l.phone
                  ? `<div class="kc-contact">📞 ${esc(l.phone)}</div>`
                  : ""
              }
              <div class="kc-foot">
                <span class="kc-time">${l.created_at.split(" ")[0]}</span>
                <div class="kc-actions">
                  <select class="kc-move-select" data-id="${l.id}">
                    <option value="" disabled selected>Move…</option>
                    ${STATUSES.map(
                      (s) =>
                        `<option value="${s}" ${s === st ? "disabled" : ""}>${s}</option>`
                    ).join("")}
                  </select>
                </div>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
    }).join("");

    // Quick move selector
    container.querySelectorAll(".kc-move-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const leadId = sel.dataset.id;
        const newStatus = sel.value;
        await api(`/api/admin/leads/${leadId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
        await refreshAllData();
      });
    });
  } else {
    // Listings Marketing Pipeline Kanban
    container.innerHTML = MARKETING_STAGES.map((stage) => {
      const stageListings = listings.filter(
        (l) => l.marketing_status === stage
      );
      return `
      <div class="kanban-col" data-col="${stage}">
        <div class="kanban-col-head">
          <span class="stage-tag">${stage}</span>
          <span class="col-count">${stageListings.length}</span>
        </div>
        <div class="kanban-cards-wrap">
          ${stageListings
            .map(
              (l) => `
            <div class="kanban-card listing-kcard" draggable="true" data-drag-id="${l.id}">
              <img src="${l.image_url}" class="kc-thumb" alt="" />
              <div class="kc-title">${esc(l.title)}</div>
              <div class="kc-meta">${esc(l.location)} · <strong>${esc(
                l.price
              )}</strong></div>
              <div class="kc-foot">
                <span class="live-indicator ${l.published ? "is-live" : "is-draft"}">
                  ${l.published ? "● Live on Site" : "○ Draft"}
                </span>
                <select class="kc-listing-move" data-id="${l.id}">
                  <option value="" disabled selected>Stage…</option>
                  ${MARKETING_STAGES.map(
                    (s) =>
                      `<option value="${s}" ${s === stage ? "disabled" : ""}>${s}</option>`
                  ).join("")}
                </select>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
    }).join("");

    container.querySelectorAll(".kc-listing-move").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const id = sel.dataset.id;
        const newStage = sel.value;
        await api(`/api/admin/listings/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ marketing_status: newStage }),
        });
        await refreshAllData();
      });
    });
  }

  attachKanbanDnD(container, activeKanbanMode);
}

/* Drag & drop between stages (with graceful select fallback on touch) */
function attachKanbanDnD(container, mode) {
  container.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.dataset.dragId);
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => card.classList.add("dragging"));
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });

  container.querySelectorAll(".kanban-col").forEach((col) => {
    // Per-column hover depth — a shared counter caused columns to keep the
    // highlight (or drop on the wrong column) when dragging across several.
    let dragDepth = 0;

    col.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragDepth += 1;
      col.classList.add("drag-over");
    });
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) col.classList.remove("drag-over");
    });
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragDepth = 0;
      col.classList.remove("drag-over");

      const id = e.dataTransfer.getData("text/plain");
      if (!id) return;
      const stage = col.dataset.col;

      if (mode === "leads") {
        const lead = leads.find((l) => String(l.id) === id);
        if (!lead || lead.status === stage) return;
        lead.status = stage;
        renderKanban();
        await api(`/api/admin/leads/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: stage }),
        });
        await refreshAllData();
        toast(`Lead moved to “${stage}”.`);
      } else {
        const listing = listings.find((l) => String(l.id) === id);
        if (!listing || listing.marketing_status === stage) return;
        listing.marketing_status = stage;
        renderKanban();
        await api(`/api/admin/listings/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ marketing_status: stage }),
        });
        await refreshAllData();
        toast(
          stage === "published"
            ? `“${listing.title}” moved to published — now live on the website.`
            : `“${listing.title}” moved to “${stage}”.`
        );
      }
    });
  });
}

/* Populate the AI copywriter listing + picture choosers */
function renderAiOptions() {
  const listingSel = $("#aiListing");
  if (!listingSel) return;
  const current = listingSel.value;
  listingSel.innerHTML =
    `<option value="">General portfolio briefing</option>` +
    listings
      .map(
        (l) => `<option value="${l.id}">${esc(l.title)} — ${esc(l.location)}</option>`
      )
      .join("");
  if (current && listings.some((l) => String(l.id) === current)) {
    listingSel.value = current;
  }
  renderAiImageOptions();
}

function renderAiImageOptions() {
  const listingSel = $("#aiListing");
  const imageSel = $("#aiImage");
  if (!listingSel || !imageSel) return;

  const listing = listings.find(
    (l) => String(l.id) === listingSel.value
  );
  const previous = imageSel.value;

  let images = [];
  if (listing) {
    try {
      images = JSON.parse(listing.images_json || "[]");
    } catch {
      images = [];
    }
    if (listing.image_url && !images.includes(listing.image_url)) {
      images.unshift(listing.image_url);
    }
  }

  imageSel.innerHTML =
    `<option value="">No picture in email</option>` +
    images
      .map((u) => {
        const label = u.startsWith("http") ? u.split("/").pop() : u.replace("/uploads/", "");
        return `<option value="${esc(u)}">${esc(label)}</option>`;
      })
      .join("");

  if (previous && images.includes(previous)) imageSel.value = previous;
}

/* ---------- 4. Listings & Media Manager ---------- */
let currentFlyerUrl = "";
let currentGalleryUrls = [];

function renderFlyerPreview() {
  const wrap = $("#adFlyerPreviewWrap");
  const dropzone = $("#adFlyerDropzone");
  const img = $("#adFlyerPreviewImg");
  const name = $("#adFlyerPreviewName");
  const hiddenInput = $("#lf-image");

  if (currentFlyerUrl) {
    if (wrap) wrap.classList.remove("hidden");
    if (dropzone) dropzone.classList.add("hidden");
    if (img) img.src = currentFlyerUrl;
    if (name) name.textContent = currentFlyerUrl.split("/").pop() || "Ad Flyer Poster";
    if (hiddenInput) hiddenInput.value = currentFlyerUrl;
  } else {
    if (wrap) wrap.classList.add("hidden");
    if (dropzone) dropzone.classList.remove("hidden");
    if (img) img.src = "";
    if (name) name.textContent = "";
    if (hiddenInput) hiddenInput.value = "";
  }
}

function renderGalleryThumbs() {
  const grid = $("#galleryThumbsGrid");
  const hiddenInput = $("#lf-images");
  if (!grid) return;

  if (hiddenInput) hiddenInput.value = JSON.stringify(currentGalleryUrls);

  if (!currentGalleryUrls.length) {
    grid.innerHTML = `<div class="gallery-empty-hint">No gallery photos added yet. Upload pictures above to showcase walkthrough rooms, exterior, and amenities.</div>`;
    return;
  }

  grid.innerHTML = currentGalleryUrls
    .map(
      (url, idx) => `
    <div class="gallery-thumb-item ${url === currentFlyerUrl ? "is-main" : ""}" title="${esc(url)}">
      <img src="${esc(url)}" alt="Photo ${idx + 1}" />
      ${
        url === currentFlyerUrl
          ? `<span class="main-badge">★ Main preview</span>`
          : `<button type="button" class="thumb-main-btn" data-main-thumb="${idx}" title="Set as the main preview picture (website card, Kanban & social ads)">★ Set as main</button>`
      }
      <button type="button" class="thumb-del-btn" data-del-thumb="${idx}" title="Remove photo">&times;</button>
    </div>`
    )
    .join("");

  grid.querySelectorAll("[data-del-thumb]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.delThumb);
      const removed = currentGalleryUrls.splice(idx, 1)[0];
      if (removed && removed === currentFlyerUrl) {
        currentFlyerUrl = currentGalleryUrls[0] || "";
        renderFlyerPreview();
      }
      renderGalleryThumbs();
    });
  });

  grid.querySelectorAll("[data-main-thumb]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.mainThumb);
      currentFlyerUrl = currentGalleryUrls[idx];
      renderFlyerPreview();
      renderGalleryThumbs();
      toast("Main preview picture updated.");
    });
  });
}

function setupListingManagement() {
  $("#newListingBtn")?.addEventListener("click", () => openListingModal());

  // 1. Pick & Upload Ad Listing Flyer
  const flyerInput = $("#adFlyerFileInput");
  $("#btnPickAdFlyer")?.addEventListener("click", () => flyerInput?.click());
  $("#btnChangeFlyer")?.addEventListener("click", () => flyerInput?.click());

  $("#btnRemoveFlyer")?.addEventListener("click", () => {
    currentFlyerUrl = "";
    renderFlyerPreview();
  });

  flyerInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const [ok] = splitHeic([file]);
    if (!ok) {
      flyerInput.value = "";
      return;
    }

    const fd = new FormData();
    fd.append("file", ok);

    const btn = $("#btnPickAdFlyer");
    const origText = btn ? btn.textContent : "";
    if (btn) btn.textContent = "Uploading flyer…";

    try {
      const res = await api("/api/admin/upload", {
        method: "POST",
        body: fd,
      });

      if (res.ok && res.url) {
        currentFlyerUrl = res.url;
        renderFlyerPreview();

        // Also ensure it is present in the gallery reel
        if (!currentGalleryUrls.includes(res.url)) {
          currentGalleryUrls.unshift(res.url);
          renderGalleryThumbs();
        }
      } else {
        toast(res.error || "Failed to upload flyer.");
      }
    } catch {
      toast("Error uploading flyer.");
    } finally {
      if (btn) btn.textContent = origText;
      flyerInput.value = "";
    }
  });

  // 2. Pick & Upload Gallery Photos (multiple files)
  const galleryInput = $("#galleryFileInput");
  const galleryStatus = $("#galleryUploadStatus");
  $("#btnPickGallery")?.addEventListener("click", () => galleryInput?.click());

  galleryInput?.addEventListener("change", async (e) => {
    let files = Array.from(e.target.files || []);
    if (!files.length) return;
    files = splitHeic(files);
    if (!files.length) {
      galleryInput.value = "";
      return;
    }

    if (galleryStatus) {
      galleryStatus.textContent = `Uploading ${files.length} photo(s)…`;
      galleryStatus.style.color = "var(--gold, #b8860b)";
    }

    const fd = new FormData();
    for (const f of files) {
      fd.append("files", f);
    }

    try {
      const res = await api("/api/admin/upload-multiple", {
        method: "POST",
        body: fd,
      });

      if (res.ok && Array.isArray(res.files)) {
        const newUrls = res.files.map((item) => item.url);
        currentGalleryUrls.push(...newUrls);
        if (!currentFlyerUrl && newUrls.length) {
          currentFlyerUrl = newUrls[0];
          renderFlyerPreview();
        }
        renderGalleryThumbs();
        if (galleryStatus) {
          galleryStatus.textContent = `✅ Successfully added ${res.files.length} photos!`;
          galleryStatus.style.color = "#1f7a45";
          setTimeout(() => {
            if (galleryStatus) {
              galleryStatus.textContent = "Select one or several photos to build the property gallery.";
              galleryStatus.style.color = "";
            }
          }, 3500);
        }
      } else {
        // Fallback: upload one by one if batch failed
        let added = 0;
        for (const file of files) {
          const sfd = new FormData();
          sfd.append("file", file);
          const singleRes = await api("/api/admin/upload", { method: "POST", body: sfd });
          if (singleRes.ok && singleRes.url) {
            currentGalleryUrls.push(singleRes.url);
            added++;
          }
        }
        if (!currentFlyerUrl && currentGalleryUrls.length) {
          currentFlyerUrl = currentGalleryUrls[0];
          renderFlyerPreview();
        }
        renderGalleryThumbs();
        if (galleryStatus) {
          galleryStatus.textContent = `✅ Uploaded ${added} photos!`;
        }
      }
    } catch {
      if (galleryStatus) {
        galleryStatus.textContent = "Upload failed. Please try again.";
        galleryStatus.style.color = "#b02a37";
      }
    } finally {
      galleryInput.value = "";
    }
  });

  // 3. Listing Form Submit
  $("#listingForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#lf-id").value;
    const isEdit = Boolean(id);

    const mainImg = currentFlyerUrl || $("#lf-image").value || (currentGalleryUrls[0] || "");
    const gallery = currentGalleryUrls.length ? currentGalleryUrls : (mainImg ? [mainImg] : []);

    const payload = {
      title: $("#lf-title").value,
      location: $("#lf-location").value,
      property_type: $("#lf-ptype").value,
      listing_type: $("#lf-ltype").value,
      price: $("#lf-price").value,
      badge: $("#lf-badge").value,
      video_url: "", // Videos discontinued in favor of picture walkthroughs
      image_url: mainImg,
      images: gallery,
      specs: $("#lf-specs").value,
      features: $("#lf-features").value,
      description: $("#lf-desc").value,
      marketing_status: $("#lf-mstage").value,
      published: $("#lf-published").checked,
      marketing_link: $("#lf-mlink").value,
      marketing_note: $("#lf-mnote").value,
      follow_up_at: $("#lf-fdate").value,
      follow_up_note: $("#lf-fnote").value,
    };

    const url = isEdit ? `/api/admin/listings/${id}` : "/api/admin/listings";
    const method = isEdit ? "PATCH" : "POST";

    const res = await api(url, { method, body: JSON.stringify(payload) });
    if (res.ok) {
      closeListingModal();
      await refreshAllData();
    } else {
      $("#lf-msg").textContent = res.error || "Failed to save listing.";
    }
  });
}

function openListingModal(listingToEdit = null) {
  const modal = $("#listingEditorModal");
  $("#listingForm").reset();
  $("#lf-msg").textContent = "";

  if (listingToEdit) {
    $("#editorTitle").textContent = "Edit Property Details";
    $("#lf-id").value = listingToEdit.id;
    $("#lf-title").value = listingToEdit.title || "";
    $("#lf-location").value = listingToEdit.location || "";
    $("#lf-ptype").value = listingToEdit.property_type || "Residential";
    $("#lf-ltype").value = listingToEdit.listing_type || "sale";
    $("#lf-price").value = listingToEdit.price || "";
    $("#lf-badge").value = listingToEdit.badge || "";
    $("#lf-image").value = listingToEdit.image_url || "";

    currentFlyerUrl = listingToEdit.image_url || "";

    // Parse images array
    try {
      currentGalleryUrls = JSON.parse(listingToEdit.images_json || "[]");
    } catch {
      currentGalleryUrls = [];
    }
    if (!currentGalleryUrls.length && currentFlyerUrl) {
      currentGalleryUrls = [currentFlyerUrl];
    }

    // Specs
    let sp = [];
    try {
      sp = JSON.parse(listingToEdit.specs_json || "[]");
    } catch {
      sp = [];
    }
    $("#lf-specs").value = sp.join("\n");

    // Features
    let ft = [];
    try {
      ft = JSON.parse(listingToEdit.features_json || "[]");
    } catch {
      ft = [];
    }
    $("#lf-features").value = ft.join("\n");

    $("#lf-desc").value = listingToEdit.description || "";
    $("#lf-mstage").value = listingToEdit.marketing_status || "needs ad";
    $("#lf-published").checked = Boolean(listingToEdit.published);
    $("#lf-mlink").value = listingToEdit.marketing_link || "";
    $("#lf-mnote").value = listingToEdit.marketing_note || "";
    $("#lf-fdate").value = listingToEdit.follow_up_at || "";
    $("#lf-fnote").value = listingToEdit.follow_up_note || "";
  } else {
    $("#editorTitle").textContent = "Add New Property";
    $("#lf-id").value = "";
    $("#lf-ptype").value = "Residential";
    $("#lf-ltype").value = "sale";
    $("#lf-badge").value = "For Sale";
    $("#lf-mstage").value = "needs ad";
    $("#lf-published").checked = true;
    currentFlyerUrl = "";
    currentGalleryUrls = [];
  }

  renderFlyerPreview();
  renderGalleryThumbs();

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeListingModal() {
  $("#listingEditorModal").classList.remove("open");
  $("#listingEditorModal").setAttribute("aria-hidden", "true");
}
$("#closeListingModal")?.addEventListener("click", closeListingModal);
$("#listingModalBackdrop")?.addEventListener("click", closeListingModal);
$("#cancelListingModal")?.addEventListener("click", closeListingModal);

function renderListings() {
  $("#listingsTable tbody").innerHTML = listings
    .map((l) => {
      let imgs = [];
      try {
        imgs = JSON.parse(l.images_json || "[]");
      } catch {
        imgs = [];
      }
      const count = imgs.length || (l.image_url ? 1 : 0);

      return `
      <tr>
        <td>
          <img src="${esc(l.image_url || imgs[0] || '/images/default-prop.jpg')}" class="table-listing-thumb" alt="" />
        </td>
        <td>
          <strong>${esc(l.title)}</strong><br>
          <span class="sub-text">${esc(l.location)}</span>
        </td>
        <td>${esc(l.property_type)}</td>
        <td><strong>${esc(l.price)}</strong></td>
        <td>
          <span class="gallery-count-badge">🖼️ ${count} Picture${count === 1 ? "" : "s"}</span>
        </td>
        <td>
          <button type="button" class="toggle-live-btn ${
            l.published ? "is-live" : "is-draft"
          }" data-toggle-live="${l.id}">
            ${l.published ? "● Live on Site" : "○ Draft / Hidden"}
          </button>
        </td>
        <td>
          <span class="stage-tag">${esc(l.marketing_status)}</span>
        </td>
        <td>
          <div class="row-actions">
            <button class="edit-link" data-edit-listing="${l.id}">Edit</button>
            <span class="pipe-sep">·</span>
            <button class="del-link" data-del-listing="${l.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  // Edit Listing
  $$("[data-edit-listing]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.editListing);
      const match = listings.find((l) => l.id === id);
      if (match) openListingModal(match);
    });
  });

  // Toggle Live switch
  $$("[data-toggle-live]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.toggleLive);
      const match = listings.find((l) => l.id === id);
      if (!match) return;
      const nextPublished = match.published ? 0 : 1;
      await api(`/api/admin/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ published: nextPublished }),
      });
      await refreshAllData();
    });
  });

  // Delete Listing
  $$("[data-del-listing]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!askConfirm("Permanently delete this property listing?")) return;
      await api(`/api/admin/listings/${btn.dataset.delListing}`, {
        method: "DELETE",
      });
      await refreshAllData();
    });
  });
}

/* ---------- 5. Site Visits Scheduler ---------- */
function setupSiteVisits() {
  $("#btnOpenNewVisitModal")?.addEventListener("click", () => openVisitModal());

  $("#newVisitForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      client_name: $("#nv-name").value,
      client_phone: $("#nv-phone").value,
      client_email: $("#nv-email").value,
      property_title: $("#nv-property").value,
      visit_date: $("#nv-date").value,
      visit_time: $("#nv-time").value || "11:00 AM",
      notes: $("#nv-notes").value,
    };

    const res = await api("/api/admin/site-visits", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      closeVisitModal();
      e.target.reset();
      await refreshAllData();
      toast("Site visit scheduled.");
    } else {
      $("#nv-msg").textContent = res.error || "Failed to schedule visit.";
    }
  });
}

function openVisitModal() {
  // Populate property dropdown
  const sel = $("#nv-property");
  sel.innerHTML = listings
    .map((l) => `<option value="${esc(l.title)}">${esc(l.title)}</option>`)
    .join("");
  $("#visitModal").classList.add("open");
  $("#visitModal").setAttribute("aria-hidden", "false");
}
function closeVisitModal() {
  $("#visitModal").classList.remove("open");
  $("#visitModal").setAttribute("aria-hidden", "true");
}
$("#closeVisitModal")?.addEventListener("click", closeVisitModal);
$("#visitModalBackdrop")?.addEventListener("click", closeVisitModal);
$("#cancelVisitModal")?.addEventListener("click", closeVisitModal);

function renderVisits() {
  $("#visitsTable tbody").innerHTML = visits.length
    ? visits
        .map(
          (v) => `
      <tr>
        <td>
          <strong>${v.visit_date}</strong><br>
          <span class="sub-text">${v.visit_time || "11:00 AM"}</span>
        </td>
        <td><strong>${esc(v.client_name)}</strong></td>
        <td>
          ${
            v.client_phone
              ? `<a href="https://wa.me/91${esc(
                  v.client_phone
                )}" target="_blank" rel="noopener">WhatsApp +91 ${esc(
                  v.client_phone
                )}</a>`
              : "—"
          }
        </td>
        <td>${esc(v.property_title || "General Property Inspection")}</td>
        <td>
          <select class="visit-status-sel s-${v.status}" data-id="${v.id}">
            <option value="scheduled" ${
              v.status === "scheduled" ? "selected" : ""
            }>Scheduled</option>
            <option value="completed" ${
              v.status === "completed" ? "selected" : ""
            }>Completed</option>
            <option value="cancelled" ${
              v.status === "cancelled" ? "selected" : ""
            }>Cancelled</option>
          </select>
        </td>
        <td>${esc(v.notes) || "—"}</td>
        <td>
          <button class="delete-btn" data-del-visit="${
            v.id
          }" title="Delete visit">&times;</button>
        </td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No site visits scheduled yet.</td></tr>`;

  $$(".visit-status-sel").forEach((sel) =>
    sel.addEventListener("change", async () => {
      await api(`/api/admin/site-visits/${sel.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: sel.value }),
      });
      await refreshAllData();
    })
  );

  $$("[data-del-visit]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!askConfirm("Delete this site visit record?")) return;
      await api(`/api/admin/site-visits/${btn.dataset.delVisit}`, {
        method: "DELETE",
      });
      await refreshAllData();
    })
  );
}

/* ---------- 6. Email Campaign Studio (AI + Brevo) ---------- */
const BREVO_KEY_SESSION = "providers_brevo_key";
const QUICK_RECIPIENTS_KEY = "providers_test_recipients";

function setupEmailMarketing() {
  const subjectInput = $("#emSubject");
  const preheaderInput = $("#emPreheader");
  const bodyInput = $("#emBody");

  // Real-time preview updates
  subjectInput?.addEventListener("input", updateEmailLivePreview);
  preheaderInput?.addEventListener("input", updateEmailLivePreview);
  bodyInput?.addEventListener("input", updateEmailLivePreview);

  // AI copywriter — listing picker drives the picture picker
  $("#aiListing")?.addEventListener("change", renderAiImageOptions);

  $("#btnAiWrite")?.addEventListener("click", async () => {
    const btn = $("#btnAiWrite");
    const msg = $("#aiMsg");
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "✍️ Writing with AI…";
    msg.textContent = "";
    msg.style.color = "";

    try {
      const res = await api("/api/admin/ai-email", {
        method: "POST",
        body: JSON.stringify({
          brief: $("#aiBrief").value.trim(),
          listingId: $("#aiListing").value || null,
          tone: $("#aiTone").value,
        }),
      });

      if (res.ok) {
        $("#emSubject").value = res.subject || "";
        $("#emPreheader").value = res.preheader || "";
        $("#emBody").value = res.body || "";
        updateEmailLivePreview();
        msg.textContent =
          "✅ Draft ready — read it, tweak the details, then copy to Brevo or send a test.";
        msg.style.color = "#1f7a45";
      } else {
        msg.textContent = res.error || "AI drafting failed. Try again shortly.";
        msg.style.color = "#b4232a";
      }
    } catch {
      msg.textContent = "Could not reach the AI service. Check your connection.";
      msg.style.color = "#b4232a";
    }

    btn.disabled = false;
    btn.textContent = orig;
  });

  // Brevo integration status chip
  api("/api/admin/brevo-status")
    .then((d) => {
      const chip = $("#brevoStatusChip");
      if (!chip) return;
      if (d.ok && d.configured) {
        chip.textContent = "🔑 Brevo: connected";
        chip.classList.add("ok");
      } else {
        chip.textContent = "🔑 Brevo: add API key at test";
        chip.classList.add("warn");
      }
    })
    .catch(() => {});

  // Desktop vs Mobile preview
  $("#btnPreviewDesktop")?.addEventListener("click", () => {
    $("#btnPreviewDesktop").classList.add("active");
    $("#btnPreviewMobile").classList.remove("active");
    $("#emailScreen").classList.remove("mobile-view");
  });
  $("#btnPreviewMobile")?.addEventListener("click", () => {
    $("#btnPreviewMobile").classList.add("active");
    $("#btnPreviewDesktop").classList.remove("active");
    $("#emailScreen").classList.add("mobile-view");
  });

  // Tag inserters
  $$(".tag-insert").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      const cur = bodyInput.value;
      const start = bodyInput.selectionStart || cur.length;
      bodyInput.value = cur.slice(0, start) + tag + cur.slice(start);
      bodyInput.focus();
      updateEmailLivePreview();
    });
  });

  // Template selector
  $("#campaignTemplateSelect")?.addEventListener("change", (e) => {
    const id = Number(e.target.value);
    const selected = campaigns.find((c) => c.id === id);
    if (selected) {
      $("#emTitle").value = selected.title;
      $("#emSubject").value = selected.subject;
      $("#emPreheader").value = selected.preheader || "";
      $("#emBody").value = selected.body;
      updateEmailLivePreview();
    }
  });

  // Subject line suggestions helper
  $("#btnSubjectSuggestion")?.addEventListener("click", () => {
    const hooks = [
      "Private Off-Market Briefing: Park-Facing 3 BHK in Greater Kailash I",
      "Commercial Investment Alert: Ground Floor Retail at M3M Urbana, Gurugram",
      "Curated Luxury Portfolio: Handpicked South Delhi & Gurugram Residences",
      "Private Invitation: Exclusive Site Walkthrough of Trophy DLF Villa",
      "Off-Market Advisory: Rare Acquisition Opportunities for Q4",
    ];
    const pick = hooks[Math.floor(Math.random() * hooks.length)];
    $("#emSubject").value = pick;
    updateEmailLivePreview();
  });

  // New Campaign reset
  $("#btnNewCampaign")?.addEventListener("click", () => {
    $("#emTitle").value = "";
    $("#emSubject").value = "";
    $("#emPreheader").value = "";
    $("#emBody").value = "";
    $("#campaignTemplateSelect").value = "";
    updateEmailLivePreview();
  });

  // Save Campaign template
  $("#btnSaveCampaign")?.addEventListener("click", async () => {
    const payload = {
      title: $("#emTitle").value || $("#emSubject").value || "Untitled Campaign",
      subject: $("#emSubject").value,
      preheader: $("#emPreheader").value,
      body: $("#emBody").value,
    };
    if (!payload.subject || !payload.body) {
      toast("Please enter both a Subject line and Email Body.");
      return;
    }
    const res = await api("/api/admin/email-campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast("Campaign template saved to library!");
      await refreshAllData();
    } else {
      toast(res.error || "Failed to save template.");
    }
  });

  // Copy HTML for Brevo
  $("#btnCopyBrevoHTML")?.addEventListener("click", () => {
    const html = compileFullBrevoHTML();
    navigator.clipboard.writeText(html).then(() => {
      showCopyToast(
        "✅ Copied complete HTML for Brevo! Open Brevo > Create Campaign > Code Your Own and paste."
      );
    });
  });

  // Copy Subject
  $("#btnCopySubject")?.addEventListener("click", () => {
    const subject = $("#emSubject").value;
    navigator.clipboard.writeText(subject).then(() => {
      showCopyToast("✅ Copied subject line to clipboard!");
    });
  });

  // Brevo Test Send Modal
  $("#btnOpenBrevoTestModal")?.addEventListener("click", () => {
    const saved = sessionStorage.getItem(BREVO_KEY_SESSION) || "";
    if (saved && $("#bt-apikey") && !$("#bt-apikey").value) {
      $("#bt-apikey").value = saved;
    }
    renderQuickRecipients();
    $("#brevoTestModal").classList.add("open");
    $("#brevoTestModal").setAttribute("aria-hidden", "false");
  });
  $("#closeBrevoModal")?.addEventListener("click", () => {
    $("#brevoTestModal").classList.remove("open");
  });
  $("#cancelBrevoModal")?.addEventListener("click", () => {
    $("#brevoTestModal").classList.remove("open");
  });
  $("#brevoModalBackdrop")?.addEventListener("click", () => {
    $("#brevoTestModal").classList.remove("open");
  });

  $("#brevoTestForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#btnSendBrevoTest");
    btn.disabled = true;
    btn.textContent = "Sending test…";
    $("#bt-msg").textContent = "";

    const payload = {
      recipientEmail: $("#bt-recipient").value,
      apiKey: $("#bt-apikey").value.trim(),
      subject: $("#emSubject").value || "Providers Real Estate Test Email",
      htmlContent: compileFullBrevoHTML(),
    };

    try {
      const res = await api("/api/admin/brevo/test-send", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (payload.apiKey) {
          sessionStorage.setItem(BREVO_KEY_SESSION, payload.apiKey);
        }
        rememberQuickRecipients($("#bt-recipient").value);
        $("#bt-msg").textContent = `✅ Test email sent to ${
          (res.sentTo || []).join(", ") || "your inbox"
        }. Check spam/promotions too!`;
        $("#bt-msg").style.color = "#1f7a45";
        renderQuickRecipients();
      } else {
        $("#bt-msg").textContent = `Error: ${res.error}`;
        $("#bt-msg").style.color = "#b4232a";
      }
    } catch {
      $("#bt-msg").textContent = "Failed to communicate with Brevo.";
      $("#bt-msg").style.color = "#b4232a";
    }
    btn.disabled = false;
    btn.textContent = "Send Test Now";
  });
}

/* Quick test recipients (saved per browser) */
function renderQuickRecipients() {
  const wrap = $("#quickRecipients");
  if (!wrap) return;
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(QUICK_RECIPIENTS_KEY) || "[]");
  } catch {
    list = [];
  }

  const chips = list
    .map(
      (email) => `
    <button type="button" class="qr-chip" data-qr="${esc(email)}" title="Add to recipients">${esc(
        email
      )}<span class="qr-add-sign">＋</span></button>`
    )
    .join("");

  wrap.innerHTML =
    chips +
    `<button type="button" class="qr-chip qr-manage" id="qrManage" title="Remove saved addresses">Manage</button>`;

  wrap.querySelectorAll("[data-qr]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const ta = $("#bt-recipient");
      const cur = ta.value
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!cur.includes(chip.dataset.qr)) cur.push(chip.dataset.qr);
      ta.value = cur.join(", ");
    });
  });

  $("#qrManage")?.addEventListener("click", () => {
    if (!list.length) {
      toast("No saved addresses yet — send one test and they save automatically.");
      return;
    }
    const remove = prompt(
      "Saved test recipients:\n" +
        list.map((e, i) => `${i + 1}. ${e}`).join("\n") +
        "\n\nType the number to remove (or Cancel to keep all):"
    );
    const idx = Number(remove) - 1;
    if (remove && idx >= 0 && idx < list.length) {
      list.splice(idx, 1);
      localStorage.setItem(QUICK_RECIPIENTS_KEY, JSON.stringify(list));
      renderQuickRecipients();
    }
  });
}

function rememberQuickRecipients(raw) {
  const entries = String(raw || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e));
  if (!entries.length) return;
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(QUICK_RECIPIENTS_KEY) || "[]");
  } catch {
    list = [];
  }
  entries.forEach((e) => {
    if (!list.includes(e)) list.push(e);
  });
  localStorage.setItem(QUICK_RECIPIENTS_KEY, JSON.stringify(list.slice(0, 8)));
}

function showCopyToast(msg) {
  const el = $("#copyStatusMsg");
  el.textContent = msg;
  el.style.opacity = "1";
  setTimeout(() => (el.style.opacity = "0"), 4500);
}

function compileFullBrevoHTML() {
  const subject = $("#emSubject")?.value || "Providers Real Estate";
  const preheader = $("#emPreheader")?.value || "";
  const rawBody = $("#emBody")?.value || "Dear Client,\n\nWe are pleased to present our curated real estate portfolio.";
  const featuredImage = $("#aiImage")?.value || "";

  // Format body paragraphs
  const bodyParagraphs = rawBody
    .split(/\n\s*\n/)
    .map((p) => {
      const lines = p
        .split("\n")
        .map((l) => esc(l))
        .join("<br/>");
      return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.75; color: #22314f; font-family: 'Jost', 'Segoe UI', Helvetica, Arial, sans-serif;">${lines}</p>`;
    })
    .join("");

  // Optional featured picture — only if it is a fully-qualified URL (email-safe)
  const imageBlock =
    featuredImage && /^https?:\/\//i.test(featuredImage)
      ? `
          <!-- FEATURED PICTURE -->
          <tr>
            <td style="padding: 0 32px 8px 32px; background-color: #ffffff;">
              <img src="${esc(featuredImage)}" alt="Featured property" width="100%" style="display: block; width: 100%; max-width: 536px; height: auto; border-radius: 4px; border: 1px solid #e3e8f0;" />
            </td>
          </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef1f6; font-family: 'Jost', 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- Preheader text for inboxes -->
  <div style="display: none; font-size: 1px; color: #eef1f6; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${esc(preheader)}
  </div>

  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#eef1f6">
    <tr>
      <td align="center" style="padding: 30px 15px;">
        <table width="100%" max-width="600" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width: 600px; width: 100%; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 24px rgba(11,24,48,0.08);">

          <!-- BRAND HEADER -->
          <tr>
            <td bgcolor="#0b1830" align="center" style="padding: 30px 24px 26px 24px; border-bottom: 2px solid #c5a059;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="font-family: Georgia, 'Playfair Display', serif; font-size: 25px; font-weight: bold; letter-spacing: 3px; color: #ffffff; text-transform: uppercase;">
                      PROVIDERS
                    </div>
                    <div style="font-family: 'Jost', 'Segoe UI', Arial, sans-serif; font-size: 9px; letter-spacing: 5px; color: #c5a059; text-transform: uppercase; margin-top: 5px;">
                      REAL ESTATE PVT. LTD.
                    </div>
                    <div style="font-family: 'Jost', 'Segoe UI', Arial, sans-serif; font-size: 9px; letter-spacing: 2px; color: #8e9db5; margin-top: 10px;">
                      Trust &nbsp;&middot;&nbsp; Value &nbsp;&middot;&nbsp; Tomorrow
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
${imageBlock}
          <!-- MAIN BODY -->
          <tr>
            <td style="padding: 34px 32px 26px 32px; background-color: #ffffff;">
              ${bodyParagraphs}
            </td>
          </tr>

          <!-- MOTTO DIVIDER -->
          <tr>
            <td align="center" style="background-color: #ffffff; padding: 0 32px 30px 32px;">
              <div style="border-top: 1px solid #e3e8f0; padding-top: 16px; font-family: 'Jost', 'Segoe UI', Arial, sans-serif; font-size: 11px; letter-spacing: 3px; color: #8e9db5; text-transform: uppercase;">
                Invest today. Live tomorrow.
              </div>
            </td>
          </tr>

          <!-- STANDARDIZED FIXED BRAND FOOTER -->
          <tr>
            <td bgcolor="#0b1830" style="padding: 32px 26px; border-top: 3px solid #c5a059; color: #ffffff; text-align: center;">

              <div style="font-family: Georgia, 'Playfair Display', serif; font-size: 20px; font-weight: bold; letter-spacing: 1.5px; color: #ffffff; margin-bottom: 4px;">
                PROVIDERS REAL ESTATE
              </div>
              <div style="font-family: 'Jost', 'Segoe UI', Arial, sans-serif; font-size: 10px; letter-spacing: 3px; color: #c5a059; text-transform: uppercase; margin-bottom: 16px;">
                Boutique Real Estate Advisory &middot; South Delhi &amp; Gurugram
              </div>

              <div style="font-family: 'Jost', 'Segoe UI', Arial, sans-serif; font-size: 13px; line-height: 1.8; color: #d0d7e2; max-width: 480px; margin: 0 auto 18px auto;">
                Curated Luxury Residences &bull; Prime Retail &bull; Strategic Investments<br/>
                Direct Advisory: <strong>Vipul Agnihotri</strong> &bull; Call / WhatsApp: <a href="tel:+919810333886" style="color: #ffffff; text-decoration: underline;">+91 98103 33886</a><br/>
                Email: <a href="mailto:vipulproviders@gmail.com" style="color: #ffffff; text-decoration: underline;">vipulproviders@gmail.com</a> &bull; Instagram: <a href="https://instagram.com/providersrealestate" style="color: #ffffff; text-decoration: underline;">@providersrealestate</a>
              </div>

              <!-- Brevo Compliance & Unsubscribe links -->
              <div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 14px; font-family: 'Jost', 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #8e9db5; line-height: 1.6;">
                &copy; Providers Real Estate Pvt. Ltd. All rights reserved.<br/>
                You are receiving this private briefing because of your registered interest.<br/>
                <a href="{{ unsubscribe }}" style="color: #c5a059; text-decoration: underline;">Unsubscribe</a> &bull; <a href="{{ mirror }}" style="color: #c5a059; text-decoration: underline;">View in browser</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function updateEmailLivePreview() {
  const subject = $("#emSubject")?.value || "—";
  const preheader = $("#emPreheader")?.value || "—";
  const container = $("#renderedEmailContainer");

  if ($("#pvSubjectText")) $("#pvSubjectText").textContent = subject;
  if ($("#pvPreheaderText")) $("#pvPreheaderText").textContent = preheader;

  if (container) {
    // Sandboxed iframe = pixel-true email rendering, isolated from dashboard
    // styles (fixes the white-on-white hover issue) and safe (no scripts run).
    let frame = container.querySelector("iframe.email-frame");
    if (!frame) {
      container.innerHTML = "";
      frame = document.createElement("iframe");
      frame.className = "email-frame";
      frame.setAttribute("sandbox", "");
      frame.setAttribute("title", "Live email preview");
      container.appendChild(frame);
    }
    frame.srcdoc = compileFullBrevoHTML();
  }
}

function renderCampaignTemplates() {
  // Populate dropdown
  const sel = $("#campaignTemplateSelect");
  if (sel) {
    sel.innerHTML = `
      <option value="">-- Choose a pre-built template --</option>
      ${campaigns
        .map(
          (c) => `<option value="${c.id}">${esc(c.title || c.subject)}</option>`
        )
        .join("")}
    `;
  }

  // Populate Library Cards
  const list = $("#savedCampaignsList");
  if (list) {
    list.innerHTML = campaigns.length
      ? campaigns
          .map(
            (c) => `
        <div class="campaign-card">
          <h4>${esc(c.title || c.subject)}</h4>
          <p class="cc-subject"><strong>Subject:</strong> ${esc(c.subject)}</p>
          <p class="cc-snippet">${esc(c.body.slice(0, 120))}…</p>
          <div class="cc-foot">
            <span class="cc-date">${c.created_at.split(" ")[0]}</span>
            <div class="cc-actions">
              <button type="button" class="link-btn" data-load-campaign="${c.id}">Load into Studio &#8594;</button>
              <button type="button" class="del-btn-sm" data-del-campaign="${c.id}">&times;</button>
            </div>
          </div>
        </div>`
          )
          .join("")
      : `<p class="empty">No saved campaigns yet.</p>`;

    list.querySelectorAll("[data-load-campaign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.loadCampaign);
        const match = campaigns.find((c) => c.id === id);
        if (match) {
          $("#emTitle").value = match.title;
          $("#emSubject").value = match.subject;
          $("#emPreheader").value = match.preheader || "";
          $("#emBody").value = match.body;
          updateEmailLivePreview();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });

    list.querySelectorAll("[data-del-campaign]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!askConfirm("Delete this campaign template?")) return;
        await api(`/api/admin/email-campaigns/${btn.dataset.delCampaign}`, {
          method: "DELETE",
        });
        await refreshAllData();
        toast("Campaign template deleted.");
      });
    });
  }
}

/* ---------- 7. Reminders ---------- */
function renderReminders() {
  const list = $("#reminderList");
  if (!list) return;

  const reminders = listings.filter((l) => l.follow_up_at);
  list.innerHTML = reminders.length
    ? reminders
        .map(
          (r) => `
      <li class="reminder-item">
        <div class="rem-date">Due: ${esc(r.follow_up_at)}</div>
        <div class="rem-content">
          <strong>${esc(r.title)}</strong>
          <p>${esc(r.follow_up_note || "Milestone check-in")}</p>
        </div>
        <div class="rem-stage">
          <span class="stage-tag">${esc(r.marketing_status)}</span>
        </div>
      </li>`
        )
        .join("")
    : `<li class="empty">No pending follow-up deadlines.</li>`;
}

/* ---------- 8. Personal Settings — activity trail ---------- */
function renderActivity() {
  const tbody = $("#activityTable tbody");
  if (!tbody) return;

  const scope = $("#activityScope")?.value || "all";
  const rows =
    scope === "mine"
      ? activity.filter((a) => a.user_name === me?.name)
      : activity;

  tbody.innerHTML = rows.length
    ? rows
        .map(
          (a) => `
      <tr>
        <td class="when">${esc(a.created_at)}</td>
        <td><strong>${esc(a.user_name)}</strong></td>
        <td><span class="source-tag">${esc(a.entity_type)}</span></td>
        <td>${esc(a.action)}</td>
        <td class="sub-text">${esc(a.detail)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">${
        scope === "mine"
          ? "No activity recorded under your name yet."
          : "No activity recorded yet."
      }</td></tr>`;
}

/* ---------- 9. Password Form & Modals ---------- */
function setupPasswordForm() {
  $("#pwForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = await api("/api/admin/password", {
      method: "POST",
      body: JSON.stringify({
        current: $("#pwCurrent").value,
        next: $("#pwNext").value,
      }),
    });
    $("#pwMsg").textContent = d.ok
      ? "Password updated successfully."
      : d.error || "Failed to update.";
    if (d.ok) e.target.reset();
  });
}

function setupModals() {
  // ESC to close any modal
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".admin-modal.open").forEach((m) => m.classList.remove("open"));
    }
  });
}

/* ---------- 10. Ad Studio — generate on-brand property ads ---------- */
const AD_THEMES = {
  navy: {
    bgTop: "#0B1830",
    bgBottom: "#17305C",
    frameBorder: "rgba(197,160,89,0.55)",
    headText: "#FFFFFF",
    subText: "#C5A059",
    bodyText: "#D7DEE9",
    accent: "#C5A059",
    chipStroke: "rgba(197,160,89,0.65)",
    chipText: "#EAD9AF",
    footBg: "rgba(5,12,26,0.88)",
    footText: "#D7DEE9",
    badgeBg: "#C5A059",
    badgeText: "#0B1830",
  },
  ivory: {
    bgTop: "#F7F4ED",
    bgBottom: "#E9E3D4",
    frameBorder: "rgba(15,33,64,0.22)",
    headText: "#0F2140",
    subText: "#A5853F",
    bodyText: "#42506A",
    accent: "#0F2140",
    chipStroke: "rgba(15,33,64,0.4)",
    chipText: "#0F2140",
    footBg: "rgba(15,33,64,0.94)",
    footText: "#EDEAE2",
    badgeBg: "#0F2140",
    badgeText: "#F2E7C9",
  },
  noir: {
    bgTop: "#101014",
    bgBottom: "#1E1F27",
    frameBorder: "rgba(197,160,89,0.5)",
    headText: "#F4F1E9",
    subText: "#C5A059",
    bodyText: "#C9CBD3",
    accent: "#C5A059",
    chipStroke: "rgba(197,160,89,0.55)",
    chipText: "#E8DFC8",
    footBg: "rgba(0,0,0,0.85)",
    footText: "#C9CBD3",
    badgeBg: "#C5A059",
    badgeText: "#101014",
  },
};

let adState = { photoUrl: "", generated: false };

function setupAdStudio() {
  if (!$("#adCanvas")) return;
  $("#asListing")?.addEventListener("change", onAdListingChange);
  $("#asPhotoFile")?.addEventListener("change", onAdPhotoUpload);
  $("#btnGenerateAd")?.addEventListener("click", generateAd);
  $("#btnDownloadAd")?.addEventListener("click", downloadAd);
  $("#btnSaveAdCreative")?.addEventListener("click", () => saveAdToServer("creative"));
  $("#btnSaveAdGallery")?.addEventListener("click", () => saveAdToServer("gallery"));
  ["#asFormat", "#asTheme"].forEach((sel) => {
    $(sel)?.addEventListener("change", () => {
      if (adState.generated) generateAd();
    });
  });
  ["#asTitle", "#asLocation", "#asPrice", "#asBadge", "#asSpecs", "#asTagline", "#asShowContact"].forEach(
    (sel) => {
      $(sel)?.addEventListener("change", () => {
        if (adState.generated) generateAd();
      });
    }
  );
}

function asMsg(text, ok) {
  const el = $("#asMsg");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
}

function currentAdListing() {
  const id = Number($("#asListing")?.value || 0);
  return listings.find((l) => l.id === id) || null;
}

function listingPhotoUrls(l) {
  if (!l) return [];
  let imgs = [];
  try {
    imgs = JSON.parse(l.images_json || "[]");
  } catch {}
  return [...new Set([l.image_url, ...imgs].filter(Boolean))];
}

function renderAdStudioOptions() {
  const sel = $("#asListing");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML =
    `<option value="">Custom property (manual details)</option>` +
    listings
      .map((l) => `<option value="${l.id}">${esc(l.title)}</option>`)
      .join("");
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  onAdListingChange();
}

function bindAdPhotoThumbs() {
  const grid = $("#asPhotoGrid");
  if (!grid) return;
  grid.querySelectorAll(".as-photo").forEach((b) => {
    b.addEventListener("click", () => {
      grid.querySelectorAll(".as-photo").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      adState.photoUrl = b.dataset.url || "";
      if (adState.generated) generateAd();
    });
  });
}

function onAdListingChange() {
  const l = currentAdListing();
  const grid = $("#asPhotoGrid");
  if (!grid) return;
  adState.photoUrl = "";

  if (l) {
    $("#asTitle").value = l.title || "";
    $("#asLocation").value = l.location || "";
    $("#asPrice").value = l.price || "";
    $("#asBadge").value = l.badge || "";
    let specs = [];
    try {
      specs = JSON.parse(l.specs_json || "[]");
    } catch {}
    $("#asSpecs").value = specs.slice(0, 3).join("\n");

    const urls = listingPhotoUrls(l);
    grid.innerHTML = urls.length
      ? urls
          .map(
            (u, i) => `
        <button type="button" class="as-photo${i === 0 ? " selected" : ""}" data-url="${esc(u)}" title="Use this picture in the ad">
          <img src="${esc(u)}" alt="" />
        </button>`
          )
          .join("")
      : `<p class="empty">No photos on this listing yet — upload one below.</p>`;
    adState.photoUrl = urls[0] || "";
    bindAdPhotoThumbs();
  } else {
    grid.innerHTML = `<p class="empty">Upload a photo below to use it in the ad.</p>`;
    adState.photoUrl = "";
  }

  const isViewer = !me || me.role === "viewer";
  const hasListing = !!l;
  if ($("#btnSaveAdCreative")) $("#btnSaveAdCreative").disabled = !adState.generated || !hasListing || isViewer;
  if ($("#btnSaveAdGallery")) $("#btnSaveAdGallery").disabled = !adState.generated || !hasListing || isViewer;
  if ($("#btnDownloadAd")) $("#btnDownloadAd").disabled = !adState.generated;
}

async function onAdPhotoUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const [ok] = splitHeic([file]);
  if (!ok) {
    e.target.value = "";
    return;
  }
  const fd = new FormData();
  fd.append("file", ok);
  asMsg("Uploading photo…", true);
  try {
    const res = await api("/api/admin/upload", { method: "POST", body: fd });
    if (res.ok && res.url) {
      adState.photoUrl = res.url;
      const grid = $("#asPhotoGrid");
      grid.querySelector("p.empty")?.remove();
      const b = document.createElement("button");
      b.type = "button";
      b.className = "as-photo selected";
      b.dataset.url = res.url;
      b.title = "Use this picture in the ad";
      b.innerHTML = `<img src="${res.url}" alt="" />`;
      grid.querySelectorAll(".as-photo").forEach((x) => x.classList.remove("selected"));
      grid.prepend(b);
      bindAdPhotoThumbs();
      asMsg("Photo uploaded — press ✨ Generate Ad to render it.", true);
      if (adState.generated) generateAd();
    } else {
      asMsg(res.error || "Upload failed.", false);
    }
  } catch {
    asMsg("Upload failed — check your connection.", false);
  }
  e.target.value = "";
}

/* ----- canvas rendering helpers ----- */
function loadAdImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    // Required so photos stored in Supabase Storage can be drawn onto the
    // canvas and still be exported as PNG (no tainted canvas).
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapAdText(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let cur = words[i++];
    while (i < words.length && ctx.measureText(cur + " " + words[i]).width <= maxWidth) {
      cur += " " + words[i++];
    }
    lines.push(cur);
  }
  /* Only add an ellipsis when words genuinely remain unshown */
  if (i < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length && ctx.measureText(last + "…").width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = last.trimEnd() + "…";
  }
  return lines;
}

function setCtxFont(ctx, weight, sizePx, family, italic = false) {
  ctx.font = `${italic ? "italic " : ""}${weight} ${sizePx}px ${family}`;
}

async function generateAd() {
  const canvas = $("#adCanvas");
  if (!canvas) return;
  const [W, H] = ($("#asFormat").value || "1080x1350").split("x").map(Number);
  canvas.width = W;
  canvas.height = H;

  const T = AD_THEMES[$("#asTheme").value] || AD_THEMES.navy;
  const title = $("#asTitle").value.trim() || "Providers Real Estate";
  const location = $("#asLocation").value.trim();
  const price = $("#asPrice").value.trim();
  const badge = ($("#asBadge").value.trim() || "").toUpperCase();
  const tagline = $("#asTagline").value.trim() || "Invest today. Live tomorrow.";
  const chips = $("#asSpecs").value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const showContact = $("#asShowContact").checked;

  asMsg("Rendering ad…", true);
  try {
    await Promise.all([
      document.fonts.load('600 40px "Playfair Display"'),
      document.fonts.load('italic 500 24px "Playfair Display"'),
      document.fonts.load('400 24px "Jost"'),
      document.fonts.load('500 24px "Jost"'),
      document.fonts.load('600 24px "Jost"'),
    ]);
  } catch {}

  const img = await loadAdImage(adState.photoUrl);
  const ctx = canvas.getContext("2d");
  const pad = Math.round(W * 0.055);
  const serif = '"Playfair Display", Georgia, serif';
  const sans = '"Jost", "Segoe UI", Arial, sans-serif';

  /* background */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, T.bgTop);
  bg.addColorStop(1, T.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* subtle corner glow */
  const glow = ctx.createRadialGradient(W - pad, pad, 10, W - pad, pad, W * 0.45);
  glow.addColorStop(0, "rgba(197,160,89,0.14)");
  glow.addColorStop(1, "rgba(197,160,89,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  /* header: wordmark + tagline + hairline */
  const headH = Math.round(W * 0.115);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(W * 0.005)}px`;
  setCtxFont(ctx, 600, Math.round(W * 0.043), serif);
  ctx.fillStyle = T.headText;
  ctx.fillText("PROVIDERS", pad, pad + Math.round(W * 0.043));
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  setCtxFont(ctx, 500, Math.round(W * 0.0155), sans);
  ctx.fillStyle = T.subText;
  ctx.fillText("R E A L  E S T A T E  P V T .  L T D .", pad + 2, pad + Math.round(W * 0.072));

  ctx.textAlign = "right";
  setCtxFont(ctx, 500, Math.round(W * 0.02), serif, true);
  ctx.fillStyle = T.subText;
  ctx.fillText(tagline, W - pad, pad + Math.round(W * 0.03));

  ctx.strokeStyle = T.frameBorder;
  ctx.lineWidth = Math.max(1.5, W * 0.002);
  ctx.beginPath();
  ctx.moveTo(pad, pad + headH - Math.round(W * 0.028));
  ctx.lineTo(W - pad, pad + headH - Math.round(W * 0.028));
  ctx.stroke();

  /* footer strip */
  const footH = showContact ? Math.max(Math.round(H * 0.11), Math.round(W * 0.085)) : 0;
  if (showContact) {
    ctx.fillStyle = T.footBg;
    ctx.fillRect(0, H - footH, W, footH);
    ctx.fillStyle = T.accent;
    ctx.fillRect(0, H - footH, W, Math.max(2.5, W * 0.0032));
    ctx.textAlign = "left";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(W * 0.0022)}px`;
    setCtxFont(ctx, 600, Math.round(W * 0.017), sans);
    ctx.fillStyle = T.footText;
    ctx.fillText(
      "PRIVATE VIEWINGS BY APPOINTMENT  ·  VIPUL AGNIHOTRI",
      pad,
      H - footH + Math.round(footH * 0.42)
    );
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    setCtxFont(ctx, 400, Math.round(W * 0.019), sans);
    ctx.fillStyle = T.accent;
    ctx.fillText(
      "+91 98103 33886      ·      @providersrealestate",
      pad,
      H - footH + Math.round(footH * 0.74)
    );
    ctx.textAlign = "right";
    setCtxFont(ctx, 500, Math.round(W * 0.016), sans);
    ctx.fillStyle = T.footText;
    ctx.fillText("South Delhi  ·  Gurugram", W - pad, H - footH + Math.round(footH * 0.6));
  }

  const innerTop = pad + headH;
  const innerBottom = H - footH - pad;
  const innerW = W - pad * 2;
  const landscape = H < W * 0.8;

  /* text metrics */
  const titleSize = Math.round(W * (landscape ? 0.034 : 0.05));
  const metaSize = Math.round(W * (landscape ? 0.021 : 0.024));
  const priceSize = Math.round(W * (landscape ? 0.027 : 0.03));
  const chipSize = Math.round(W * (landscape ? 0.017 : 0.019));

  const drawTextBlock = (x, y, maxW, maxBottom, titleLines) => {
    let cy = y;
    ctx.textAlign = "left";
    setCtxFont(ctx, 600, titleSize, serif);
    const lines = wrapAdText(ctx, title, maxW, titleLines);
    ctx.fillStyle = T.headText;
    for (const ln of lines) {
      cy += titleSize * 1.16;
      if (cy <= maxBottom) ctx.fillText(ln, x, cy);
    }
    cy += titleSize * 0.5;

    if (location || price) {
      setCtxFont(ctx, 400, metaSize, sans);
      ctx.fillStyle = T.bodyText;
      let locPart = location || "";
      const priceW = price
        ? (() => {
            setCtxFont(ctx, 600, priceSize, sans);
            const w = ctx.measureText(price).width;
            setCtxFont(ctx, 400, metaSize, sans);
            return w;
          })()
        : 0;
      const sepW = location && price ? metaSize * 1.8 : 0;
      const avail = maxW - priceW - sepW;
      if (locPart && ctx.measureText(locPart).width > avail) {
        while (locPart.length && ctx.measureText(locPart + "…").width > avail) {
          locPart = locPart.slice(0, -1).trimEnd();
        }
        locPart = locPart.trimEnd() + "…";
      }
      const locW = locPart ? ctx.measureText(locPart).width : 0;
      if (locPart) ctx.fillText(locPart, x, cy);
      if (price) {
        const dotX = x + locW + (locPart ? metaSize * 0.9 : 0);
        if (locPart) {
          ctx.fillStyle = T.accent;
          ctx.fillText("·", dotX, cy);
        }
        setCtxFont(ctx, 600, priceSize, sans);
        ctx.fillStyle = T.accent;
        ctx.fillText(price, dotX + (locPart ? metaSize * 0.9 : 0), cy + priceSize * 0.12);
      }
      cy += priceSize * 1.35;
    }

    /* highlight chips — never draw past the footer line */
    if (chips.length) {
      setCtxFont(ctx, 500, chipSize, sans);
      let cx = x;
      cy += chipSize * 0.6;
      const chipH = chipSize * 1.9;
      for (const c of chips) {
        const cw = ctx.measureText(c).width + chipSize * 1.6;
        if (cx + cw > x + maxW) {
          cx = x;
          cy += chipH + chipSize * 0.55;
        }
        if (cy + chipH > maxBottom) break; // footer safety clamp
        ctx.strokeStyle = T.chipStroke;
        ctx.lineWidth = Math.max(1.2, W * 0.0014);
        roundRectPath(ctx, cx, cy, cw, chipH, chipH / 2);
        ctx.stroke();
        ctx.fillStyle = T.chipText;
        ctx.fillText(c, cx + chipSize * 0.8, cy + chipH * 0.66);
        cx += cw + chipSize * 0.55;
      }
      cy += chipH;
    }
    return cy;
  };

  if (landscape) {
    /* photo left, text right */
    const photoW = Math.round(innerW * 0.42);
    const photoX = pad;
    const photoY = innerTop;
    const photoH = innerBottom - innerTop;
    if (img) {
      ctx.save();
      roundRectPath(ctx, photoX, photoY, photoW, photoH, Math.round(W * 0.018));
      ctx.clip();
      drawCover(ctx, img, photoX, photoY, photoW, photoH);
      const fade = ctx.createLinearGradient(0, photoY + photoH * 0.6, 0, photoY + photoH);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(6,14,30,0.45)");
      ctx.fillStyle = fade;
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.restore();
      roundRectPath(ctx, photoX, photoY, photoW, photoH, Math.round(W * 0.018));
      ctx.strokeStyle = T.frameBorder;
      ctx.lineWidth = Math.max(2, W * 0.0022);
      ctx.stroke();
      if (badge)
        drawBadgePill(ctx, T, photoX + Math.round(W * 0.018), photoY + Math.round(W * 0.018), badge, W, sans);
    }
    const tx = photoX + photoW + Math.round(W * 0.04);
    drawTextBlock(tx, innerTop + Math.round(H * 0.02), W - pad - tx, innerBottom - chipSize, 3);
  } else {
    /* photo full-width, text below */
    const photoX = pad;
    const photoY = innerTop;
    const textBlockH = Math.round(W * 0.315);
    const photoH = Math.max(Math.round(W * 0.3), Math.min(Math.round(W * 0.62), innerBottom - innerTop - textBlockH));
    if (img) {
      ctx.save();
      roundRectPath(ctx, photoX, photoY, innerW, photoH, Math.round(W * 0.02));
      ctx.clip();
      drawCover(ctx, img, photoX, photoY, innerW, photoH);
      const fade = ctx.createLinearGradient(0, photoY + photoH * 0.6, 0, photoY + photoH);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(6,14,30,0.5)");
      ctx.fillStyle = fade;
      ctx.fillRect(photoX, photoY, innerW, photoH);
      ctx.restore();
      roundRectPath(ctx, photoX, photoY, innerW, photoH, Math.round(W * 0.02));
      ctx.strokeStyle = T.frameBorder;
      ctx.lineWidth = Math.max(2, W * 0.0022);
      ctx.stroke();
      if (badge)
        drawBadgePill(ctx, T, photoX + Math.round(W * 0.022), photoY + Math.round(W * 0.022), badge, W, sans);
    }
    drawTextBlock(photoX, photoY + photoH + Math.round(W * 0.045), innerW, innerBottom, 2);
  }

  canvas.hidden = false;
  $("#adStageEmpty").classList.add("hidden");
  adState.generated = true;
  $("#btnDownloadAd").disabled = false;
  const l = currentAdListing();
  const isViewer = !me || me.role === "viewer";
  $("#btnSaveAdCreative").disabled = !l || isViewer;
  $("#btnSaveAdGallery").disabled = !l || isViewer;
  asMsg("", true);
}

function drawBadgePill(ctx, T, x, y, text, W, sans) {
  const size = Math.round(W * 0.019);
  setCtxFont(ctx, 600, size, sans);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(W * 0.0018)}px`;
  const tw = ctx.measureText(text).width;
  const bw = tw + size * 2.4;
  const bh = size * 2.2;
  ctx.fillStyle = T.badgeBg;
  roundRectPath(ctx, x, y, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = T.badgeText;
  ctx.textAlign = "left";
  ctx.fillText(text, x + size * 1.2, y + bh * 0.68);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

function downloadAd() {
  const canvas = $("#adCanvas");
  if (!canvas || !adState.generated) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    const slug =
      ($("#asTitle").value || "ad")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "ad";
    a.href = URL.createObjectURL(blob);
    a.download = `providers-ad-${slug}-${$("#asFormat").value}-${$("#asTheme").value}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Ad downloaded — ready to post.");
  }, "image/png");
}

async function saveAdToServer(mode) {
  const l = currentAdListing();
  if (!l) {
    asMsg("Choose a listing first — custom ads can only be downloaded.", false);
    return;
  }
  if (!me || me.role === "viewer") {
    asMsg("View-only account — ask an editor to save the ad.", false);
    return;
  }
  const canvas = $("#adCanvas");
  if (!canvas || !adState.generated) return;

  canvas.toBlob(async (blob) => {
    if (!blob) return asMsg("Could not render the PNG.", false);
    const fd = new FormData();
    fd.append("file", blob, `providers-ad-${l.id}-${Date.now()}.png`);
    asMsg("Saving to server…", true);
    try {
      const up = await api("/api/admin/upload", { method: "POST", body: fd });
      if (!up.ok) return asMsg(up.error || "Upload failed.", false);

      if (mode === "creative") {
        const r = await api(`/api/admin/listings/${l.id}`, {
          method: "PATCH",
          body: JSON.stringify({ image_url: up.url, marketing_status: "ad ready" }),
        });
        if (!r.ok) return asMsg(r.error || "Could not save the ad.", false);
        asMsg("✅ Saved as the ad creative (main picture) and moved to “ad ready”.", true);
      } else {
        const next = [...listingPhotoUrls(l), up.url];
        const r = await api(`/api/admin/listings/${l.id}`, {
          method: "PATCH",
          body: JSON.stringify({ images: next, image_url: l.image_url || up.url }),
        });
        if (!r.ok) return asMsg(r.error || "Could not save the ad.", false);
        asMsg("✅ Added to the listing photo gallery.", true);
      }
      toast("Ad saved to the listing.");
      await refreshAllData();
    } catch {
      asMsg("Upload failed — check your connection.", false);
    }
  }, "image/png");
}
