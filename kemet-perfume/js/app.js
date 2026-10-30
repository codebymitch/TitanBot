(function () {
  "use strict";

  var K = window.KEMET;
  var root = document.documentElement;
  var lang = "ar";

  try {
    var saved = localStorage.getItem("kemet-lang");
    if (saved === "ar" || saved === "en") lang = saved;
  } catch (e) {}

  function t(key) {
    return (K.i18n[lang] && K.i18n[lang][key]) || key;
  }

  // Resolve a { ar, en } pair (or a plain string/number) to display text, or null.
  function pick(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return value[lang] || value.ar || value.en || null;
    return String(value);
  }

  function waLink(text) {
    return "https://wa.me/" + K.whatsapp.number + "?text=" + encodeURIComponent(text);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(id) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  function button(className, href, label, iconId) {
    var a = el("a", className);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    if (iconId) a.appendChild(icon(iconId));
    a.appendChild(el("span", null, label));
    return a;
  }

  function notesRow(label, value) {
    var text = pick(value);
    if (!text) return null;
    var row = el("div", "note");
    row.appendChild(el("dt", null, label));
    row.appendChild(el("dd", null, text));
    return row;
  }

  function renderCard(p) {
    var name = pick(p.name);
    var card = el("article", "card reveal" + (name ? "" : " is-empty"));

    var media = el("div", "card-media");
    if (p.image) {
      var img = el("img");
      img.src = p.image;
      img.alt = name || "";
      img.loading = "lazy";
      media.appendChild(img);
    } else {
      media.appendChild(icon("ankh"));
    }
    if (!name) media.appendChild(el("span", "badge", t("card.soon")));
    card.appendChild(media);

    var body = el("div", "card-body");
    body.appendChild(el("h3", null, name || t("card.soonName")));

    var family = pick(p.family);
    if (family) body.appendChild(el("p", "family", family));

    var desc = pick(p.description);
    body.appendChild(el("p", "muted", desc || (name ? "" : t("card.soonText"))));

    if (p.notes) {
      var notes = el("dl", "notes");
      [
        notesRow(t("card.notes.top"), p.notes.top),
        notesRow(t("card.notes.heart"), p.notes.heart),
        notesRow(t("card.notes.base"), p.notes.base),
      ].forEach(function (row) {
        if (row) notes.appendChild(row);
      });
      if (notes.children.length) body.appendChild(notes);
    }

    var meta = el("div", "card-meta");
    if (p.size) meta.appendChild(el("span", null, p.size));
    if (name) {
      var price = typeof p.price === "number" ? p.price.toLocaleString(lang === "ar" ? "ar-EG" : "en-US") + (lang === "ar" ? " ج.م" : " EGP") : t("card.askPrice");
      meta.appendChild(el("strong", null, price));
    }
    if (meta.children.length) body.appendChild(meta);

    var href = name ? waLink(t("wa.product") + name) : waLink(t("wa.generic"));
    body.appendChild(button("btn btn-outline btn-sm", href, name ? t("card.order") : t("card.ask"), "whatsapp"));

    card.appendChild(body);
    return card;
  }

  function renderGrid() {
    var grid = document.getElementById("perfumeGrid");
    grid.textContent = "";
    K.perfumes.forEach(function (p) {
      grid.appendChild(renderCard(p));
    });
    observeReveals();
  }

  function applyLang() {
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-wa]").forEach(function (a) {
      a.href = waLink(t("wa.generic"));
    });
    document.getElementById("phoneText").textContent = K.whatsapp.display;
    renderGrid();
  }

  // Scroll reveal
  var io = null;
  function observeReveals() {
    var items = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (n) { n.classList.add("in"); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
    }
    items.forEach(function (n) { io.observe(n); });
  }

  // Language switch
  document.getElementById("langBtn").addEventListener("click", function () {
    lang = lang === "ar" ? "en" : "ar";
    try { localStorage.setItem("kemet-lang", lang); } catch (e) {}
    applyLang();
  });

  // Mobile menu
  var burger = document.getElementById("burger");
  var nav = document.getElementById("nav");
  function setMenu(open) {
    nav.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
  }
  burger.addEventListener("click", function () {
    setMenu(!nav.classList.contains("open"));
  });
  nav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") setMenu(false);
  });

  // Header gets a solid background once the page scrolls
  var header = document.querySelector(".site-header");
  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  document.getElementById("year").textContent = new Date().getFullYear();
  applyLang();
})();
