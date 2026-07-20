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
