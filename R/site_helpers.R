read_site_csv <- function(name) {
  path <- file.path("site-data", name)
  if (!file.exists(path)) return(data.frame())
  read.csv(path, check.names = FALSE, stringsAsFactors = FALSE)
}

escape_html <- function(x) {
  x <- ifelse(is.na(x), "", as.character(x))
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  x <- gsub(">", "&gt;", x, fixed = TRUE)
  gsub('"', "&quot;", x, fixed = TRUE)
}

pct <- function(x, digits = 1) {
  ifelse(is.na(x), "-", paste0(format(round(100 * x, digits), nsmall = digits), "%"))
}

american <- function(x) {
  ifelse(is.na(x), "-", ifelse(x > 0, paste0("+", x), as.character(x)))
}

num_attr <- function(x) {
  ifelse(is.na(x), "", format(round(as.numeric(x), 6), trim = TRUE, scientific = FALSE))
}

market_label <- function(x) {
  labels <- c(
    batter_total_bases = "Batter Total Bases",
    pitcher_strikeouts = "Pitcher Strikeouts",
    totals_1st_1_innings = "First Inning Total",
    nrfi = "NRFI"
  )
  unname(ifelse(x %in% names(labels), labels[x], x))
}

normalize_market_key <- function(x) {
  ifelse(x == "totals_1st_1_innings", "nrfi", x)
}

format_status_time <- function(x) {
  if (!length(x) || is.na(x) || !nzchar(x)) return("Not available")
  if (grepl(" ET$", x)) return(x)
  formats <- c(
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d %H:%M %Z",
    "%Y-%m-%d %H:%M:%S %Z"
  )
  parsed <- NULL
  for (fmt in formats) {
    parsed <- suppressWarnings(tryCatch(as.POSIXct(x, tz = "UTC", format = fmt), error = function(...) NA))
    if (!is.na(parsed)) break
  }
  if (is.na(parsed)) return(x)
  format(parsed, "%B %e, %Y at %I:%M %p ET", tz = "America/New_York")
}

date_label <- function(x) {
  if (!length(x) || is.na(x) || !nzchar(x)) return("-")
  format(as.Date(x), "%B %e, %Y")
}

metric_card <- function(label, value, detail, title = "") {
  sprintf(
    '<div class="metric" title="%s"><span class="metric-label">%s</span><span class="metric-value">%s</span><span class="metric-detail">%s</span></div>',
    escape_html(title), escape_html(label), escape_html(value), escape_html(detail)
  )
}

render_signal_table <- function(x) {
  if (!nrow(x)) {
    return('<div class="empty-state"><h3>No priced signals are available yet.</h3><p>The model is ready, but no FanDuel-priced edges cleared the current threshold for this run.</p></div>')
  }
  x <- x[order(-x$probability_difference), , drop = FALSE]
  rows <- vapply(seq_len(nrow(x)), function(i) {
    strength <- if (x$probability_difference[i] >= .07) "strong" else "watch"
    slate_date <- if ("slate_date" %in% names(x)) x$slate_date[i] else substr(x$captured_at[i], 1, 10)
    normalized_market <- normalize_market_key(x$market[i])
    normalized_side <- if (normalized_market == "nrfi") x$selection[i] else x$side[i]
    recommendation <- if (normalized_market == "nrfi") {
      x$selection[i]
    } else {
      paste(x$side[i], x$line[i], ifelse(x$market[i] == "pitcher_strikeouts", "K", ifelse(x$market[i] == "batter_total_bases", "TB", "")))
    }
    sprintf(
      paste0('<tr><td><strong>%s</strong><br><span class="mini-note">%s at %s</span></td>',
        '<td><span class="pill %s">%s</span></td><td>%s</td><td>%s</td>',
        '<td title="The model estimate for this side">%s</td>',
        '<td title="Sportsbook probability after removing estimated vig">%s</td>',
        '<td class="edge-pos" title="Model probability minus no-vig market probability">+%s</td>',
        '<td><button class="add-pick-btn" type="button" data-slate-date="%s" data-selection="%s" data-matchup="%s" data-game-time="%s" data-market="%s" data-market-label="%s" data-side="%s" data-line="%s" data-recommendation="%s" data-model-probability="%s" data-odds="%s"><span>Add</span></button></td></tr>'),
      escape_html(x$selection[i]), escape_html(x$matchup[i]), escape_html(x$game_time[i]),
      strength, escape_html(x$signal[i]), escape_html(recommendation),
      american(x$american_price[i]), pct(x$model_probability[i]), pct(x$implied_probability[i]),
      pct(x$probability_difference[i]),
      escape_html(slate_date), escape_html(x$selection[i]), escape_html(x$matchup[i]),
      escape_html(x$game_time[i]), escape_html(normalized_market), escape_html(market_label(normalized_market)),
      escape_html(normalized_side), num_attr(x$line[i]), escape_html(recommendation),
      num_attr(x$model_probability[i]), escape_html(as.character(x$american_price[i]))
    )
  }, character(1))
  paste0(
    '<div class="signal-table-wrap"><table class="signal-table"><thead><tr>',
    '<th>Selection</th><th>Signal</th><th>Pick</th><th>FanDuel</th>',
    '<th><span class="explain" title="The model estimated probability for the selected side">Model</span></th>',
    '<th><span class="explain" title="The market probability after removing estimated sportsbook margin">Market</span></th>',
    '<th><span class="explain" title="Model probability minus market probability">Edge</span></th>',
    '<th>Slip</th>',
    '</tr></thead><tbody>', paste(rows, collapse = ""), '</tbody></table></div>'
  )
}

