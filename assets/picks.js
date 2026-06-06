(() => {
  const slipKey = "diamondSignalSlip";
  const ticketsKey = "diamondSignalTickets";
  const version = 1;

  const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const pct = value => Number.isFinite(value) ? `${(100 * value).toFixed(1)}%` : "-";
  const cleanOdds = value => {
    const parsed = Number(String(value || "").replace(/[^\d+-]/g, ""));
    return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
  };
  const americanToDecimal = odds => odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
  const decimalToAmerican = decimal => {
    if (!Number.isFinite(decimal) || decimal <= 1) return "-";
    return decimal >= 2 ? `+${money.format(Math.round((decimal - 1) * 100))}` : `${money.format(Math.round(-100 / (decimal - 1)))}`;
  };
  const legKey = leg => [leg.slateDate, leg.market, leg.selection, leg.matchup, leg.side, leg.line].join("|");
  const read = key => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const escapeText = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  const currentSlip = () => read(slipKey);
  const savedTickets = () => read(ticketsKey);

  const saveSlip = slip => {
    write(slipKey, slip);
    updateSlipCount();
    syncAddButtons();
    updateFloatingLink();
    renderSlip();
  };

  const updateSlipCount = () => {
    const count = currentSlip().length;
    document.querySelectorAll("[data-slip-count]").forEach(node => node.textContent = String(count));
  };

  const syncAddButtons = () => {
    const slipKeys = new Set(currentSlip().map(legKey));
    document.querySelectorAll(".add-pick-btn").forEach(button => {
      const added = slipKeys.has(legKey(getButtonLeg(button)));
      button.classList.toggle("added", added);
      button.textContent = added ? "Added" : "+ add";
      button.setAttribute("aria-pressed", added ? "true" : "false");
    });
  };

  const updateFloatingLink = () => {
    const count = currentSlip().length;
    let link = document.querySelector("[data-floating-slip-link]");
    if (!count) {
      link?.remove();
      return;
    }
    if (!link) {
      link = document.createElement("a");
      link.className = "floating-slip-link";
      link.href = "picks.html";
      link.dataset.floatingSlipLink = "";
      document.body.appendChild(link);
    }
    link.innerHTML = `Go to My Picks <strong data-slip-count>${count}</strong>`;
  };

  const getButtonLeg = button => ({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    version,
    slateDate: button.dataset.slateDate || "",
    selection: button.dataset.selection || "",
    matchup: button.dataset.matchup || "",
    gameTime: button.dataset.gameTime || "",
    market: button.dataset.market || "",
    marketLabel: button.dataset.marketLabel || button.dataset.market || "",
    side: button.dataset.side || "",
    line: Number(button.dataset.line || "0"),
    recommendation: button.dataset.recommendation || "",
    modelProbability: Number(button.dataset.modelProbability || "0"),
    confidence: Number(button.dataset.confidence || "0"),
    odds: ""
  });

  const bindAddButtons = () => {
    document.querySelectorAll(".add-pick-btn").forEach(button => {
      button.addEventListener("click", () => {
        const leg = getButtonLeg(button);
        const slip = currentSlip();
        if (!slip.some(item => legKey(item) === legKey(leg))) slip.push(leg);
        write(slipKey, slip);
        updateSlipCount();
        syncAddButtons();
        updateFloatingLink();
        renderSlip();
      });
    });
    syncAddButtons();
    updateFloatingLink();
  };

  const totalOdds = legs => {
    const decimals = legs.map(leg => cleanOdds(leg.odds)).filter(Boolean).map(americanToDecimal);
    if (decimals.length !== legs.length || !legs.length) return { decimal: null, american: "-" };
    const decimal = decimals.reduce((product, value) => product * value, 1);
    return { decimal, american: decimalToAmerican(decimal) };
  };

  const formatLeg = leg => `
    <div class="pick-leg">
      <div>
        <strong>${escapeText(leg.selection)}</strong>
        <span>${escapeText(leg.recommendation || `${leg.side} ${leg.line}`)}</span>
        <small>${escapeText(leg.marketLabel)} · ${escapeText(leg.matchup)} · ${escapeText(leg.gameTime)}</small>
      </div>
    </div>`;

  const renderSlip = () => {
    const container = document.querySelector("[data-pick-slip]");
    if (!container) return;
    const slip = currentSlip();
    if (!slip.length) {
      container.innerHTML = `<div class="empty-state compact"><h3>No picks selected.</h3><p>Add legs from the Model Board, then come back here to enter odds and save the slip.</p></div>`;
      return;
    }
    const odds = totalOdds(slip);
    container.innerHTML = `
      <div class="ticket-card active-ticket">
        <div class="ticket-head">
          <div><span class="card-kicker">Current slip</span><h3>${slip.length === 1 ? "Single" : `${slip.length}-leg parlay`}</h3></div>
          <strong data-current-slip-odds>${odds.american}</strong>
        </div>
        <div class="slip-list">
          ${slip.map((leg, index) => `
            <div class="slip-row">
              ${formatLeg(leg)}
              <label>Odds <input class="odds-input" data-odds-index="${index}" inputmode="numeric" placeholder="-110" value="${escapeText(leg.odds || "")}"></label>
              <button class="remove-leg-btn" type="button" data-remove-index="${index}">Remove</button>
            </div>
          `).join("")}
        </div>
        <div class="ticket-actions">
          <button class="button-primary save-ticket-btn" type="button">Save Slip</button>
          <button class="button-ghost clear-slip-btn" type="button">Clear</button>
        </div>
      </div>`;

    container.querySelectorAll(".odds-input").forEach(input => {
      input.addEventListener("input", () => {
        const next = currentSlip();
        next[Number(input.dataset.oddsIndex)].odds = input.value;
        write(slipKey, next);
        const odds = totalOdds(next);
        const totalNode = container.querySelector("[data-current-slip-odds]");
        if (totalNode) totalNode.textContent = odds.american;
      });
    });
    container.querySelectorAll(".remove-leg-btn").forEach(button => {
      button.addEventListener("click", () => {
        const next = currentSlip().filter((_, index) => index !== Number(button.dataset.removeIndex));
        saveSlip(next);
      });
    });
    container.querySelector(".clear-slip-btn")?.addEventListener("click", () => saveSlip([]));
    container.querySelector(".save-ticket-btn")?.addEventListener("click", () => saveTicket());
  };

  const saveTicket = () => {
    const legs = currentSlip();
    if (!legs.length) return;
    if (legs.some(leg => !cleanOdds(leg.odds))) {
      alert("Add American odds for every leg before saving.");
      return;
    }
    const odds = totalOdds(legs);
    const tickets = savedTickets();
    tickets.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      version,
      savedAt: new Date().toISOString(),
      type: legs.length === 1 ? "Single" : `${legs.length}-leg parlay`,
      totalAmericanOdds: odds.american,
      totalDecimalOdds: odds.decimal,
      legs
    });
    write(ticketsKey, tickets);
    write(slipKey, []);
    updateSlipCount();
    syncAddButtons();
    updateFloatingLink();
    renderSlip();
    renderTickets();
  };

  const parseCsv = text => {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (cell || row.length) { row.push(cell); rows.push(row); row = []; cell = ""; }
        if (char === "\r" && next === "\n") i++;
      } else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const headers = rows.shift() || [];
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  };

  const resultIndex = async () => {
    try {
      const response = await fetch("site-data/pick_results.csv", { cache: "no-store" });
      if (!response.ok) return new Map();
      const rows = parseCsv(await response.text());
      return new Map(rows.map(row => [[row.slate_date, row.market, row.selection, row.matchup].join("|"), row]));
    } catch {
      return new Map();
    }
  };

  const gradeLeg = (leg, results) => {
    const row = results.get([leg.slateDate, leg.market, leg.selection, leg.matchup].join("|"));
    if (!row) return { status: "Pending", detail: "Awaiting final result" };
    if (leg.market === "nrfi") {
      const actualNrfi = Number(row.actual_nrfi);
      const won = leg.side === "NRFI" ? actualNrfi === 1 : actualNrfi === 0;
      return { status: won ? "Won" : "Lost", detail: actualNrfi === 1 ? "NRFI hit" : "Run scored in 1st" };
    }
    const actual = Number(row.actual_count);
    const line = Number(leg.line);
    if (!Number.isFinite(actual)) return { status: "Pending", detail: "Awaiting stat" };
    const won = leg.side === "Over" ? actual > line : actual < line;
    const pushed = actual === line;
    return { status: pushed ? "Push" : won ? "Won" : "Lost", detail: `Actual ${actual}` };
  };

  const ticketStatus = grades => {
    if (grades.some(grade => grade.status === "Lost")) return "Lost";
    if (grades.some(grade => grade.status === "Pending")) return "Pending";
    if (grades.every(grade => grade.status === "Push")) return "Push";
    return "Won";
  };

  const renderTickets = async () => {
    const container = document.querySelector("[data-saved-tickets]");
    const summary = document.querySelector("[data-pick-summary]");
    if (!container) return;
    const tickets = savedTickets();
    const results = await resultIndex();
    if (!tickets.length) {
      container.innerHTML = `<div class="empty-state compact"><h3>No saved slips yet.</h3><p>Saved singles and parlays will appear here with grading once final game data is available.</p></div>`;
      if (summary) summary.innerHTML = "";
      return;
    }
    const graded = tickets.map(ticket => {
      const grades = ticket.legs.map(leg => gradeLeg(leg, results));
      return { ...ticket, grades, status: ticketStatus(grades) };
    });
    const settled = graded.filter(ticket => ticket.status !== "Pending");
    const wins = settled.filter(ticket => ticket.status === "Won").length;
    if (summary) {
      summary.innerHTML = `
        <div class="metric"><span class="metric-label">Saved slips</span><span class="metric-value">${tickets.length}</span><span class="metric-detail">Stored in this browser</span></div>
        <div class="metric"><span class="metric-label">Settled record</span><span class="metric-value">${wins}-${Math.max(0, settled.length - wins)}</span><span class="metric-detail">Pushes excluded from wins</span></div>
        <div class="metric"><span class="metric-label">Win rate</span><span class="metric-value">${settled.length ? pct(wins / settled.length) : "-"}</span><span class="metric-detail">Saved slip results</span></div>
        <div class="metric action-metric"><button class="button-ghost clear-tickets-btn" type="button">Clear saved slips</button><span class="metric-detail">Removes all saved slips from this browser</span></div>`;
    }
    container.innerHTML = graded.map(ticket => `
      <div class="ticket-card">
        <div class="ticket-head">
          <div><span class="status-chip ${ticket.status.toLowerCase()}">${ticket.status}</span><h3>${escapeText(ticket.type)} · ${escapeText(ticket.totalAmericanOdds)}</h3><p>${new Date(ticket.savedAt).toLocaleString()}</p></div>
          <button class="delete-ticket-btn" type="button" data-ticket-id="${escapeText(ticket.id)}">Delete</button>
        </div>
        <div class="ticket-leg-list">
          ${ticket.legs.map((leg, index) => `
            <div class="ticket-leg">
              ${formatLeg(leg)}
              <div><strong>${escapeText(leg.odds)}</strong><br><span class="status-chip ${ticket.grades[index].status.toLowerCase()}">${ticket.grades[index].status}</span><small>${escapeText(ticket.grades[index].detail)}</small></div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
    container.querySelectorAll(".delete-ticket-btn").forEach(button => {
      button.addEventListener("click", () => {
        write(ticketsKey, savedTickets().filter(ticket => ticket.id !== button.dataset.ticketId));
        renderTickets();
      });
    });
    summary?.querySelector(".clear-tickets-btn")?.addEventListener("click", () => {
      if (confirm("Clear all saved slips from this browser?")) {
        write(ticketsKey, []);
        renderTickets();
      }
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindAddButtons();
    updateSlipCount();
    syncAddButtons();
    updateFloatingLink();
    renderSlip();
    renderTickets();
  });
})();
