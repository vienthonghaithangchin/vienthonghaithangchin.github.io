(() => {
  const STORAGE_KEY = "v29-cart-v1";
  const cart = readCart();
  let checkoutFormData = null;
  let checkoutReference = "";

  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name).map((item) => ({
        id: String(item.id), name: String(item.name), code: String(item.code || ""),
        image: String(item.image || ""), link: String(item.link || ""),
        price: normalizePrice(item.price), priceVatNote: String(item.priceVatNote || ""),
        quantity: Math.max(1, Math.min(99, Number.parseInt(item.quantity, 10) || 1)),
      })) : [];
    } catch {
      return [];
    }
  }

  function normalizePrice(value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
    if (typeof value !== "string" || !/\d/.test(value)) return null;
    const digits = Number(value.replace(/[^\d]/g, ""));
    return Number.isFinite(digits) && digits > 0 ? digits : null;
  }

  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* storage may be disabled */ }
    updateCartBadge();
    renderCartPage();
  }

  function formatPrice(value) {
    return Number(value).toLocaleString("vi-VN") + " ₫";
  }

  function updateCartBadge() {
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll(".cart-count").forEach((badge) => { badge.textContent = String(count); });
    document.querySelectorAll(".header-cart-link").forEach((link) => {
      link.setAttribute("aria-label", `Giỏ hàng, ${count} sản phẩm`);
    });
  }

  function add(item) {
    if (!item || !item.id || !item.name) return;
    const existing = cart.find((entry) => entry.id === String(item.id));
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + 1);
      existing.name = String(item.name);
      existing.price = normalizePrice(item.price);
      existing.priceVatNote = String(item.priceVatNote || "");
    } else {
      cart.push({
        id: String(item.id), name: String(item.name), code: String(item.code || ""),
        image: String(item.image || ""), link: String(item.link || ""),
        price: normalizePrice(item.price), priceVatNote: String(item.priceVatNote || ""), quantity: 1,
      });
    }
    saveCart();
    window.dispatchEvent(new CustomEvent("v29:cart-updated", { detail: { count: cart.length } }));
  }

  function setQuantity(id, quantity) {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    const value = Number.parseInt(quantity, 10);
    if (!Number.isFinite(value) || value <= 0) {
      cart.splice(cart.indexOf(item), 1);
    } else {
      item.quantity = Math.max(1, Math.min(99, value));
    }
    saveCart();
  }

  function remove(id) {
    const index = cart.findIndex((item) => item.id === id);
    if (index >= 0) cart.splice(index, 1);
    saveCart();
  }

  function cartTotals() {
    const knownSubtotal = cart.reduce((sum, item) => sum + (item.price === null ? 0 : item.price * item.quantity), 0);
    return { knownSubtotal, hasUnpriced: cart.some((item) => item.price === null) };
  }

  function renderCartPage() {
    const list = document.getElementById("cart-items");
    if (!list) return;
    const empty = document.getElementById("cart-empty");
    const total = document.getElementById("cart-total");
    const continueButton = document.getElementById("continue-to-customer");
    list.replaceChildren();
    if (empty) empty.hidden = cart.length !== 0;
    if (continueButton) continueButton.disabled = cart.length === 0;

    cart.forEach((item) => {
      const row = document.createElement("article");
      row.className = "cart-line";
      if (item.image) {
        const image = document.createElement("img");
        image.src = item.image;
        image.alt = "";
        image.loading = "lazy";
        row.appendChild(image);
      }
      const details = document.createElement("div");
      details.className = "cart-line-details";
      const name = document.createElement(item.link ? "a" : "h3");
      name.textContent = item.name;
      if (item.link) name.href = item.link;
      details.appendChild(name);
      if (item.code) {
        const code = document.createElement("p");
        code.textContent = `Mã sản phẩm: ${item.code}`;
        details.appendChild(code);
      }
      const price = document.createElement("p");
      price.className = "cart-line-price";
      price.textContent = item.price === null ? "Giá: cần xác nhận" : `Đơn giá: ${formatPrice(item.price)}`;
      details.appendChild(price);
      if (item.priceVatNote) {
        const vat = document.createElement("small");
        vat.textContent = item.priceVatNote;
        details.appendChild(vat);
      }
      row.appendChild(details);

      const controls = document.createElement("div");
      controls.className = "cart-line-controls";
      const quantityLabel = document.createElement("label");
      quantityLabel.textContent = "Số lượng";
      const quantity = document.createElement("input");
      quantity.type = "number";
      quantity.min = "1";
      quantity.max = "99";
      quantity.step = "1";
      quantity.value = String(item.quantity);
      quantity.setAttribute("aria-label", `Số lượng ${item.name}`);
      quantity.addEventListener("change", () => setQuantity(item.id, quantity.value));
      quantityLabel.appendChild(quantity);
      controls.appendChild(quantityLabel);
      const lineTotal = document.createElement("strong");
      lineTotal.textContent = item.price === null ? "Tạm tính: chờ báo giá" : `Tạm tính: ${formatPrice(item.price * item.quantity)}`;
      controls.appendChild(lineTotal);
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "cart-remove";
      removeButton.textContent = "Xóa";
      removeButton.setAttribute("aria-label", `Xóa ${item.name} khỏi giỏ hàng`);
      removeButton.addEventListener("click", () => remove(item.id));
      controls.appendChild(removeButton);
      row.appendChild(controls);
      list.appendChild(row);
    });

    if (total) {
      const { knownSubtotal, hasUnpriced } = cartTotals();
      total.textContent = `Tạm tính các sản phẩm đã có giá: ${formatPrice(knownSubtotal)}${hasUnpriced ? " — sản phẩm chưa có giá sẽ được nhân viên xác nhận" : ""}. Phí giao nhận (nếu có) chưa tính.`;
    }
  }

  function goToStep(step) {
    document.querySelectorAll("[data-checkout-step]").forEach((panel) => {
      panel.hidden = panel.dataset.checkoutStep !== step;
    });
    document.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
      if (indicator.dataset.stepIndicator === step) indicator.setAttribute("aria-current", "step");
      else indicator.removeAttribute("aria-current");
    });
    const target = document.querySelector(`[data-checkout-step="${step}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function getFormData(form) {
    const data = new FormData(form);
    return {
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      email: String(data.get("email") || "").trim(),
      address: String(data.get("address") || "").trim(),
      payment: String(data.get("payment") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
    };
  }

  function renderReview() {
    const review = document.getElementById("order-review");
    if (!review || !checkoutFormData) return;
    review.replaceChildren();
    const customer = document.createElement("dl");
    customer.className = "order-review-customer";
    [["Người nhận", checkoutFormData.name], ["Điện thoại", checkoutFormData.phone], ["Email", checkoutFormData.email || "Không cung cấp"], ["Địa chỉ", checkoutFormData.address], ["Thanh toán mong muốn", checkoutFormData.payment], ["Ghi chú", checkoutFormData.notes || "Không có"]].forEach(([label, value]) => {
      const term = document.createElement("dt"); term.textContent = label;
      const detail = document.createElement("dd"); detail.textContent = value;
      customer.append(term, detail);
    });
    review.appendChild(customer);
    const items = document.createElement("ul");
    items.className = "order-review-items";
    cart.forEach((item) => {
      const line = document.createElement("li");
      line.textContent = `${item.name}${item.code ? ` (${item.code})` : ""} — SL ${item.quantity} — ${item.price === null ? "giá cần xác nhận" : formatPrice(item.price * item.quantity)}`;
      items.appendChild(line);
    });
    review.appendChild(items);
    const { knownSubtotal, hasUnpriced } = cartTotals();
    const sum = document.createElement("p");
    sum.className = "cart-total";
    sum.textContent = `Tạm tính đã biết: ${formatPrice(knownSubtotal)}${hasUnpriced ? "; còn sản phẩm chờ xác nhận giá" : ""}; phí giao nhận chưa tính.`;
    review.appendChild(sum);
  }

  function getCheckoutReference() {
    if (!checkoutReference) checkoutReference = `V29-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
    return checkoutReference;
  }

  function orderMessageBody() {
    const orderNumber = getCheckoutReference();
    const lines = cart.map((item, index) => `${index + 1}. ${item.name}${item.code ? ` | Mã: ${item.code}` : ""} | SL: ${item.quantity} | ${item.price === null ? "Giá cần xác nhận" : formatPrice(item.price * item.quantity)}`);
    const { knownSubtotal, hasUnpriced } = cartTotals();
    return [
      `Mã yêu cầu: ${orderNumber}`,
      "YÊU CẦU ĐẶT HÀNG / XÁC NHẬN BÁO GIÁ",
      "",
      ...lines,
      `Tạm tính đã biết: ${formatPrice(knownSubtotal)}`,
      hasUnpriced ? "Có sản phẩm cần xác nhận giá." : "",
      "Phí giao nhận: đề nghị công ty xác nhận.",
      "",
      `Người nhận: ${checkoutFormData.name}`,
      `Điện thoại: ${checkoutFormData.phone}`,
      `Email: ${checkoutFormData.email || "Không cung cấp"}`,
      `Địa chỉ: ${checkoutFormData.address}`,
      `Thanh toán mong muốn: ${checkoutFormData.payment}`,
      `Ghi chú: ${checkoutFormData.notes || "Không có"}`,
      "",
      "Tôi hiểu đây là yêu cầu chờ công ty xác nhận, chưa phải đơn hàng được chấp nhận.",
    ].filter(Boolean).join("\n");
  }

  function orderEmailUrl() {
    return `mailto:info@vienthong29.vn?subject=${encodeURIComponent(`Yêu cầu ${getCheckoutReference()} - Viễn Thông Hai Tháng Chín`)}&body=${encodeURIComponent(orderMessageBody())}`;
  }

  function showContactCompletion(title, message) {
    const titleNode = document.getElementById("order-complete-title");
    const messageNode = document.getElementById("order-complete-message");
    if (titleNode) titleNode.textContent = title;
    if (messageNode) messageNode.textContent = message;
    goToStep("complete");
  }

  function bindCheckout() {
    document.getElementById("continue-to-customer")?.addEventListener("click", () => {
      if (cart.length === 0) return;
      goToStep("customer");
      document.querySelector('#checkout-form input[name="name"]')?.focus({ preventScroll: true });
    });
    document.querySelectorAll("[data-go-step]").forEach((button) => {
      button.addEventListener("click", () => goToStep(button.dataset.goStep));
    });
    const form = document.getElementById("checkout-form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (cart.length === 0 || !form.reportValidity()) return;
      checkoutFormData = getFormData(form);
      renderReview();
      goToStep("review");
    });
    document.getElementById("send-order-email")?.addEventListener("click", () => {
      if (!checkoutFormData || cart.length === 0) return;
      showContactCompletion("Tiếp tục gửi email", "Ứng dụng email đã được mở sẵn nội dung yêu cầu. Hãy kiểm tra và bấm “Gửi” để công ty nhận được yêu cầu; nhân viên sẽ xác nhận lại giá, tồn kho và điều kiện giao dịch.");
      window.location.href = orderEmailUrl();
    });
    document.getElementById("send-order-zalo")?.addEventListener("click", async () => {
      if (!checkoutFormData || cart.length === 0) return;
      const message = orderMessageBody();
      const fallback = document.getElementById("order-copy-fallback");
      const copyBox = document.getElementById("order-copy-content");
      if (copyBox) copyBox.value = message;
      showContactCompletion("Tiếp tục gửi yêu cầu qua Zalo", "Zalo sẽ mở trong cửa sổ mới. Nội dung đơn đã được sao chép nếu trình duyệt cho phép; hãy dán vào cuộc trò chuyện và bấm gửi. Website không tự gửi tin nhắn Zalo.");
      document.getElementById("order-zalo-link")?.click();
      try {
        await navigator.clipboard.writeText(message);
      } catch (_) {
        if (fallback) fallback.hidden = false;
        copyBox?.focus();
        copyBox?.select();
      }
    });
    document.getElementById("call-about-order")?.addEventListener("click", () => {
      if (!checkoutFormData || cart.length === 0) return;
      showContactCompletion("Gọi để trao đổi yêu cầu", "Trình gọi điện sẽ mở. Hãy cung cấp thông tin người nhận và mã yêu cầu " + getCheckoutReference() + " để nhân viên tra cứu. Cuộc gọi chưa đồng nghĩa đơn hàng đã được chấp nhận.");
    });
  }

  window.VienthongCart = { add, getItems: () => cart.map((item) => ({ ...item })) };
  window.initializeCartHeader = updateCartBadge;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { updateCartBadge(); renderCartPage(); bindCheckout(); });
  } else {
    updateCartBadge(); renderCartPage(); bindCheckout();
  }
})();
