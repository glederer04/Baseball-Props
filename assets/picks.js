(() => {
  const slipKey = "diamondSignalSlip";
  const ticketsKey = "diamondSignalTickets";
  const version = 1;
  const state = {
    slip: [],
    tickets: []
  };
  const filters = {
    status: "All",
    type: "All",
    slate: "All",
    market: "All",
    query: "",
    sort: "Newest"
  };
  const legFilters = {
    status: "All",
    slate: "All",
    market: "All",
    query: "",
    sort: "Newest"
  };

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
  const normalizeMarket = value => value === "totals_1st_1_innings" ? "nrfi" : value;
  const aliasMap = new Map([
    ["as", "athletics"],
    ["athletics", "athletics"],
    ["oaklandathletics", "athletics"],
    ["losangelesangels", "angels"],
    ["angels", "angels"],
    ["houstonastros", "astros"],
    ["astros", "astros"],
    ["torontobluejays", "bluejays"],
    ["bluejays", "bluejays"],
    ["atlantabraves", "braves"],
    ["braves", "braves"],
    ["milwaukeebrewers", "brewers"],
    ["brewers", "brewers"],
    ["stlouiscardinals", "cardinals"],
    ["cardinals", "cardinals"],
    ["chicagocubs", "cubs"],
    ["cubs", "cubs"],
    ["arizonadiamondbacks", "diamondbacks"],
    ["dbacks", "diamondbacks"],
    ["diamondbacks", "diamondbacks"],
    ["losangelesdodgers", "dodgers"],
    ["dodgers", "dodgers"],
    ["sanfranciscogiants", "giants"],
    ["giants", "giants"],
    ["clevelandguardians", "guardians"],
    ["guardians", "guardians"],
    ["seattlemariners", "mariners"],
    ["mariners", "mariners"],
    ["miamimarlins", "marlins"],
    ["marlins", "marlins"],
    ["newyorkmets", "mets"],
    ["mets", "mets"],
    ["washingtonnationals", "nationals"],
    ["nationals", "nationals"],
    ["sandiegopadres", "padres"],
    ["padres", "padres"],
    ["philadelphiaphillies", "phillies"],
    ["phillies", "phillies"],
    ["pittsburghpirates", "pirates"],
    ["pirates", "pirates"],
    ["texasrangers", "rangers"],
    ["rangers", "rangers"],
    ["tampabayrays", "rays"],
    ["rays", "rays"],
    ["bostonredsox", "redsox"],
    ["redsox", "redsox"],
    ["cincinnatireds", "reds"],
    ["reds", "reds"],
    ["coloradorockies", "rockies"],
    ["rockies", "rockies"],
    ["kansascityroyals", "royals"],
    ["royals", "royals"],
    ["detroittigers", "tigers"],
    ["tigers", "tigers"],
    ["minnesotatwins", "twins"],
    ["twins", "twins"],
    ["chicagowhitesox", "whitesox"],
    ["whitesox", "whitesox"],
    ["newyorkyankees", "yankees"],
    ["yankees", "yankees"]
  ]);
  const normalizeText = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
  const normalizeTeamName = value => aliasMap.get(normalizeText(value)) || normalizeText(value);
  const matchupSignature = value => {
    const normalized = String(value || "")
      .replace(/\bversus\b/gi, " at ")
      .replace(/\bvs\.?\b/gi, " at ")
      .replace(/\s@\s/g, " at ");
    const parts = normalized.split(/\s+at\s+/i).map(part => normalizeTeamName(part)).filter(Boolean);
    return parts.length === 2 ? parts.sort().join("|") : normalizeText(value);
  };
  const inferSideLine = recommendation => {
    const text = String(recommendation || "").trim();
    if (!text) return { side: "", line: null };
    if (/^nrfi$/i.test(text)) return { side: "NRFI", line: 0 };
    if (/^yrfi$/i.test(text)) return { side: "YRFI", line: 0 };
    const match = text.match(/\b(Over|Under)\s+([0-9]+(?:\.[0-9]+)?)/i);
    return match ? { side: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(), line: Number(match[2]) } : { side: "", line: null };
  };
  const buildResultRef = leg => {
    const market = normalizeMarket(leg.market || "");
    const selection = String(leg.selection || "");
    const matchup = String(leg.matchup || "");
    const slateDate = String(leg.slateDate || "");
    const nrfiSide = normalizeNrfiSide({ ...leg, market, selection });
    return {
      exactKey: [slateDate, market, selection, matchup].join("|"),
      looseKey: [market, normalizeText(selection), normalizeText(matchup)].join("|"),
      playerDateKey: market === "nrfi" ? "" : [slateDate, market, normalizeText(selection)].join("|"),
      nrfiDateKey: market === "nrfi" ? [slateDate, matchupSignature(matchup), nrfiSide].join("|") : ""
    };
  };
  const legKey = leg => [leg.slateDate, leg.market, leg.selection, leg.matchup, leg.side, leg.line].join("|");
  const ticketType = ticket => ticket.legs.length === 1 ? "Single" : "Parlay";
  const unique = values => [...new Set(values.filter(Boolean))];
  const escapeText = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const formatDate = value => {
    if (!value) return "Unknown slate";
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };
  const formatDateTime = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  };
  const formatMarket = value => ({
    batter_total_bases: "Batter Total Bases",
    pitcher_strikeouts: "Pitcher Strikeouts",
    nrfi: "NRFI / YRFI"
  }[normalizeMarket(value)] || value || "Unknown market");
  const resultKey = leg => [leg.slateDate, normalizeMarket(leg.market), leg.selection, leg.matchup].join("|");
  const looseResultKey = leg => [
    normalizeMarket(leg.market),
    normalizeText(leg.selection),
    normalizeText(leg.matchup)
  ].join("|");
  const currentSlip = () => state.slip;
  const savedTickets = () => state.tickets;
  let feedbackTimer = null;
  let storageBackend = "memory";

  const localRead = key => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const localWrite = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const openDatabase = () => new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open("diamond-signal-store", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("kv");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });

  const dbGet = async key => {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const store = tx.objectStore("kv");
      const request = store.get(key);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
    });
  };

  const dbSet = async (key, value) => {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      const request = store.put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error("IndexedDB write failed"));
    });
  };

  const readPersisted = async key => {
    const localValue = localRead(key);
    try {
      const value = await dbGet(key);
      storageBackend = "indexeddb";
      if (value.length) return value;
      if (localValue.length) {
        await dbSet(key, localValue);
        return localValue;
      }
    } catch {}
    storageBackend = "localStorage";
    return localValue;
  };

  const writePersisted = async (key, value) => {
    try {
      await dbSet(key, value);
      storageBackend = "indexeddb";
      localWrite(key, value);
      return true;
    } catch {
      storageBackend = "localStorage";
      return localWrite(key, value);
    }
  };

  const hydrateState = async () => {
    state.slip = await readPersisted(slipKey);
    state.tickets = await readPersisted(ticketsKey);
  };

  const coerceLeg = (leg, fallbackSlateDate = "") => {
    const inferred = inferSideLine(leg.recommendation);
    const market = normalizeMarket(leg.market || leg.marketKey || leg.betType || "");
    const selection = leg.selection || leg.player || leg.pick || "";
    const matchup = leg.matchup || leg.game || leg.opponent || "";
    const slateDate = leg.slateDate || leg.eventDate || leg.date || fallbackSlateDate || "";
    const side = normalizeNrfiSide({
      ...leg,
      market,
      selection,
      side: leg.side || inferred.side
    }) || inferred.side;
    const parsedLine = Number(leg.line);
    const line = Number.isFinite(parsedLine) && leg.line !== "" ? parsedLine : inferred.line;
    return {
      ...leg,
      market,
      selection,
      matchup,
      slateDate,
      side,
      line: Number.isFinite(line) ? line : 0,
      recommendation: leg.recommendation || (side && Number.isFinite(line) && market !== "nrfi" ? `${side} ${line}` : side || ""),
      marketLabel: leg.marketLabel || formatMarket(market),
      resultRef: leg.resultRef || buildResultRef({
        ...leg,
        market,
        selection,
        matchup,
        slateDate,
        side
      })
    };
  };

  const normalizeNrfiSide = leg => {
    if (normalizeMarket(leg.market) !== "nrfi") return leg.side;
    if (leg.side === "NRFI" || leg.side === "YRFI") return leg.side;
    if (leg.selection === "NRFI" || leg.selection === "YRFI") return leg.selection;
    return leg.side;
  };

  const migrateStorage = async () => {
    state.slip = currentSlip().map(leg => coerceLeg(leg));
    state.tickets = savedTickets().map(ticket => ({
      ...ticket,
      legs: (ticket.legs || []).map(leg => coerceLeg(leg, ticket.savedAt ? ticket.savedAt.slice(0, 10) : ""))
    }));
    await writePersisted(slipKey, state.slip);
    await writePersisted(ticketsKey, state.tickets);
  };

  const saveSlip = async slip => {
    state.slip = [...slip];
    await writePersisted(slipKey, state.slip);
    updateSlipCount();
    syncAddButtons();
    updateFloatingLink();
    renderSlip();
  };

  const showFeedback = message => {
    const container = document.querySelector("[data-pick-feedback]");
    if (!container) return;
    container.innerHTML = `<div class="slip-feedback"><strong>Saved.</strong> ${escapeText(message)}</div>`;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      container.innerHTML = "";
      feedbackTimer = null;
    }, 4500);
  };

  const updateSlipCount = () => {
    const count = currentSlip().length;
    document.querySelectorAll("[data-slip-count]").forEach(node => { node.textContent = String(count); });
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
    market: normalizeMarket(button.dataset.market || ""),
    marketLabel: button.dataset.marketLabel || formatMarket(button.dataset.market || ""),
    side: button.dataset.side || "",
    line: Number(button.dataset.line || "0"),
    recommendation: button.dataset.recommendation || "",
    modelProbability: Number(button.dataset.modelProbability || "0"),
    confidence: Number(button.dataset.confidence || "0"),
    odds: button.dataset.odds || ""
  });

  const bindAddButtons = () => {
    document.querySelectorAll(".add-pick-btn").forEach(button => {
      button.addEventListener("click", async () => {
        const leg = getButtonLeg(button);
        const slip = [...currentSlip()];
        if (!slip.some(item => legKey(item) === legKey(leg))) slip.push(leg);
        state.slip = slip;
        await writePersisted(slipKey, state.slip);
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
        <span>${escapeText(normalizeMarket(leg.market) === "nrfi" ? leg.selection : (leg.recommendation || `${leg.side} ${leg.line}`))}</span>
        <small>${escapeText(leg.marketLabel || formatMarket(leg.market))} · ${escapeText(leg.matchup)} · ${escapeText(leg.gameTime)}</small>
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
      input.addEventListener("input", async () => {
        const next = [...currentSlip()];
        next[Number(input.dataset.oddsIndex)].odds = input.value;
        state.slip = next;
        await writePersisted(slipKey, state.slip);
        const refreshedOdds = totalOdds(next);
        const totalNode = container.querySelector("[data-current-slip-odds]");
        if (totalNode) totalNode.textContent = refreshedOdds.american;
      });
    });
    container.querySelectorAll(".remove-leg-btn").forEach(button => {
      button.addEventListener("click", async () => {
        const next = currentSlip().filter((_, index) => index !== Number(button.dataset.removeIndex));
        await saveSlip(next);
      });
    });
    container.querySelector(".clear-slip-btn")?.addEventListener("click", async () => saveSlip([]));
    container.querySelector(".save-ticket-btn")?.addEventListener("click", async () => saveTicket());
  };

  const saveTicket = async () => {
    const legs = currentSlip().map(leg => coerceLeg(leg));
    if (!legs.length) return;
    if (legs.some(leg => !cleanOdds(leg.odds))) {
      alert("Add American odds for every leg before saving.");
      return;
    }
    const odds = totalOdds(legs);
    const tickets = [...savedTickets()];
    tickets.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      version,
      savedAt: new Date().toISOString(),
      type: legs.length === 1 ? "Single" : `${legs.length}-leg parlay`,
      totalAmericanOdds: odds.american,
      totalDecimalOdds: odds.decimal,
      legs: legs.map(leg => ({ ...leg }))
    });
    state.tickets = tickets;
    const stored = await writePersisted(ticketsKey, state.tickets);
    if (!stored) {
      showFeedback("Saving failed in this browser session. Try disabling private browsing or storage blocking.");
      return;
    }
    await saveSlip([]);
    renderTickets().then(() => {
      const savedSection = document.querySelector("[data-saved-tickets]");
      savedSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    showFeedback(`Your ${legs.length === 1 ? "single" : `${legs.length}-leg slip`} was moved into Saved Slips below using ${storageBackend}.`);
  };

  const parseCsv = text => {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (cell || row.length) {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        }
        if (char === "\r" && next === "\n") i++;
      } else {
        cell += char;
      }
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    const headers = rows.shift() || [];
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  };

  const resultIndex = async () => {
    try {
      const response = await fetch("site-data/pick_results.csv", { cache: "no-store" });
      if (!response.ok) return { exact: new Map(), loose: new Map(), playerByDate: new Map(), nrfiByDate: new Map() };
      const rows = parseCsv(await response.text());
      const exact = new Map();
      const loose = new Map();
      const playerBuckets = new Map();
      const nrfiByDate = new Map();
      rows.forEach(row => {
        exact.set([row.slate_date, normalizeMarket(row.market), row.selection, row.matchup].join("|"), row);
        const key = [normalizeMarket(row.market), normalizeText(row.selection), normalizeText(row.matchup)].join("|");
        if (!loose.has(key)) loose.set(key, row);
        if (normalizeMarket(row.market) === "nrfi") {
          nrfiByDate.set([row.slate_date, matchupSignature(row.matchup), row.selection].join("|"), row);
        } else {
          const playerKey = [row.slate_date, normalizeMarket(row.market), normalizeText(row.selection)].join("|");
          const bucket = playerBuckets.get(playerKey) || [];
          bucket.push(row);
          playerBuckets.set(playerKey, bucket);
        }
      });
      const playerByDate = new Map();
      playerBuckets.forEach((bucket, key) => {
        const uniqueMatchups = [...new Set(bucket.map(row => row.matchup))];
        if (bucket.length === 1 || uniqueMatchups.length === 1) playerByDate.set(key, bucket[0]);
      });
      return { exact, loose, playerByDate, nrfiByDate };
    } catch {
      return { exact: new Map(), loose: new Map(), playerByDate: new Map(), nrfiByDate: new Map() };
    }
  };

  const findResultRow = (leg, results, fallbackSlateDate = "") => {
    const slateDate = leg.slateDate || fallbackSlateDate || "";
    const normalizedLeg = slateDate && slateDate !== leg.slateDate ? { ...leg, slateDate } : leg;
    const resultRef = normalizedLeg.resultRef || buildResultRef(normalizedLeg);
    return results.exact.get(resultRef.exactKey)
      || results.loose.get(resultRef.looseKey)
      || (normalizeMarket(normalizedLeg.market) === "nrfi"
        ? results.nrfiByDate.get(resultRef.nrfiDateKey || [slateDate, matchupSignature(normalizedLeg.matchup), normalizeNrfiSide(normalizedLeg)].join("|"))
        : results.playerByDate.get(resultRef.playerDateKey || [slateDate, normalizeMarket(normalizedLeg.market), normalizeText(normalizedLeg.selection)].join("|")));
  };

  const gradeLeg = (leg, results, fallbackSlateDate = "") => {
    const row = findResultRow(leg, results, fallbackSlateDate);
    if (!row) return { status: "Pending", detail: "Awaiting final result", actualLabel: "Pending" };
    if (normalizeMarket(leg.market) === "nrfi") {
      const side = normalizeNrfiSide(leg);
      const actualNrfi = Number(row.actual_nrfi);
      const won = side === "NRFI" ? actualNrfi === 1 : actualNrfi === 0;
      return {
        status: won ? "Won" : "Lost",
        detail: actualNrfi === 1 ? "No run in the 1st" : "Run scored in the 1st",
        actualLabel: actualNrfi === 1 ? "NRFI hit" : "YRFI hit"
      };
    }
    const actual = Number(row.actual_count);
    const line = Number(leg.line);
    if (!Number.isFinite(actual)) return { status: "Pending", detail: "Awaiting stat", actualLabel: "Pending" };
    const won = leg.side === "Over" ? actual > line : actual < line;
    const pushed = actual === line;
    return {
      status: pushed ? "Push" : won ? "Won" : "Lost",
      detail: `${leg.side} ${line} · actual ${actual}`,
      actualLabel: `Actual ${actual}`
    };
  };

  const ticketStatus = grades => {
    if (grades.some(grade => grade.status === "Lost")) return "Lost";
    if (grades.some(grade => grade.status === "Pending")) return "Pending";
    if (grades.every(grade => grade.status === "Push")) return "Push";
    return "Won";
  };

  const gradeTickets = async () => {
    const results = await resultIndex();
    return savedTickets().map(ticket => {
      const fallbackSlateDate = ticket.savedAt ? ticket.savedAt.slice(0, 10) : "";
      const grades = ticket.legs.map(leg => gradeLeg(leg, results, fallbackSlateDate));
      const slateDates = unique(ticket.legs.map(leg => leg.slateDate || fallbackSlateDate)).sort().reverse();
      const counts = grades.reduce((acc, grade) => {
        acc[grade.status] = (acc[grade.status] || 0) + 1;
        return acc;
      }, { Won: 0, Lost: 0, Pending: 0, Push: 0 });
      return {
        ...ticket,
        normalizedType: ticketType(ticket),
        primarySlateDate: slateDates[0] || "",
        slateDates,
        markets: unique(ticket.legs.map(leg => formatMarket(leg.market))),
        grades,
        status: ticketStatus(grades),
        counts,
        nearMiss: grades.length > 1 && counts.Lost === 1 && counts.Pending === 0
      };
    });
  };

  const applyFilters = tickets => tickets.filter(ticket => {
    if (filters.status !== "All" && ticket.status !== filters.status) return false;
    if (filters.type !== "All" && ticket.normalizedType !== filters.type) return false;
    if (filters.slate !== "All" && !ticket.slateDates.includes(filters.slate)) return false;
    if (filters.market !== "All" && !ticket.legs.some(leg => leg.market === filters.market)) return false;
    const query = filters.query.trim().toLowerCase();
    if (!query) return true;
    return ticket.legs.some(leg => [
      leg.selection,
      leg.matchup,
      leg.recommendation,
      leg.marketLabel,
      leg.side
    ].join(" ").toLowerCase().includes(query));
  });

  const sortTickets = tickets => {
    const sorted = [...tickets];
    sorted.sort((a, b) => {
      if (filters.sort === "Oldest") return new Date(a.savedAt) - new Date(b.savedAt);
      if (filters.sort === "Best odds") return (b.totalDecimalOdds || -Infinity) - (a.totalDecimalOdds || -Infinity);
      if (filters.sort === "Shortest odds") return (a.totalDecimalOdds || Infinity) - (b.totalDecimalOdds || Infinity);
      return new Date(b.savedAt) - new Date(a.savedAt);
    });
    return sorted;
  };

  const applyLegFilters = legs => legs.filter(leg => {
    if (legFilters.status !== "All" && leg.grade.status !== legFilters.status) return false;
    if (legFilters.slate !== "All" && leg.slateDate !== legFilters.slate) return false;
    if (legFilters.market !== "All" && normalizeMarket(leg.market) !== legFilters.market) return false;
    const query = legFilters.query.trim().toLowerCase();
    if (!query) return true;
    return [
      leg.selection,
      leg.matchup,
      leg.recommendation,
      leg.marketLabel,
      leg.side
    ].join(" ").toLowerCase().includes(query);
  });

  const sortLegs = legs => {
    const sorted = [...legs];
    sorted.sort((a, b) => {
      if (legFilters.sort === "Oldest") {
        if (a.slateDate === b.slateDate) return a.selection.localeCompare(b.selection);
        return a.slateDate > b.slateDate ? 1 : -1;
      }
      if (legFilters.sort === "Market") {
        const marketCompare = formatMarket(a.market).localeCompare(formatMarket(b.market));
        if (marketCompare !== 0) return marketCompare;
        return a.selection.localeCompare(b.selection);
      }
      if (a.slateDate === b.slateDate) return a.selection.localeCompare(b.selection);
      return a.slateDate < b.slateDate ? 1 : -1;
    });
    return sorted;
  };

  const renderSummary = tickets => {
    const summary = document.querySelector("[data-pick-summary]");
    if (!summary) return;
    if (!tickets.length) {
      summary.innerHTML = "";
      return;
    }
    const settledTickets = tickets.filter(ticket => ticket.status !== "Pending");
    const ticketWins = settledTickets.filter(ticket => ticket.status === "Won").length;
    const ticketLosses = settledTickets.filter(ticket => ticket.status === "Lost").length;
    const ticketPushes = settledTickets.filter(ticket => ticket.status === "Push").length;
    const legs = tickets.flatMap(ticket => ticket.legs.map((leg, index) => ({ ...leg, grade: ticket.grades[index], ticketStatus: ticket.status, nearMiss: ticket.nearMiss })));
    const settledLegs = legs.filter(leg => leg.grade.status !== "Pending");
    const legWins = settledLegs.filter(leg => leg.grade.status === "Won").length;
    const legLosses = settledLegs.filter(leg => leg.grade.status === "Lost").length;
    const legPushes = settledLegs.filter(leg => leg.grade.status === "Push").length;
    const parlays = tickets.filter(ticket => ticket.normalizedType === "Parlay");
    const nearMisses = parlays.filter(ticket => ticket.nearMiss && ticket.status === "Lost").length;
    summary.innerHTML = `
      <div class="metric"><span class="metric-label">Visible slips</span><span class="metric-value">${tickets.length}</span><span class="metric-detail">Filtered view of saved tickets</span></div>
      <div class="metric"><span class="metric-label">Ticket record</span><span class="metric-value">${ticketWins}-${ticketLosses}-${ticketPushes}</span><span class="metric-detail">${settledTickets.length ? pct(ticketWins / settledTickets.length) : "-"} win rate on settled slips</span></div>
      <div class="metric"><span class="metric-label">Leg record</span><span class="metric-value">${legWins}-${legLosses}-${legPushes}</span><span class="metric-detail">${settledLegs.length ? pct(legWins / settledLegs.length) : "-"} leg win rate</span></div>
      <div class="metric"><span class="metric-label">Pending slips</span><span class="metric-value">${tickets.filter(ticket => ticket.status === "Pending").length}</span><span class="metric-detail">Waiting on public final results</span></div>
      <div class="metric"><span class="metric-label">Parlay near misses</span><span class="metric-value">${nearMisses}</span><span class="metric-detail">Lost parlays with exactly one missed leg</span></div>
      <div class="metric action-metric"><button class="button-ghost clear-tickets-btn" type="button">Clear saved slips</button><span class="metric-detail">Removes all saved slips from this browser</span></div>`;
  };

  const renderFilterControls = allTickets => {
    const container = document.querySelector("[data-ticket-filters]");
    if (!container) return;
    if (!allTickets.length) {
      container.innerHTML = "";
      return;
    }
    const slateOptions = unique(allTickets.flatMap(ticket => ticket.slateDates)).sort().reverse();
    const marketOptions = unique(allTickets.flatMap(ticket => ticket.legs.map(leg => leg.market))).sort();
    const statusOptions = ["All", "Pending", "Won", "Lost", "Push"];
    container.innerHTML = `
      <section class="results-controls">
        <div class="results-control-head">
          <div>
            <span class="card-kicker">Saved slip results</span>
            <h2>Review what hit, what missed, and why.</h2>
          </div>
          <p>Filter by outcome, slate, ticket type, or market to isolate today’s board and prior settled cards.</p>
        </div>
        <div class="board-controls ticket-status-filters">
          ${statusOptions.map(status => `
            <button class="filter-chip ${filters.status === status ? "active" : ""}" type="button" data-filter-status="${status}">${status}</button>
          `).join("")}
        </div>
        <div class="ticket-filter-grid">
          <label><span>Type</span>
            <select data-filter-type>
              <option value="All">All slips</option>
              <option value="Single"${filters.type === "Single" ? " selected" : ""}>Singles</option>
              <option value="Parlay"${filters.type === "Parlay" ? " selected" : ""}>Parlays</option>
            </select>
          </label>
          <label><span>Slate</span>
            <select data-filter-slate>
              <option value="All">All slate dates</option>
              ${slateOptions.map(date => `<option value="${escapeText(date)}"${filters.slate === date ? " selected" : ""}>${escapeText(formatDate(date))}</option>`).join("")}
            </select>
          </label>
          <label><span>Market</span>
            <select data-filter-market>
              <option value="All">All markets</option>
              ${marketOptions.map(market => `<option value="${escapeText(market)}"${filters.market === market ? " selected" : ""}>${escapeText(formatMarket(market))}</option>`).join("")}
            </select>
          </label>
          <label><span>Search</span>
            <input type="search" data-filter-query placeholder="Player, matchup, recommendation" value="${escapeText(filters.query)}">
          </label>
          <label><span>Sort</span>
            <select data-filter-sort>
              <option value="Newest"${filters.sort === "Newest" ? " selected" : ""}>Newest first</option>
              <option value="Oldest"${filters.sort === "Oldest" ? " selected" : ""}>Oldest first</option>
              <option value="Best odds"${filters.sort === "Best odds" ? " selected" : ""}>Largest odds</option>
              <option value="Shortest odds"${filters.sort === "Shortest odds" ? " selected" : ""}>Smallest odds</option>
            </select>
          </label>
        </div>
      </section>`;

    container.querySelectorAll("[data-filter-status]").forEach(button => {
      button.addEventListener("click", () => {
        filters.status = button.dataset.filterStatus || "All";
        renderTickets();
      });
    });
    container.querySelector("[data-filter-type]")?.addEventListener("change", event => {
      filters.type = event.target.value;
      renderTickets();
    });
    container.querySelector("[data-filter-slate]")?.addEventListener("change", event => {
      filters.slate = event.target.value;
      renderTickets();
    });
    container.querySelector("[data-filter-market]")?.addEventListener("change", event => {
      filters.market = event.target.value;
      renderTickets();
    });
    container.querySelector("[data-filter-query]")?.addEventListener("input", event => {
      filters.query = event.target.value;
      renderTickets();
    });
    container.querySelector("[data-filter-sort]")?.addEventListener("change", event => {
      filters.sort = event.target.value;
      renderTickets();
    });
  };

  const renderTicketGroups = tickets => {
    const container = document.querySelector("[data-saved-tickets]");
    if (!container) return;
    if (!tickets.length) {
      container.innerHTML = `<div class="empty-state compact"><h3>No matching slips.</h3><p>Try loosening the filters, or save a new single/parlay from the Model Board.</p></div>`;
      return;
    }
    const groups = tickets.reduce((acc, ticket) => {
      const key = ticket.primarySlateDate || "Unknown";
      acc[key] = acc[key] || [];
      acc[key].push(ticket);
      return acc;
    }, {});
    const orderedKeys = Object.keys(groups).sort().reverse();
    container.innerHTML = orderedKeys.map(date => `
      <section class="ticket-group">
        <div class="ticket-group-head">
          <div>
            <span class="card-kicker">Slate</span>
            <h3>${escapeText(formatDate(date))}</h3>
          </div>
          <p>${groups[date].length} saved slip${groups[date].length === 1 ? "" : "s"}</p>
        </div>
        <div class="ticket-group-list saved-slips-scroll">
          ${groups[date].map(ticket => `
            <div class="ticket-card">
              <div class="ticket-head">
                <div>
                  <span class="status-chip ${ticket.status.toLowerCase()}">${ticket.status}</span>
                  <h3>${escapeText(ticket.normalizedType)} · ${escapeText(ticket.totalAmericanOdds)}</h3>
                  <p>${escapeText(formatDateTime(ticket.savedAt))} · ${escapeText(ticket.markets.join(" · "))}</p>
                </div>
                <button class="delete-ticket-btn" type="button" data-ticket-id="${escapeText(ticket.id)}">Delete</button>
              </div>
              <div class="ticket-meta-row">
                <span class="pill">${ticket.counts.Won} won</span>
                <span class="pill ${ticket.counts.Lost ? "loss-pill" : "strong"}">${ticket.counts.Lost} lost</span>
                <span class="pill watch">${ticket.counts.Pending} pending</span>
                ${ticket.counts.Push ? `<span class="pill">${ticket.counts.Push} push</span>` : ""}
                ${ticket.nearMiss && ticket.status === "Lost" ? `<span class="pill watch">One leg short</span>` : ""}
              </div>
              <div class="ticket-leg-list">
                ${ticket.legs.map((leg, index) => `
                  <div class="ticket-leg">
                    ${formatLeg(leg)}
                    <div class="ticket-leg-result">
                      <strong>${escapeText(leg.odds)}</strong>
                      <span class="status-chip ${ticket.grades[index].status.toLowerCase()}">${ticket.grades[index].status}</span>
                      <small>${escapeText(ticket.grades[index].detail)}</small>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `).join("");
    container.querySelectorAll(".delete-ticket-btn").forEach(button => {
      button.addEventListener("click", async () => {
        state.tickets = savedTickets().filter(ticket => ticket.id !== button.dataset.ticketId);
        await writePersisted(ticketsKey, state.tickets);
        renderTickets();
      });
    });
  };

  const renderLegResults = tickets => {
    const container = document.querySelector("[data-leg-results]");
    if (!container) return;
    const allLegs = tickets.flatMap(ticket => ticket.legs.map((leg, index) => ({
      ...leg,
      grade: ticket.grades[index],
      ticketStatus: ticket.status,
      slateDate: leg.slateDate || ticket.primarySlateDate
    })));
    if (!allLegs.length) {
      container.innerHTML = "";
      return;
    }
    const slateOptions = unique(allLegs.map(leg => leg.slateDate)).sort().reverse();
    const marketOptions = unique(allLegs.map(leg => normalizeMarket(leg.market))).sort();
    const statusOptions = ["All", "Pending", "Won", "Lost", "Push"];
    const filteredLegs = sortLegs(applyLegFilters(allLegs));
    const settledLegs = filteredLegs.filter(leg => leg.grade.status !== "Pending");
    const decidedLegs = settledLegs.filter(leg => leg.grade.status !== "Push");
    const wins = settledLegs.filter(leg => leg.grade.status === "Won").length;
    const losses = settledLegs.filter(leg => leg.grade.status === "Lost").length;
    const pushes = settledLegs.filter(leg => leg.grade.status === "Push").length;
    const pending = filteredLegs.filter(leg => leg.grade.status === "Pending").length;
    const efficiency = decidedLegs.length ? pct(wins / decidedLegs.length) : "-";
    container.innerHTML = `
      <section class="leg-results-wrap">
        <div class="results-control-head">
          <div>
            <span class="card-kicker">Leg-level grading</span>
            <h2>Every leg, settled the same way.</h2>
          </div>
          <p>Parlays still show every leg result even when the full ticket loses.</p>
        </div>
        <div class="metric-grid leg-summary-grid">
          <div class="metric"><span class="metric-label">Visible legs</span><span class="metric-value">${filteredLegs.length}</span><span class="metric-detail">Legs in the current filtered view</span></div>
          <div class="metric"><span class="metric-label">Record</span><span class="metric-value">${wins}-${losses}-${pushes}</span><span class="metric-detail">Settled leg record in this view</span></div>
          <div class="metric"><span class="metric-label">Efficiency</span><span class="metric-value">${efficiency}</span><span class="metric-detail">Win rate on decided legs, excluding pushes</span></div>
          <div class="metric"><span class="metric-label">Pending legs</span><span class="metric-value">${pending}</span><span class="metric-detail">Still waiting on public final results</span></div>
        </div>
        <section class="results-controls leg-results-controls">
          <div class="results-control-head">
            <div>
              <span class="card-kicker">Leg filters</span>
              <h2>Break down pick performance.</h2>
            </div>
            <p>Filter this section by market, result, slate date, or search to isolate pitcher props, NRFI/YRFI, and total-base picks.</p>
          </div>
          <div class="board-controls ticket-status-filters">
            ${statusOptions.map(status => `
              <button class="filter-chip ${legFilters.status === status ? "active" : ""}" type="button" data-leg-filter-status="${status}">${status}</button>
            `).join("")}
          </div>
          <div class="ticket-filter-grid">
            <label><span>Slate</span>
              <select data-leg-filter-slate>
                <option value="All">All slate dates</option>
                ${slateOptions.map(date => `<option value="${escapeText(date)}"${legFilters.slate === date ? " selected" : ""}>${escapeText(formatDate(date))}</option>`).join("")}
              </select>
            </label>
            <label><span>Market</span>
              <select data-leg-filter-market>
                <option value="All">All markets</option>
                ${marketOptions.map(market => `<option value="${escapeText(market)}"${legFilters.market === market ? " selected" : ""}>${escapeText(formatMarket(market))}</option>`).join("")}
              </select>
            </label>
            <label><span>Search</span>
              <input type="search" data-leg-filter-query placeholder="Player, matchup, recommendation" value="${escapeText(legFilters.query)}">
            </label>
            <label><span>Sort</span>
              <select data-leg-filter-sort>
                <option value="Newest"${legFilters.sort === "Newest" ? " selected" : ""}>Newest first</option>
                <option value="Oldest"${legFilters.sort === "Oldest" ? " selected" : ""}>Oldest first</option>
                <option value="Market"${legFilters.sort === "Market" ? " selected" : ""}>Group by market</option>
              </select>
            </label>
          </div>
        </section>
        <div class="signal-table-wrap leg-results-scroll">
          <table class="signal-table">
            <thead>
              <tr>
                <th>Slate</th>
                <th>Selection</th>
                <th>Market</th>
                <th>Recommendation</th>
                <th>Result</th>
                <th>Detail</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLegs.map(leg => `
                <tr>
                  <td>${escapeText(formatDate(leg.slateDate))}</td>
                  <td><strong>${escapeText(leg.selection)}</strong><br><small>${escapeText(leg.matchup)}</small></td>
                  <td>${escapeText(leg.marketLabel || formatMarket(leg.market))}</td>
                  <td>${escapeText(leg.recommendation || `${leg.side} ${leg.line}`)}</td>
                  <td><span class="status-chip ${leg.grade.status.toLowerCase()}">${leg.grade.status}</span></td>
                  <td>${escapeText(leg.grade.detail)}</td>
                  <td>${escapeText(leg.ticketStatus)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>`;
    container.querySelectorAll("[data-leg-filter-status]").forEach(button => {
      button.addEventListener("click", () => {
        legFilters.status = button.dataset.legFilterStatus || "All";
        renderTickets();
      });
    });
    container.querySelector("[data-leg-filter-slate]")?.addEventListener("change", event => {
      legFilters.slate = event.target.value;
      renderTickets();
    });
    container.querySelector("[data-leg-filter-market]")?.addEventListener("change", event => {
      legFilters.market = event.target.value;
      renderTickets();
    });
    container.querySelector("[data-leg-filter-query]")?.addEventListener("input", event => {
      legFilters.query = event.target.value;
      renderTickets();
    });
    container.querySelector("[data-leg-filter-sort]")?.addEventListener("change", event => {
      legFilters.sort = event.target.value;
      renderTickets();
    });
  };

  const renderTickets = async () => {
    const allTickets = await gradeTickets();
    const filteredTickets = sortTickets(applyFilters(allTickets));
    const container = document.querySelector("[data-saved-tickets]");
    if (!container) return;
    if (!allTickets.length) {
      container.innerHTML = `<div class="empty-state compact"><h3>No saved slips yet.</h3><p>Saved singles and parlays will appear here with grading once final game data is available.</p></div>`;
      document.querySelector("[data-pick-summary]")?.replaceChildren();
      document.querySelector("[data-ticket-filters]")?.replaceChildren();
      document.querySelector("[data-leg-results]")?.replaceChildren();
      return;
    }
    renderSummary(filteredTickets);
    renderFilterControls(allTickets);
    renderTicketGroups(filteredTickets);
    renderLegResults(filteredTickets);
    document.querySelector("[data-pick-summary]")?.querySelector(".clear-tickets-btn")?.addEventListener("click", async () => {
      if (confirm("Clear all saved slips from this browser?")) {
        state.tickets = [];
        await writePersisted(ticketsKey, state.tickets);
        renderTickets();
      }
    });
  };

  document.addEventListener("DOMContentLoaded", async () => {
    await hydrateState();
    await migrateStorage();
    bindAddButtons();
    updateSlipCount();
    syncAddButtons();
    updateFloatingLink();
    renderSlip();
    renderTickets();
  });
})();
