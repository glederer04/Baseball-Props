(() => {
  const eligiblePaths = new Set([
    "/",
    "/index.html",
    "/performance.html",
    "/results.html",
    "/data-health.html"
  ]);

  const path = window.location.pathname || "/";
  const normalizedPath = path.replace(/^\/Baseball-Props/, "") || "/";
  if (!eligiblePaths.has(normalizedPath)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const selectors = [
    ".hero",
    ".status-strip",
    ".page-lead",
    ".metric-grid",
    ".market-grid",
    ".feature-grid",
    ".health-grid",
    ".callout-panel",
    ".method-step",
    ".signal-table-wrap"
  ];

  const nodes = [...document.querySelectorAll(selectors.join(","))]
    .filter(node => node.offsetParent !== null);
  if (!nodes.length) return;

  document.body.classList.add("scroll-reveal-enabled");
  nodes.forEach(node => node.classList.add("reveal-on-scroll"));

  const reveal = node => node.classList.add("is-visible");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach(reveal);
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -10% 0px",
    threshold: 0.12
  });

  nodes.forEach(node => observer.observe(node));
})();
