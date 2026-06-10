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
    node.style.setProperty("--section-progress", "0");
    node.style.setProperty("--section-shift", "0px");
    node.style.setProperty("--section-tilt", "0deg");
    node.style.setProperty("--section-scale", "1");
  });

  const updateScrollEffects = () => {
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const docHeight = Math.max(document.body.scrollHeight - window.innerHeight, 1);
    const progress = Math.max(0, Math.min(scrollTop / docHeight, 1));
    document.body.style.setProperty("--scroll-progress", progress.toFixed(4));
    document.body.classList.toggle("is-scrolling-down", scrollTop > (updateScrollEffects.lastTop || 0));
    document.body.classList.toggle("is-scrolling-up", scrollTop < (updateScrollEffects.lastTop || 0));
    updateScrollEffects.lastTop = scrollTop;
    const viewportHeight = window.innerHeight || 1;
    nodes.forEach(node => {
      const rect = node.getBoundingClientRect();
      const nodeCenter = rect.top + rect.height / 2;
      const viewportCenter = viewportHeight / 2;
      const distance = (nodeCenter - viewportCenter) / viewportHeight;
      const clamped = Math.max(-1, Math.min(1, distance));
      const visibility = Math.max(0, Math.min(1, 1 - Math.abs(clamped) * 1.35));
      node.style.setProperty("--section-progress", visibility.toFixed(4));
      node.style.setProperty("--section-shift", `${(-clamped * 18).toFixed(2)}px`);
      node.style.setProperty("--section-tilt", `${(clamped * -1.6).toFixed(2)}deg`);
      node.style.setProperty("--section-scale", `${(0.985 + visibility * 0.02).toFixed(4)}`);
    });
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
