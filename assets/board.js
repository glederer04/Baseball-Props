document.addEventListener("DOMContentLoaded", () => {
  const rows = [...document.querySelectorAll(".projection-table tbody tr")];
  const chips = [...document.querySelectorAll(".filter-chip")];
  const matchup = document.querySelector("#matchup-filter");
  if (!rows.length || !matchup) return;

  [...new Set(rows.map(row => row.dataset.matchup))].sort().forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    matchup.appendChild(option);
  });

  const applyFilters = () => {
    const market = document.querySelector(".filter-chip.active")?.dataset.filter || "all";
    rows.forEach(row => {
      const showMarket = market === "all" || row.dataset.market === market;
      const showMatchup = matchup.value === "all" || row.dataset.matchup === matchup.value;
      row.hidden = !(showMarket && showMatchup);
    });
  };

  chips.forEach(chip => chip.addEventListener("click", () => {
    chips.forEach(item => item.classList.remove("active"));
    chip.classList.add("active");
    applyFilters();
  }));
  matchup.addEventListener("change", applyFilters);
});
