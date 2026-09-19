function loadHTML(id, file) {
  let target = document.getElementById(id);
  if (!target && id === "float") {
    target = document.createElement("div");
    target.id = "float";
    document.body.append(target);
  }
  if (!target) return Promise.resolve();

  return fetch(`${file}?v=20260720-2`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Không tìm thấy " + file);
      }

      return response.text();
    })
    .then((data) => {
      target.innerHTML = data;

      if (id === "header") {
        initializeGlobalProductSearch(target);
      }

      if (id === "float") {
        initializePageScrollButtons(target);
      }

      // Banner nằm trong menu.html
      if (id === "menu") {
        initMobileCategoryMenu(target);
        initCategoryNavigation(target);
        initSlider();

        // Cuộn lại sau khi menu tải xong để mốc neo không bị che hoặc lệch vị trí.
        const hashId = window.location.hash.slice(1);
        if (["product-detail", "main-content"].includes(hashId)) {
          requestAnimationFrame(() => {
            const detail = hashId === "product-detail"
              ? document.getElementById("product-detail") || document.querySelector(".product-detail")
              : document.getElementById("main-content") ||
                document.querySelector("main.local-service, .about-company, .policy-page");

            if (detail) {
              detail.id = hashId;
              detail.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          });
        }
      }
    })
    .catch((error) => console.error(error));
}

loadHTML("header", "/includes/header.html");
loadHTML("menu", "/includes/Menu.html");
loadHTML("footer", "/includes/footer.html");
loadHTML("product-sidebar", "/includes/product-sidebar.html");
loadHTML("float", "/includes/float.html");


function initializePageScrollButtons(root) {
  const topButton = root.querySelector(".scroll-to-top");
  const bottomButton = root.querySelector(".scroll-to-bottom");
  if (!topButton || !bottomButton) return;

  const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

  topButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior });
  });
  bottomButton.addEventListener("click", () => {
    if (typeof window.pauseCatalogInfiniteScroll === "function") {
      window.pauseCatalogInfiniteScroll();
    }

    const footer = document.getElementById("footer");
    if (footer) {
      footer.scrollIntoView({ behavior: "auto", block: "end" });
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    }
  });

  const updateButtonState = () => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    topButton.disabled = window.scrollY <= 2;
    bottomButton.disabled = window.scrollY >= maxScroll - 2;
  };

  updateButtonState();
  window.addEventListener("scroll", updateButtonState, { passive: true });
  window.addEventListener("resize", updateButtonState);
}


function initializeGlobalProductSearch(header) {
  const form = header.querySelector("#globalProductSearch");
  const input = header.querySelector("#searchInput");
  if (!form || !input) return;

  const currentQuery = new URLSearchParams(window.location.search).get("q") || "";
  input.value = currentQuery;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = input.value.trim();
    if (!keyword) {
      input.focus();
      return;
    }

    if (document.querySelector('[data-global-search="true"]') && window.setGlobalSearchQuery) {
      window.setGlobalSearchQuery(keyword);
      return;
    }

    window.location.href = `/tim-kiem.html?q=${encodeURIComponent(keyword)}`;
  });
}


function initMobileCategoryMenu(menuRoot) {
  const leftMenu = menuRoot.querySelector(".left-menu");
  const title = menuRoot.querySelector(".menu-title");
  const categoryMenu = menuRoot.querySelector(".category-menu");
  if (!leftMenu || !title || !categoryMenu) return;

  const phone = window.matchMedia("(max-width: 640px)").matches;
  if (phone) leftMenu.classList.add("is-open");
  if (!phone) {
    title.setAttribute("role", "button");
    title.setAttribute("tabindex", "0");
  }
  title.setAttribute("aria-expanded", String(phone));
  title.setAttribute("aria-controls", "mobile-category-menu");
  categoryMenu.id = "mobile-category-menu";

  const toggle = () => {
    if (window.matchMedia("(max-width: 640px)").matches) return;
    const open = leftMenu.classList.toggle("is-open");
    title.setAttribute("aria-expanded", String(open));
  };
  title.addEventListener("click", toggle);
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  });
}

function initCategoryNavigation(menuRoot) {
  menuRoot.querySelectorAll(".category-menu a[href]").forEach((link) => {
    link.addEventListener("click", () => {
      try {
        const destination = new URL(link.href);
        if (destination.origin === window.location.origin) {
          sessionStorage.setItem("scroll-to-category", destination.pathname);
        }
      } catch (error) {
        // Navigation still works when session storage is unavailable.
      }
    });
  });

  try {
    const destination = sessionStorage.getItem("scroll-to-category");
    if (destination !== window.location.pathname) return;
    sessionStorage.removeItem("scroll-to-category");
    const mainContent = document.querySelector(".breadcrumb, .section-title, main");
    if (mainContent) {
      requestAnimationFrame(() => mainContent.scrollIntoView({ block: "start" }));
    }
  } catch (error) {
    // Keep the page usable when session storage is unavailable.
  }
}
