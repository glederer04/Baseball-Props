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
  nodes.forEach((node, index) => {
    node.classList.add("reveal-on-scroll");
    node.style.setProperty("--reveal-delay", `${Math.min(index * 45, 240)}ms`);
  });

  const updateScrollEffects = () => {
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const docHeight = Math.max(document.body.scrollHeight - window.innerHeight, 1);
    const progress = Math.max(0, Math.min(scrollTop / docHeight, 1));
    document.body.style.setProperty("--scroll-progress", progress.toFixed(4));
    document.body.classList.toggle("is-scrolling-down", scrollTop > (updateScrollEffects.lastTop || 0));
    document.body.classList.toggle("is-scrolling-up", scrollTop < (updateScrollEffects.lastTop || 0));
    updateScrollEffects.lastTop = scrollTop;
  };
  updateScrollEffects.lastTop = 0;
  updateScrollEffects();

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      updateScrollEffects();
      ticking = false;
    });
  }, { passive: true });

  const reveal = node => node.classList.add("is-visible");
  const hide = node => node.classList.remove("is-visible");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach(reveal);
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        reveal(entry.target);
      } else {
        hide(entry.target);
      }
    });
  }, {
    rootMargin: "0px 0px -6% 0px",
    threshold: 0.18
  });

  nodes.forEach(node => observer.observe(node));
})();
