const INTERNAL_PAGES = [
  ["home", "./index.html", "Home"],
  ["about", "./about.html", "About"],
  ["services", "./services.html", "Services"],
  ["blog", "./blog.html", "Blog"],
  ["contact", "./contact.html", "Contact"]
];

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"];
const STORED_UTM_KEY = "metropolis.analytics.utm";

document.addEventListener("DOMContentLoaded", () => {
  renderSharedLayout();
  const utmParams = captureAndPersistUtmParams();
  decorateInternalLinks(utmParams);
  logPageView(utmParams);
  bindClickTracking();
  bindContactForm(utmParams);
});

function renderSharedLayout() {
  const currentPage = document.body.dataset.page || "";
  const headerTarget = document.querySelector('[data-include="header"]');
  const footerTarget = document.querySelector('[data-include="footer"]');

  if (headerTarget) {
    const navLinks = INTERNAL_PAGES.map(([key, href, label]) => {
      const activeClass = currentPage === key ? "active" : "";
      return `<a class="${activeClass}" href="${href}" data-track="nav_${key}">${label}</a>`;
    }).join("");

    headerTarget.innerHTML = `
      <header class="site-header">
        <div class="container nav-shell">
          <a class="brand-lockup" href="./index.html" data-track="nav_brand" aria-label="Metropolis home">
            <span class="brand-mark">Metropolis</span>
            <span class="brand-name">Analytics Demo</span>
          </a>
          <nav class="site-nav-links" aria-label="Primary navigation">
            ${navLinks}
          </nav>
        </div>
      </header>
    `;
  }

  if (footerTarget) {
    footerTarget.innerHTML = `
      <footer class="site-footer">
        <div class="container footer-shell">
          <div>
            <span class="brand-mark">Metropolis</span>
            <p>Static HTML demo for validating GA4 page views, Creatio visitor stitching, CTA clicks, downloads, and contact form submissions.</p>
          </div>
          <div class="site-nav-links" aria-label="Footer navigation">
            ${INTERNAL_PAGES.map(([, href, label]) => `<a href="${href}" data-track="footer_${label.toLowerCase()}">${label}</a>`).join("")}
          </div>
        </div>
      </footer>
    `;
  }
}

function captureAndPersistUtmParams() {
  const url = new URL(window.location.href);
  const currentParams = {};

  // Keep only the campaign fields we need for QA and navigation persistence.
  UTM_KEYS.forEach((key) => {
    const value = url.searchParams.get(key);
    if (value) {
      currentParams[key] = value;
    }
  });

  const storedParams = readStoredUtmParams();
  const mergedParams = { ...storedParams, ...currentParams };

  if (Object.keys(mergedParams).length > 0) {
    sessionStorage.setItem(STORED_UTM_KEY, JSON.stringify(mergedParams));
    console.info("[UTM] Active parameters:", mergedParams);
  } else {
    console.info("[UTM] No active parameters on this session.");
  }

  return mergedParams;
}

function readStoredUtmParams() {
  try {
    const rawValue = sessionStorage.getItem(STORED_UTM_KEY);
    return rawValue ? JSON.parse(rawValue) : {};
  } catch (error) {
    console.warn("[UTM] Unable to parse stored parameters.", error);
    return {};
  }
}

function decorateInternalLinks(utmParams) {
  document.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || anchor.hasAttribute("download")) {
      return;
    }

    const resolvedUrl = new URL(href, window.location.href);
    if (resolvedUrl.origin !== window.location.origin) {
      return;
    }

    if (!resolvedUrl.pathname.endsWith(".html")) {
      return;
    }

    Object.entries(utmParams).forEach(([key, value]) => {
      if (!resolvedUrl.searchParams.has(key)) {
        resolvedUrl.searchParams.set(key, value);
      }
    });

    anchor.href = resolvedUrl.toString();
  });
}

function logPageView(utmParams) {
  const pageTitle = document.body.dataset.pageTitle || document.title;
  const pagePath = `${window.location.pathname}${window.location.search}`;
  const pagePayload = { page_title: pageTitle, page_path: pagePath, ...utmParams };

  console.info("[Analytics] Page view:", pagePayload);

  if (typeof window.gtag === "function") {
    window.gtag("event", "page_view_debug", pagePayload);
  }
}

function bindClickTracking() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("a, button");
    if (!target) {
      return;
    }

    const label = target.dataset.track || target.textContent.trim() || "interaction";
    const href = target.getAttribute("href");
    const isOutbound = href ? new URL(href, window.location.href).origin !== window.location.origin : false;
    const payload = {
      interaction_label: label,
      interaction_type: target.tagName.toLowerCase(),
      destination: href || "",
      outbound: isOutbound
    };

    console.info("[Analytics] Click:", payload);

    if (typeof window.gtag === "function") {
      window.gtag("event", isOutbound ? "outbound_click_debug" : "click_debug", payload);
    }
  });
}

function bindContactForm(utmParams) {
  const form = document.getElementById("contact-form");
  if (!form) {
    return;
  }

  const status = document.getElementById("form-status");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      showFormStatus(status, "Please complete all required fields before submitting.", false);
      return;
    }

    const formData = new FormData(form);
    const trackingUserId = window.crtUserId || "";
    // TrackingUserId is the bridge between the submitted contact and Creatio's visitor identity.
    const payload = {
      FirstName: formData.get("FirstName"),
      LastName: formData.get("LastName"),
      Email: formData.get("Email"),
      Phone: formData.get("Phone"),
      TrackingUserId: trackingUserId,
      PageUrl: window.location.href,
      UTM: utmParams
    };

    console.info("[Analytics] Form submission:", payload);

    if (typeof window.gtag === "function") {
      window.gtag("event", "form_submit_debug", payload);
    }

    try {
      const response = await fetch("https://httpbin.org/post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Mock webhook returned ${response.status}`);
      }

      showFormStatus(status, "Thanks. Your inquiry was submitted successfully for analytics testing.", true);
      form.reset();
    } catch (error) {
      console.error("[Analytics] Form submission failed:", error);
      showFormStatus(status, "Submission could not reach the mock webhook. Check the console and network panel for details.", false);
    }
  });
}

function showFormStatus(element, message, isSuccess) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("is-success", isSuccess);
  element.classList.toggle("is-error", !isSuccess);
}
