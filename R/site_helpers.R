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

market_label <- function(x) {
  labels <- c(
    batter_total_bases = "Batter Total Bases",
    pitcher_strikeouts = "Pitcher Strikeouts",
    totals_1st_1_innings = "First Inning Total",
    nrfi = "NRFI"
  )
  unname(ifelse(x %in% names(labels), labels[x], x))
}

metric_card <- function(label, value, detail, title = "") {
  sprintf(
    '<div class="metric" title="%s"><span class="metric-label">%s</span><span class="metric-value">%s</span><span class="metric-detail">%s</span></div>',
    escape_html(title), escape_html(label), escape_html(value), escape_html(detail)
  )
}

render_signal_table <- function(x) {
  if (!nrow(x)) {
    return('<div class="empty-state"><h3>No priced signals are available yet.</h3><p>The prediction engine is ready, but the live sportsbook feed has not produced a card for this run. No placeholder picks are shown.</p></div>')
  }
  x <- x[order(-x$probability_difference), , drop = FALSE]
  rows <- vapply(seq_len(nrow(x)), function(i) {
    strength <- if (x$probability_difference[i] >= .07) "strong" else "watch"
    sprintf(
      paste0('<tr><td><strong>%s</strong><br><span class="mini-note">%s at %s</span></td>',
        '<td><span class="pill %s">%s</span></td><td>%s %s</td><td>%s</td>',
        '<td title="The model estimate for this side">%s</td>',
        '<td title="Sportsbook probability after removing estimated vig">%s</td>',
        '<td class="edge-pos" title="Model probability minus no-vig market probability">+%s</td></tr>'),
      escape_html(x$selection[i]), escape_html(x$matchup[i]), escape_html(x$game_time[i]),
      strength, escape_html(x$signal[i]), escape_html(x$side[i]), escape_html(x$line[i]),
      american(x$american_price[i]), pct(x$model_probability[i]), pct(x$implied_probability[i]),
      pct(x$probability_difference[i])
    )
  }, character(1))
  paste0(
    '<div class="signal-table-wrap"><table class="signal-table"><thead><tr>',
    '<th>Selection</th><th>Signal</th><th>Pick</th><th>Price</th>',
    '<th><span class="explain" title="The model estimated probability for the selected side">Model</span></th>',
    '<th><span class="explain" title="The market probability after removing estimated sportsbook margin">Market</span></th>',
    '<th><span class="explain" title="Model probability minus market probability">Edge</span></th>',
    '</tr></thead><tbody>', paste(rows, collapse = ""), '</tbody></table></div>'
  )
}

render_projection_board <- function(x) {
  if (!nrow(x)) {
    return('<div class="empty-state"><h3>No model-only projections are available.</h3><p>The MLB schedule or probable-starter feed did not produce usable rows for this date.</p></div>')
  }
  rows <- vapply(seq_len(nrow(x)), function(i) {
    expectation <- if (x$market[i] == "nrfi") pct(x$model_probability[i]) else sprintf("%.2f", x$expected_count[i])
    expectation_label <- if (x$market[i] == "nrfi") "NRFI probability" else "Expected count"
    sprintf(
      paste0('<tr data-market="%s" data-matchup="%s"><td><strong>%s</strong><br><span class="mini-note">%s</span></td>',
        '<td><span class="pill">%s</span></td><td>%s<br><span class="mini-note">%s</span></td>',
        '<td><strong>%s</strong><br><span class="mini-note">%s</span></td>',
        '<td><div class="prob-track"><span style="width:%s"></span></div><strong>%s</strong></td></tr>'),
      escape_html(x$market[i]), escape_html(x$matchup[i]), escape_html(x$selection[i]), escape_html(x$projection_note[i]),
      escape_html(market_label(x$market[i])), escape_html(x$matchup[i]), escape_html(x$game_time[i]),
      expectation, expectation_label, pct(x$model_probability[i]), pct(x$model_probability[i])
    )
  }, character(1))
  paste0(
    '<div class="board-controls"><button class="filter-chip active" data-filter="all">All</button>',
    '<button class="filter-chip" data-filter="pitcher_strikeouts">Pitchers</button>',
    '<button class="filter-chip" data-filter="batter_total_bases">Batters</button>',
    '<button class="filter-chip" data-filter="nrfi">NRFI</button>',
    '<select id="matchup-filter"><option value="all">All matchups</option></select></div>',
    '<div class="signal-table-wrap"><table class="signal-table projection-table"><thead><tr>',
    '<th>Selection</th><th>Market</th><th>Matchup</th><th>Projection</th>',
    '<th><span class="explain" title="Model probability over the displayed reference line, or NRFI probability">Probability</span></th>',
    '</tr></thead><tbody>', paste(rows, collapse = ""), '</tbody></table></div>',
    '<script src="assets/board.js"></script>'
  )
}
