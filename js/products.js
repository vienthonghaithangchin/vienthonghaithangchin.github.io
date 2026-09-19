const PRODUCTS_PER_LOAD = 12;

const catalogState = {
  allProducts: [],
  visibleProducts: [],
  renderedCount: 0,
  loading: false,
  selectedBrands: new Set(),
  selectedCategory: "all",
  selectedProductTypes: new Set(),
  selectedResolutions: new Set(),
  keyword: "",
  sortMode: "",
  infiniteScrollPaused: false,
};

document.addEventListener("DOMContentLoaded", initializeProducts);

async function initializeProducts() {
  try {
    const response = await fetch("/data/products-index.json");

    if (!response.ok) {
      throw new Error(`Không thể tải products.json (${response.status})`);
    }

    const productsById = await response.json();
    const embeddedProduct = readEmbeddedProductData();
    if (embeddedProduct?.id && embeddedProduct?.product) {
      const indexedProduct = productsById[embeddedProduct.id] || {};
      productsById[embeddedProduct.id] = {
        ...embeddedProduct.product,
        price: indexedProduct.price ?? embeddedProduct.product.price,
      };
    }

    catalogState.allProducts = Object.entries(productsById)
      .filter(([, product]) => product && typeof product === "object")
      .map(([id, product]) => ({ id, ...product }));

    hydrateStaticCards(productsById);
    hydrateProductDetail(productsById);
    initializeDynamicCatalog();
    initializeDailyFeaturedProducts();
    initializeCatalogToolbar();
    initializeFilters();
    initializeSorting();
  } catch (error) {
    console.error("Lỗi tải dữ liệu sản phẩm:", error);
    showCatalogMessage("Không thể tải danh sách sản phẩm. Vui lòng thử lại sau.");
  }
}


function readEmbeddedProductData() {
  const element = document.getElementById("product-data");
  if (!element) return null;
  try {
    return JSON.parse(element.textContent);
  } catch (error) {
    console.error("Dữ liệu chi tiết sản phẩm không hợp lệ:", error);
    return null;
  }
}

function hydrateStaticCards(productsById) {
  document.querySelectorAll(".product-card[data-product]").forEach((card) => {
    const product = productsById[card.dataset.product];

    if (!product) return;

    setCardDataset(card, product);
    setText(card, ".product-name", product.name);
    setText(card, ".product-code", product.code);
    setText(card, ".product-price", formatPrice(effectivePrice(product)));

    const detailLink = card.querySelector(".detail-btn");
    if (detailLink && product.link) {
      detailLink.href = productDetailUrl(product.link);
    }

    const image = card.querySelector(".product-image");
    if (image) {
      image.src = product.thumbnail || product.image;
      image.alt = product.name;
      image.loading = "lazy";
      image.decoding = "async";
    }
  });
}

function hydrateProductDetail(productsById) {
  const detail = document.querySelector(".product-detail[data-product]");
  if (!detail) return;

  const product = productsById[detail.dataset.product];
  if (!product) return;

  setText(detail, ".product-name", product.name);
  setText(detail, ".product-code", product.code);
  setText(detail, ".product-brand", product.brand);
  setText(detail, ".product-warranty", product.warranty);
  setText(detail, ".product-price", formatPrice(effectivePrice(product)));

  const image = detail.querySelector(".product-image");
  if (image) {
    image.src = product.thumbnail || product.image;
    image.alt = product.name;
  }

  renderProductDescription(detail, product.description);
  renderProductSpecifications(detail, product);
}

function renderProductDescription(detail, description) {
  const container = detail.querySelector(".product-description");
  if (!container || !Array.isArray(description) || description.length === 0) {
    return;
  }

  container.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Đặc điểm nổi bật";

  const list = document.createElement("ul");
  description
    .flatMap((item) => String(item || "").split(/\s+(?:–|—|-)\s+/))
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = `- ${item}`;
      list.appendChild(listItem);
    });

  container.append(title, list);
}

