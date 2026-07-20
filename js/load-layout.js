function loadHTML(id, file) {
  const target = document.getElementById(id);
  if (!target) return Promise.resolve();

  return fetch(file)
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

      // Banner nằm trong menu.html
      if (id === "menu") {
        initMobileCategoryMenu(target);
        initSlider();

        // Nếu mở từ link có #product-detail thì cuộn sau khi menu tải xong
        if (window.location.hash === "#product-detail") {
          requestAnimationFrame(() => {
            document.getElementById("product-detail")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
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

  title.setAttribute("role", "button");
  title.setAttribute("tabindex", "0");
  title.setAttribute("aria-expanded", "false");
  title.setAttribute("aria-controls", "mobile-category-menu");
  categoryMenu.id = "mobile-category-menu";

  const toggle = () => {
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
