suppressPackageStartupMessages({
  library(dplyr)
  library(httr2)
  library(lubridate)
  library(purrr)
  library(readr)
  library(tibble)
})

site_dir <- "site-data"
dir.create(site_dir, recursive = TRUE, showWarnings = FALSE)

event_timezone <- "America/New_York"
end_date <- as.Date(Sys.getenv("EVENT_DATE", unset = as.character(Sys.Date()))) - days(1)
start_date <- end_date - days(as.integer(Sys.getenv("PICK_RESULT_LOOKBACK_DAYS", unset = "10")))

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x
num <- function(x) as.numeric(x %||% NA_real_)
int <- function(x) as.integer(x %||% NA_integer_)
chr <- function(x) as.character(x %||% NA_character_)

get_json <- function(url, ...) {
  request(url) |>
    req_url_query(...) |>
    req_user_agent("Diamond Signal MLB research dashboard") |>
    req_timeout(seconds = 30) |>
    req_retry(max_tries = 3) |>
    req_perform() |>
    resp_body_json(simplifyVector = FALSE)
}

fetch_schedule_date <- function(date) {
  payload <- get_json(
    "https://statsapi.mlb.com/api/v1/schedule",
    sportId = 1,
    date = as.character(date),
    hydrate = "linescore"
  )
  map_dfr(payload$dates %||% list(), function(day) {
    map_dfr(day$games %||% list(), function(game) {
      innings <- game$linescore$innings %||% list()
      first <- if (length(innings)) innings[[1]] else list()
      tibble(
        slate_date = as.character(date),
        game_pk = int(game$gamePk),
        matchup = paste(chr(game$teams$away$team$name), "at", chr(game$teams$home$team$name)),
        game_state = chr(game$status$detailedState),
        away_first_runs = int(first$away$runs %||% 0),
        home_first_runs = int(first$home$runs %||% 0)
      )
    })
  })
}

is_final_state <- function(x) {
  grepl("^Final", x %||% "") | (x %in% c("Game Over", "Completed Early"))
}

fetch_boxscore <- function(game_pk) {
  get_json(paste0("https://statsapi.mlb.com/api/v1/game/", game_pk, "/boxscore"))
}

extract_batters <- function(players, slate_date, matchup) {
  map_dfr(players, function(player) {
    batting <- player$stats$batting %||% list()
    total_bases <- num(batting$totalBases)
    if (is.na(total_bases)) return(tibble())
    tibble(
      slate_date, matchup,
      selection = chr(player$person$fullName),
      market = "batter_total_bases",
      actual_count = total_bases,
      actual_nrfi = NA_integer_
    )
  })
}

extract_pitchers <- function(players, slate_date, matchup) {
  map_dfr(players, function(player) {
    pitching <- player$stats$pitching %||% list()
    strikeouts <- num(pitching$strikeOuts)
    if (is.na(strikeouts)) return(tibble())
    tibble(
      slate_date, matchup,
      selection = chr(player$person$fullName),
      market = "pitcher_strikeouts",
      actual_count = strikeouts,
      actual_nrfi = NA_integer_
    )
  })
}

extract_game_results <- function(game) {
  boxscore <- fetch_boxscore(game$game_pk)
  away_players <- boxscore$teams$away$players %||% list()
  home_players <- boxscore$teams$home$players %||% list()
  players <- c(away_players, home_players)
  nrfi_hit <- as.integer((game$away_first_runs + game$home_first_runs) == 0)

  bind_rows(
    extract_batters(players, game$slate_date, game$matchup),
    extract_pitchers(players, game$slate_date, game$matchup),
    tibble(
      slate_date = game$slate_date,
      matchup = game$matchup,
      selection = c("NRFI", "YRFI"),
      market = "nrfi",
      actual_count = NA_real_,
      actual_nrfi = nrfi_hit
    )
  )
}

dates <- seq.Date(start_date, end_date, by = "day")
games <- map_dfr(dates, fetch_schedule_date) |>
  filter(is_final_state(game_state))

results <- if (nrow(games)) {
  map_dfr(seq_len(nrow(games)), function(index) extract_game_results(games[index, ])) |>
    distinct(slate_date, market, selection, matchup, .keep_all = TRUE) |>
    arrange(desc(slate_date), matchup, market, selection)
} else {
  tibble(
    slate_date = character(), matchup = character(), selection = character(),
    market = character(), actual_count = double(), actual_nrfi = integer()
  )
}

write_csv(results, file.path(site_dir, "pick_results.csv"))
message("Wrote ", nrow(results), " settlement rows from ", start_date, " through ", end_date, ".")