render_projection_board <- function(x) {
  if (!nrow(x)) {
    return('<div class="empty-state"><h3>No model-only projections are available.</h3><p>The MLB schedule or probable-starter feed did not produce usable rows for this date.</p></div>')
  }
  rows <- vapply(seq_len(nrow(x)), function(i) {
    bet_subject <- if (x$market[i] == "nrfi") {
      x$matchup[i]
    } else {
      x$selection[i]
    }
    gap_value <- if (x$market[i] == "nrfi" || is.na(x$line_gap[i])) {
      "-"
    } else {
      paste0(ifelse(x$line_gap[i] >= 0, "+", ""), sprintf("%.2f", x$line_gap[i]))
    }
    gap_label <- if (x$market[i] == "nrfi" || is.na(x$line_gap[i])) {
      "probability-based game side"
    } else if (x$line_gap[i] >= 0) {
      "model above listed line"
    } else {
      "model below listed line"
    }
    confidence_width <- paste0(pmax(4, pmin(100, x$confidence[i])), "%")
    price_label <- if ("american_price" %in% names(x) && !is.na(x$american_price[i])) american(x$american_price[i]) else "-"
    price_detail <- if ("american_price" %in% names(x) && !is.na(x$american_price[i])) "FanDuel price" else "Price unavailable"
    sprintf(
      paste0('<tr data-market="%s" data-matchup="%s"><td><strong>%s</strong><br><span class="mini-note">%s</span></td>',
        '<td><span class="pill">%s</span></td><td>%s<br><span class="mini-note">%s</span></td>',
        '<td><strong>%s</strong><br><span class="mini-note">%s</span></td>',
        '<td><strong>%s</strong><br><span class="mini-note">%s</span></td>',
        '<td><strong>%s</strong><br><span class="mini-note">%s</span></td>',
        '<td><span class="prob-track"><span style="width:%s"></span></span><strong>%s</strong></td>',
        '<td><button class="add-pick-btn" type="button" data-slate-date="%s" data-selection="%s" data-matchup="%s" data-game-time="%s" data-market="%s" data-market-label="%s" data-side="%s" data-line="%s" data-recommendation="%s" data-model-probability="%s" data-confidence="%s" data-odds="%s"><span>Add</span></button></td></tr>'),
      escape_html(x$market[i]), escape_html(x$matchup[i]),
      escape_html(bet_subject), escape_html(x$recommendation[i]),
      escape_html(market_label(x$market[i])), escape_html(x$matchup[i]),
      escape_html(x$game_time[i]), price_label, price_detail,
      gap_value, gap_label,
      pct(x$model_probability[i]), "Selected-side probability",
      confidence_width, sprintf("%.1f", x$confidence[i]),
      escape_html(x$slate_date[i]), escape_html(x$selection[i]), escape_html(x$matchup[i]),
      escape_html(x$game_time[i]), escape_html(x$market[i]), escape_html(market_label(x$market[i])),
      escape_html(x$recommended_side[i]), num_attr(x$reference_line[i]),
      escape_html(x$recommendation[i]), num_attr(x$model_probability[i]), num_attr(x$confidence[i]),
      if ("american_price" %in% names(x) && !is.na(x$american_price[i])) escape_html(as.character(x$american_price[i])) else ""
    )
  }, character(1))
  paste0(
    '<div class="board-controls"><button class="filter-chip active" data-filter="all">All</button>',
    '<button class="filter-chip" data-filter="pitcher_strikeouts">Pitchers</button>',
    '<button class="filter-chip" data-filter="batter_total_bases">Batters</button>',
    '<button class="filter-chip" data-filter="nrfi">NRFI</button>',
    '<select id="matchup-filter"><option value="all">All matchups</option></select></div>',
    '<div class="signal-table-wrap"><table class="signal-table projection-table"><thead><tr>',
    '<th>Bet</th><th>Market</th><th>Matchup</th><th>Price</th><th>Gap</th>',
    '<th><span class="explain" title="Probability for the displayed side, not a guarantee">Probability</span></th>',
    '<th><span class="explain" title="A board-ranking score, not a literal win probability">Score</span></th>',
    '<th>Slip</th>',
    '</tr></thead><tbody>', paste(rows, collapse = ""), '</tbody></table></div>',
    '<script src="assets/board.js"></script><script src="assets/picks.js"></script>'
  )
}