function initializeDynamicCatalog() {
  const container = document.querySelector(".products[data-catalog]");
  if (!container) return;

  const brand = normalize(container.dataset.brand);
  const category = normalize(container.dataset.category);
  const industry = normalize(container.dataset.industry);

  catalogState.visibleProducts = catalogState.allProducts.filter((product) => {
    const matchesBrand = !brand || normalize(product.brand) === brand;
    const matchesCategory = !category || normalize(product.category) === category;
    const matchesIndustry = !industry || normalize(product.industry) === industry;
    return matchesBrand && matchesCategory && matchesIndustry;
  });

  applySort();
  container.innerHTML = "";
  catalogState.renderedCount = 0;
  renderNextProducts();
  updateCatalogCount();

  window.addEventListener("scroll", handleInfiniteScroll, { passive: true });
}

function renderNextProducts() {
  const container = document.querySelector(".products[data-catalog]");
  if (!container || catalogState.loading) return;

  catalogState.loading = true;

  const nextProducts = catalogState.visibleProducts.slice(
    catalogState.renderedCount,
    catalogState.renderedCount + PRODUCTS_PER_LOAD,
  );

  const fragment = document.createDocumentFragment();
  nextProducts.forEach((product) => fragment.appendChild(createProductCard(product)));
  container.appendChild(fragment);

  catalogState.renderedCount += nextProducts.length;
  catalogState.loading = false;
  updateCatalogCount();
}

window.pauseCatalogInfiniteScroll = function pauseCatalogInfiniteScroll() {
  catalogState.infiniteScrollPaused = true;
};

function productDetailUrl(link) {
  if (!link || link === "#") return "#";
  return `${link.split("#")[0]}#product-detail`;
}

function createProductCard(product) {
  const card = document.createElement("div");
  card.className = "product-card";
  card.dataset.product = product.id;
  setCardDataset(card, product);

  const image = document.createElement("img");
  image.className = "product-image";
  image.src = product.thumbnail || product.image;
  image.alt = product.name;
  image.width = 640;
  image.height = 640;
  image.loading = "lazy";
  image.decoding = "async";

  const name = document.createElement("h5");
  name.className = "product-name";
  name.textContent = product.name;

  const code = document.createElement("h5");
  code.className = "product-code-box";
  code.append("Mã sản phẩm: ");

  const codeValue = document.createElement("span");
  codeValue.className = "product-code";
  codeValue.textContent = product.code || product.id;
  code.appendChild(codeValue);

  const price = document.createElement("p");
  price.className = "product-price";
  price.textContent = formatPrice(effectivePrice(product));

  const link = document.createElement("a");
  link.className = "detail-btn";
  link.href = productDetailUrl(product.link);
  link.textContent = "Xem Chi Tiết";

  card.append(image, name, code, price, link);
  return card;
}

function handleInfiniteScroll() {
  if (catalogState.infiniteScrollPaused) {
    const container = document.querySelector(".products[data-catalog]");
    if (!container) return;
    const productBottom = container.getBoundingClientRect().bottom + window.scrollY;
    if (window.scrollY + window.innerHeight >= productBottom) return;
    catalogState.infiniteScrollPaused = false;
  }

  if (catalogState.renderedCount >= catalogState.visibleProducts.length) return;

  const nearBottom =
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 500;

  if (nearBottom) renderNextProducts();
}



