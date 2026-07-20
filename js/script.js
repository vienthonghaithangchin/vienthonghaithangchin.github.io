document.addEventListener("DOMContentLoaded", () => {
  initializePopup();
  initializeSidebarFilters();
});

function initializePopup() {
  const closeButton = document.getElementById("closePopup");
  const popup = document.getElementById("popup");

  if (!closeButton || !popup) return;

  closeButton.addEventListener("click", () => {
    popup.style.display = "none";
  });
}

function initSlider() {
  const slides = document.querySelectorAll(".slides img");
  if (slides.length < 2) return;

  let index = 0;

  window.setInterval(() => {
    slides[index].classList.remove("active");
    index = (index + 1) % slides.length;
    slides[index].classList.add("active");
  }, 5000);
}

function initializeSidebarFilters() {
  const checkboxes = document.querySelectorAll(".filter-sidebar input");
  if (checkboxes.length === 0) return;

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", filterSidebarProducts);
  });
}

function filterSidebarProducts() {
  const selectedShapes = Array.from(
    document.querySelectorAll(".filter-shape:checked"),
    (input) => input.value,
  );
  const selectedResolutions = Array.from(
    document.querySelectorAll(".filter-resolution:checked"),
    (input) => input.value,
  );

  document.querySelectorAll(".product-card").forEach((card) => {
    const matchesShape =
      selectedShapes.length === 0 || selectedShapes.includes(card.dataset.shape);
    const matchesResolution =
      selectedResolutions.length === 0 ||
      selectedResolutions.includes(card.dataset.resolution);

    card.hidden = !(matchesShape && matchesResolution);
  });
}