function initializeDailyFeaturedProducts() {
  const container = document.querySelector(".products[data-featured-products]");
  if (!container) return;

  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const random = createSeededRandom(hashText(`featured-${dateKey}`));
  const requestedCount = 18;
  const featuredIndustries = new Set(["camera giám sát", "thiết bị mạng", "tổng đài"]);
  const eligibleProducts = catalogState.allProducts.filter(
    (product) =>
      product.name &&
      product.image &&
      product.link &&
      featuredIndustries.has(normalize(product.industry)),
  );

  const productsByBrand = new Map();
  eligibleProducts.forEach((product) => {
    const brand = String(product.brand || "Thương hiệu khác").trim();
    if (!productsByBrand.has(brand)) productsByBrand.set(brand, []);
    productsByBrand.get(brand).push(product);
  });

  const selectedProducts = [];
  const selectedIds = new Set();
  const brandGroups = shuffleWithRandom([...productsByBrand.values()], random);

  // Pick one item from each brand first so the home page stays diverse.
  brandGroups.forEach((group) => {
    if (selectedProducts.length >= requestedCount) return;
    const product = group[Math.floor(random() * group.length)];
    selectedProducts.push(product);
    selectedIds.add(product.id);
  });

  const remainingProducts = shuffleWithRandom(
    eligibleProducts.filter((product) => !selectedIds.has(product.id)),
    random,
  );
  selectedProducts.push(...remainingProducts.slice(0, requestedCount - selectedProducts.length));

  container.innerHTML = "";
  const fragment = document.createDocumentFragment();
  selectedProducts.forEach((product) => fragment.appendChild(createProductCard(product)));
  container.appendChild(fragment);
  container.dataset.featuredDate = dateKey;

  // Refresh shortly after midnight if somebody keeps the page open overnight.
  window.clearTimeout(window.dailyFeaturedProductsTimer);
  const now = new Date();
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 5, 0);
  window.dailyFeaturedProductsTimer = window.setTimeout(
    initializeDailyFeaturedProducts,
    nextDay.getTime() - now.getTime(),
  );
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  return function seededRandom() {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRandom(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function searchProduct() {
  const input = document.getElementById("searchInput");
  applyCatalogFilter({ keyword: input?.value || "" });
}

function setCardDataset(card, product) {
  card.dataset.category = product.category || "";
  card.dataset.brand = product.brand || "";
  card.dataset.resolution = product.resolution || "";
  card.dataset.productType = product.productType || product.category || "";
  card.dataset.price = numericPrice(effectivePrice(product));
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element && value !== undefined && value !== null) {
    element.textContent = value;
  }
}


function effectivePrice(product) {
  if (!product || typeof product !== "object") return product;
  const validUntil = product.priceValidUntil ? Date.parse(product.priceValidUntil) : NaN;
  if (Number.isFinite(validUntil) && validUntil <= Date.now()) {
    return product.previousPrice ?? "Liên hệ";
  }
  return product.price;
}

function formatPrice(price) {
  if (price === undefined || price === null || price === "") return "Liên hệ";
  if (typeof price === "number") return `Giá: ${price.toLocaleString("vi-VN")} đ`;

  const text = String(price).trim();
  if (/liên hệ|vui lòng gọi/i.test(text)) return "Liên hệ";
  return /^giá:/i.test(text) ? text : `Giá: ${text}${/đ|vnd/i.test(text) ? "" : " đ"}`;
}

function numericPrice(price) {
  const value = Number(String(price ?? "").replace(/\D/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function updateCatalogCount() {
  const status = document.querySelector("[data-catalog-status]");
  if (!status) return;

  status.textContent = `Đang hiển thị ${Math.min(
    catalogState.renderedCount,
    catalogState.visibleProducts.length,
  )}/${catalogState.visibleProducts.length} sản phẩm`;
}

function showCatalogMessage(message) {
  const container = document.querySelector(".products[data-catalog]");
  if (container) container.innerHTML = `<p class="catalog-message">${message}</p>`;
}


function initializeCatalogToolbar() {
  const container = document.querySelector(".products[data-catalog]");
  if (!container || document.querySelector(".catalog-toolbar")) return;

  if (container.dataset.globalSearch === "true") {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
    if (initialQuery) {
      setGlobalSearchQuery(initialQuery);
    } else {
      applyCatalogFilter();
    }
    return;
  }

  const pageBrand = normalize(container.dataset.brand);
  const pageCategory = normalize(container.dataset.category);
  const pageIndustry = normalize(container.dataset.industry);
  const scopedProducts = catalogState.allProducts.filter((product) => {
    const matchesBrand = !pageBrand || normalize(product.brand) === pageBrand;
    const matchesCategory = !pageCategory || normalize(product.category) === pageCategory;
    const matchesIndustry = !pageIndustry || normalize(product.industry) === pageIndustry;
    return matchesBrand && matchesCategory && matchesIndustry;
  });

  const toolbar = document.createElement("div");
  toolbar.className = "catalog-toolbar";
  toolbar.setAttribute("role", "region");
  toolbar.setAttribute("aria-label", "Bộ lọc sản phẩm");

  const brands = [...new Set(scopedProducts.map((product) => product.brand).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "vi"));
  if (!pageBrand && brands.length > 1) {
    toolbar.appendChild(createCatalogCheckboxGroup(
      "catalogBrandFilter",
      "Thương hiệu",
      brands.map((brand) => [brand, brand]),
      (values) => {
        catalogState.selectedBrands = new Set(values.map(normalize));
        applyCatalogFilter();
      },
    ));
  }

  const productTypes = [...new Set(
    scopedProducts.map((product) => product.productType || product.category).filter(Boolean),
  )].sort((a, b) => productTypeOrder(a) - productTypeOrder(b) || a.localeCompare(b, "vi"));
  if (productTypes.length > 1) {
    toolbar.appendChild(createCatalogCheckboxGroup(
      "catalogProductTypeFilter",
      "Loại sản phẩm",
      productTypes.map((productType) => [productType, categoryLabel(productType)]),
      (values) => {
        catalogState.selectedProductTypes = new Set(values.map(normalize));
        applyCatalogFilter();
      },
    ));
  }

  const resolutions = [...new Set(scopedProducts.map((product) => product.resolution).filter(Boolean))]
    .sort((a, b) => numericResolution(a) - numericResolution(b));
  if (resolutions.length > 1) {
    toolbar.appendChild(createCatalogCheckboxGroup(
      "catalogResolutionFilter",
      "Độ phân giải",
      resolutions.map((resolution) => [resolution, resolution]),
      (values) => {
        catalogState.selectedResolutions = new Set(values.map(normalize));
        applyCatalogFilter();
      },
    ));
  }

  const sortSelect = createCatalogSelect("sortPrice", "Sắp xếp", [
    ["", "Mặc định"],
    ["name-az", "Tên A → Z"],
    ["name-za", "Tên Z → A"],
    ["low-high", "Giá thấp → cao"],
    ["high-low", "Giá cao → thấp"],
  ]);
  toolbar.appendChild(sortSelect.wrapper);

  const heading = document.querySelector(".section-title");
  if (heading) heading.insertAdjacentElement("afterend", toolbar);
  else container.parentElement?.insertBefore(toolbar, container);

  if (container.dataset.globalSearch === "true") {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
    if (initialQuery) {
      catalogState.keyword = initialQuery;
      applyCatalogFilter();
    }
  }
}

function createCatalogCheckboxGroup(id, label, options, onChange) {
  const fieldset = document.createElement("fieldset");
  fieldset.id = id;
  fieldset.className = "catalog-checkbox-group";
  if (options.length > 6) fieldset.classList.add("catalog-checkbox-group--wide");

  const legend = document.createElement("legend");
  legend.textContent = label;
  const optionContainer = document.createElement("div");
  optionContainer.className = "catalog-checkbox-options";

  options.forEach(([value, text]) => {
    const optionLabel = document.createElement("label");
    optionLabel.className = "catalog-checkbox-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    const optionText = document.createElement("span");
    optionText.textContent = text;
    optionLabel.append(checkbox, optionText);
    optionContainer.appendChild(optionLabel);
  });

  fieldset.append(legend, optionContainer);
  fieldset.addEventListener("change", () => {
    const selectedValues = [...fieldset.querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => checkbox.value);
    onChange(selectedValues);
  });
  return fieldset;
}

function createCatalogSelect(id, label, options) {
  const wrapper = document.createElement("label");
  wrapper.className = "catalog-select";
  const visibleLabel = document.createElement("span");
  visibleLabel.textContent = label;
  const select = document.createElement("select");
  select.id = id;
  options.forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  });
  wrapper.append(visibleLabel, select);
  return { wrapper, select };
}

function categoryLabel(category) {
  const labels = {
    bullet: "Camera Thân",
    dome: "Camera Dome",
    ptz: "Camera PTZ",
    nvr: "Đầu ghi hình",
    switch: "Switch PoE",
    accessory: "Phụ kiện",
  };
  return labels[normalize(category)] || category;
}

function productTypeOrder(value) {
  const order = [
    "camera thân ip", "camera thân analog", "camera dome ip", "camera dome analog",
    "camera ptz ip", "camera ptz analog", "đầu ghi nvr", "đầu ghi dvr/hybrid",
    "switch poe", "switch mạng", "phụ kiện",
  ];
  const index = order.indexOf(normalize(value));
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function numericResolution(value) {
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function initializeFilters() {
  const buttons = document.querySelectorAll(".filter-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      catalogState.selectedCategory = normalize(button.dataset.category) || "all";
      applyCatalogFilter();
    });
  });
}

function initializeSorting() {
  const sortSelect = document.getElementById("sortPrice");
  if (!sortSelect) return;
  sortSelect.addEventListener("change", () => {
    catalogState.sortMode = sortSelect.value;
    applySort(catalogState.sortMode);
    rerenderCatalog();
  });
}

function applyCatalogFilter(options = {}) {
  const container = document.querySelector(".products[data-catalog]");
  if (!container) return;

  if (Object.prototype.hasOwnProperty.call(options, "category")) {
    catalogState.selectedCategory = normalize(options.category) || "all";
  }
  if (Object.prototype.hasOwnProperty.call(options, "keyword")) {
    catalogState.keyword = options.keyword || "";
  }
  if (Object.prototype.hasOwnProperty.call(options, "resolution")) {
    const value = normalize(options.resolution);
    catalogState.selectedResolutions = value ? new Set([value]) : new Set();
  }

  const pageBrand = normalize(container.dataset.brand);
  const pageCategory = normalize(container.dataset.category);
  const pageIndustry = normalize(container.dataset.industry);
  const keyword = normalize(catalogState.keyword);
  const keywordTokens = keyword.split(/\s+/).filter(Boolean);

  catalogState.visibleProducts = catalogState.allProducts.filter((product) => {
    const matchesBrand = !pageBrand || normalize(product.brand) === pageBrand;
    const matchesSelectedBrand =
      catalogState.selectedBrands.size === 0 ||
      catalogState.selectedBrands.has(normalize(product.brand));
    const matchesPageCategory = !pageCategory || normalize(product.category) === pageCategory;
    const matchesCategory =
      catalogState.selectedCategory === "all" ||
      normalize(product.category) === catalogState.selectedCategory;
    const matchesProductType =
      catalogState.selectedProductTypes.size === 0 ||
      catalogState.selectedProductTypes.has(normalize(product.productType || product.category));
    const matchesResolution =
      catalogState.selectedResolutions.size === 0 ||
      catalogState.selectedResolutions.has(normalize(product.resolution));
    const haystack = normalize(
      `${product.name} ${product.id} ${product.code} ${product.brand} ${product.category} ${product.resolution}`,
    );
    const matchesKeyword = keywordTokens.every((token) => haystack.includes(token));
    const matchesIndustry = !pageIndustry || normalize(product.industry) === pageIndustry;
    return matchesBrand && matchesSelectedBrand && matchesPageCategory && matchesIndustry && matchesCategory &&
      matchesProductType && matchesResolution && matchesKeyword;
  });

  applySort(catalogState.sortMode);
  rerenderCatalog();
}

function rerenderCatalog() {
  const container = document.querySelector(".products[data-catalog]");
  if (!container) return;
  container.innerHTML = "";
  catalogState.renderedCount = 0;
  if (catalogState.visibleProducts.length === 0) {
    container.innerHTML = '<p class="catalog-message">Không tìm thấy sản phẩm phù hợp.</p>';
    updateCatalogCount();
    return;
  }
  renderNextProducts();
}

function applySort(mode = "") {
  if (mode === "low-high") {
    catalogState.visibleProducts.sort((a, b) => numericPrice(effectivePrice(a)) - numericPrice(effectivePrice(b)));
  } else if (mode === "high-low") {
    catalogState.visibleProducts.sort((a, b) => numericPrice(effectivePrice(b)) - numericPrice(effectivePrice(a)));
  } else if (mode === "name-az") {
    catalogState.visibleProducts.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  } else if (mode === "name-za") {
    catalogState.visibleProducts.sort((a, b) => b.name.localeCompare(a.name, "vi"));
  } else {
    catalogState.visibleProducts.sort(
      (a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER),
    );
  }
}


function setGlobalSearchQuery(keyword) {
  const value = String(keyword || "").trim();
  const toolbarInput = document.getElementById("catalogSearchInput");
  const headerInput = document.getElementById("searchInput");
  if (toolbarInput) toolbarInput.value = value;
  if (headerInput) headerInput.value = value;
  catalogState.keyword = value;
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("q", value);
  else url.searchParams.delete("q");
  window.history.replaceState({}, "", url);
  applyCatalogFilter();

  const results = document.querySelector('.products[data-catalog][data-global-search="true"]');
  if (!results || !value) return;

  if (catalogState.visibleProducts.length === 1) {
    const [product] = catalogState.visibleProducts;
    if (product.link) {
      window.location.assign(productDetailUrl(product.link));
    }
    return;
  }

  if (catalogState.visibleProducts.length > 1) {
    requestAnimationFrame(() => {
      const heading = document.querySelector(".section-title");
      (heading || results).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

window.setGlobalSearchQuery = setGlobalSearchQuery;

window.searchProduct = searchProduct;

/* PRODUCT TECHNICAL SPECIFICATIONS — rendered below every product detail */
function renderProductSpecifications(detail, product) {
  let panel = document.querySelector(".product-specifications[data-generated-specifications]");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "product-specifications";
    panel.dataset.generatedSpecifications = "true";
    panel.setAttribute("aria-labelledby", "product-specifications-title");
    detail.insertAdjacentElement("afterend", panel);
  }

  const rows = collectProductSpecifications(product);
  const body = rows.map(([label, value]) =>
    `<tr><th scope="row">${escapeProductText(label)}</th><td>${escapeProductText(value)}</td></tr>`,
  ).join("");
  panel.innerHTML = `<h2 class="product-specifications__title" id="product-specifications-title">THÔNG SỐ KỸ THUẬT</h2><table class="product-specifications__table"><tbody>${body}</tbody></table>`;
}

function collectProductSpecifications(product) {
  const rows = [];
  const supplied = product.specifications || product.specs || product.technicalSpecifications;
  if (Array.isArray(supplied)) {
    supplied.forEach((item) => {
      if (Array.isArray(item) && item.length >= 2 && item[1] != null && String(item[1]).trim()) rows.push([item[0], item[1]]);
      else if (item && typeof item === "object") {
        const label = item.label || item.name || item.key;
        const value = item.value || item.content;
        if (label && value != null && String(value).trim()) rows.push([label, value]);
      }
    });
  } else if (supplied && typeof supplied === "object") {
    Object.entries(supplied).forEach(([label, value]) => {
      if (value != null && String(value).trim()) rows.push([label, value]);
    });
  }

  if (rows.length === 0) rows.push(["Thông tin", "Thông số kỹ thuật đang được cập nhật theo Sieuthivienthong.com"]);
  return rows;
}

function escapeProductText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

