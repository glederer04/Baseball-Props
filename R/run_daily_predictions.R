suppressPackageStartupMessages({
  library(dplyr)
  library(httr2)
  library(lubridate)
  library(purrr)
  library(readr)
  library(tidyr)
})

runtime_dir <- "runtime"
site_dir <- "site-data"
dir.create(site_dir, recursive = TRUE, showWarnings = FALSE)

api_key <- Sys.getenv("ODDS_API_KEY")
event_date <- as.Date(Sys.getenv("EVENT_DATE", unset = as.character(Sys.Date())))
event_timezone <- "America/New_York"
minimum_edge <- as.numeric(Sys.getenv("MINIMUM_EDGE", unset = "0.03"))
run_timestamp <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")

models <- readRDS(file.path(runtime_dir, "prop_models.rds"))
nrfi_model <- readRDS(file.path(runtime_dir, "nrfi_model.rds"))
current_form <- readRDS(file.path(runtime_dir, "current_player_form.rds"))
current_opponent_form <- readRDS(file.path(runtime_dir, "current_opponent_form.rds"))
current_nrfi_team_form <- readRDS(file.path(runtime_dir, "current_nrfi_team_form.rds"))
current_nrfi_venue_form <- readRDS(file.path(runtime_dir, "current_nrfi_venue_form.rds"))

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x
num <- function(x) as.numeric(x %||% NA_real_)
int <- function(x) as.integer(x %||% NA_integer_)
chr <- function(x) as.character(x %||% NA_character_)
clean_key <- function(x) tolower(gsub("[^a-z0-9]", "", iconv(x, to = "ASCII//TRANSLIT")))
american_implied_probability <- function(price) {
  ifelse(price > 0, 100 / (price + 100), abs(price) / (abs(price) + 100))
}

empty_board <- function() {
  tibble(
    selection = character(), matchup = character(), game_time = character(),
    market = character(), side = character(), line = double(),
    american_price = double(), model_probability = double(),
    implied_probability = double(), probability_difference = double(),
    signal = character(), captured_at = character()
  )
}

get_public_json <- function(url, ...) {
  request(url) |>
    req_url_query(...) |>
    req_user_agent("Diamond Signal MLB research dashboard") |>
    req_timeout(seconds = 30) |>
    req_retry(max_tries = 3) |>
    req_perform() |>
    resp_body_json(simplifyVector = FALSE)
}

get_odds_json <- function(url, ...) get_public_json(url, apiKey = api_key, ...)

fetch_events <- function() {
  get_odds_json("https://api.the-odds-api.com/v4/sports/baseball_mlb/events")
}

fetch_fanduel_lines <- function(event) {
  payload <- get_odds_json(
    paste0("https://api.the-odds-api.com/v4/sports/baseball_mlb/events/", event$id, "/odds"),
    regions = "us",
    markets = "pitcher_strikeouts,batter_total_bases,totals_1st_1_innings",
    bookmakers = "fanduel",
    oddsFormat = "american"
  )
  map_dfr(payload$bookmakers %||% list(), function(book) {
    map_dfr(book$markets %||% list(), function(market) {
      map_dfr(market$outcomes %||% list(), function(outcome) {
        tibble(
          event_id = chr(event$id),
          commence_time = chr(event$commence_time),
          home_team = chr(event$home_team),
          away_team = chr(event$away_team),
          sportsbook = chr(book$key),
          market = chr(market$key),
          player_name = chr(outcome$description),
          side = chr(outcome$name),
          line = num(outcome$point),
          american_price = num(outcome$price),
          captured_at = run_timestamp
        )
      })
    })
  })
}

fetch_venue <- function(venue_id) {
  venue <- get_public_json(
    "https://statsapi.mlb.com/api/v1/venues",
    venueIds = venue_id,
    hydrate = "location,fieldInfo"
  )$venues[[1]]
  location <- venue$location %||% list()
  coordinates <- location$defaultCoordinates %||% list()
  field <- venue$fieldInfo %||% list()
  tibble(
    venue_id = int(venue$id),
    latitude = num(coordinates$latitude),
    longitude = num(coordinates$longitude),
    elevation_ft = num(location$elevation),
    roof_closed_or_fixed = as.integer(chr(field$roofType) %in% c("Closed", "Fixed", "Dome")),
    grass_surface = as.integer(chr(field$turfType) == "Grass"),
    center_ft = num(field$center)
  )
}

fetch_forecast_at_start <- function(latitude, longitude, game_datetime) {
  if (is.na(latitude) || is.na(longitude)) {
    return(tibble(temperature_f = 70, wind_mph = 0, precipitation_probability = NA_real_))
  }
  payload <- get_public_json(
    "https://api.open-meteo.com/v1/forecast",
    latitude = latitude, longitude = longitude,
    hourly = "temperature_2m,wind_speed_10m,precipitation_probability",
    temperature_unit = "fahrenheit", wind_speed_unit = "mph",
    timezone = event_timezone, forecast_days = 16
  )
  forecast_time <- unlist(payload$hourly$time)
  temperature_f <- unlist(payload$hourly$temperature_2m)
  wind_mph <- unlist(payload$hourly$wind_speed_10m)
  precipitation_probability <- unlist(payload$hourly$precipitation_probability)
  n <- min(length(forecast_time), length(temperature_f), length(wind_mph), length(precipitation_probability))
  if (n == 0) {
    return(tibble(temperature_f = 70, wind_mph = 0, precipitation_probability = NA_real_))
  }
  hourly <- tibble(
    forecast_time = ymd_hm(forecast_time[seq_len(n)], tz = event_timezone),
    temperature_f = as.numeric(temperature_f[seq_len(n)]),
    wind_mph = as.numeric(wind_mph[seq_len(n)]),
    precipitation_probability = as.numeric(precipitation_probability[seq_len(n)])
  )
  local_start <- with_tz(ymd_hms(game_datetime), event_timezone)
  hourly[which.min(abs(difftime(hourly$forecast_time, local_start, units = "mins"))), ]
}

fetch_daily_context <- function() {
  schedule <- get_public_json(
    "https://statsapi.mlb.com/api/v1/schedule",
    sportId = 1, date = as.character(event_date), hydrate = "venue,probablePitcher"
  )
  games <- map_dfr(schedule$dates %||% list(), function(day) {
    map_dfr(day$games %||% list(), function(game) {
      tibble(
        home_team_mlb = chr(game$teams$home$team$name),
        away_team_mlb = chr(game$teams$away$team$name),
        home_probable_pitcher = chr(game$teams$home$probablePitcher$fullName),
        away_probable_pitcher = chr(game$teams$away$probablePitcher$fullName),
        mlb_commence_time = chr(game$gameDate),
        venue_id = int(game$venue$id),
        is_night = as.integer(chr(game$dayNight) == "night")
      )
    })
  })
  if (!nrow(games)) return(games)
  venues <- map_dfr(unique(games$venue_id), fetch_venue)
  games |>
    left_join(venues, by = "venue_id") |>
    mutate(weather = pmap(list(latitude, longitude, mlb_commence_time), fetch_forecast_at_start)) |>
    unnest(weather) |>
    mutate(
      home_key = clean_key(home_team_mlb),
      away_key = clean_key(away_team_mlb)
    )
}

add_no_vig <- function(data) {
  data |>
    mutate(implied_probability_raw = american_implied_probability(american_price)) |>
    group_by(event_id, market, player_name, line) |>
    mutate(
      implied_probability = {
        # Only remove vig when we have a clean two-sided market.
        if (dplyr::n() == 2L && dplyr::n_distinct(side, na.rm = TRUE) == 2L) {
          implied_probability_raw / sum(implied_probability_raw)
        } else {
          implied_probability_raw
        }
      }
    ) |>
    ungroup()
}

signal_label <- function(edge) ifelse(edge >= .07, "Strong", "Watch")

score_player_props <- function(lines, context) {
  player_lines <- filter(lines, market %in% c("pitcher_strikeouts", "batter_total_bases"))
  if (!nrow(player_lines)) return(empty_board())
  scoring <- player_lines |>
    mutate(home_key = clean_key(home_team), away_key = clean_key(away_team)) |>
    left_join(context, by = c("home_key", "away_key")) |>
    mutate(player_key = clean_key(player_name)) |>
    left_join(
      current_form |>
        mutate(player_key = clean_key(player_name)) |>
        select(-player_name),
      by = c("market", "player_key")
    ) |>
    filter(!is.na(player_id)) |>
    mutate(
      is_home = as.integer(clean_key(team) == home_key),
      opponent = if_else(is_home == 1L, away_team_mlb, home_team_mlb)
    ) |>
    left_join(current_opponent_form, by = c("market", "opponent"))
  if (!nrow(scoring)) return(empty_board())
  scoring |>
    group_split(market) |>
    map_dfr(function(rows) {
      rows |> mutate(expected_count = pmax(predict(models[[unique(rows$market)]], newdata = rows, type = "response"), .001))
    }) |>
    mutate(
      probability_over = ppois(line, expected_count, lower.tail = FALSE),
      model_probability = if_else(side == "Over", probability_over, 1 - probability_over)
    ) |>
    add_no_vig() |>
    mutate(probability_difference = model_probability - implied_probability) |>
    filter(probability_difference >= minimum_edge) |>
    transmute(
      selection = player_name,
      matchup = paste(away_team, "at", home_team),
      game_time = format(with_tz(ymd_hms(commence_time), event_timezone), "%-I:%M %p ET"),
      market, side, line, american_price, model_probability, implied_probability,
      probability_difference, signal = signal_label(probability_difference), captured_at
    )
}

score_nrfi <- function(lines, context) {
  nrfi_lines <- filter(lines, market == "totals_1st_1_innings", line == .5)
  if (!nrow(nrfi_lines)) return(empty_board())
  pitcher_form <- current_form |>
    filter(market == "pitcher_strikeouts") |>
    mutate(pitcher_key = clean_key(player_name))
  scoring <- nrfi_lines |>
    mutate(home_key = clean_key(home_team), away_key = clean_key(away_team)) |>
    left_join(context, by = c("home_key", "away_key")) |>
    mutate(
      home_pitcher_key = clean_key(home_probable_pitcher),
      away_pitcher_key = clean_key(away_probable_pitcher)
    ) |>
    left_join(
      pitcher_form |> transmute(home_pitcher_key = pitcher_key, home_player_mean_10 = player_mean_10, home_workload_mean_10 = workload_mean_10),
      by = "home_pitcher_key"
    ) |>
    left_join(
      pitcher_form |> transmute(away_pitcher_key = pitcher_key, away_player_mean_10 = player_mean_10, away_workload_mean_10 = workload_mean_10),
      by = "away_pitcher_key"
    ) |>
    left_join(current_nrfi_team_form |> rename(home_team_mlb = team, home_nrfi_mean_10 = nrfi_mean_10), by = "home_team_mlb") |>
    left_join(current_nrfi_team_form |> rename(away_team_mlb = team, away_nrfi_mean_10 = nrfi_mean_10), by = "away_team_mlb") |>
    left_join(current_nrfi_venue_form, by = "venue_id") |>
    filter(if_all(c(home_player_mean_10, away_player_mean_10, venue_nrfi_mean_20), ~ !is.na(.x)))
  if (!nrow(scoring)) return(empty_board())
  scoring |>
    mutate(
      probability_nrfi = predict(nrfi_model, newdata = scoring, type = "response"),
      model_probability = if_else(side == "Under", probability_nrfi, 1 - probability_nrfi)
    ) |>
    add_no_vig() |>
    mutate(probability_difference = model_probability - implied_probability) |>
    filter(probability_difference >= minimum_edge) |>
    transmute(
      selection = if_else(side == "Under", "NRFI", "YRFI"),
      matchup = paste(away_team, "at", home_team),
      game_time = format(with_tz(ymd_hms(commence_time), event_timezone), "%-I:%M %p ET"),
      market, side, line, american_price, model_probability, implied_probability,
      probability_difference, signal = signal_label(probability_difference), captured_at
    )
}

if (!nzchar(api_key)) {
  message("ODDS_API_KEY is not configured; writing an honest empty board.")
  write_csv(empty_board(), file.path(site_dir, "latest_board.csv"))
  quit(save = "no", status = 0)
}

events <- fetch_events()
selected_events <- keep(events, function(event) {
  as.Date(with_tz(ymd_hms(event$commence_time), event_timezone)) == event_date
})
lines <- map_dfr(selected_events, fetch_fanduel_lines)
context <- fetch_daily_context()

board <- bind_rows(
  score_player_props(lines, context),
  score_nrfi(lines, context)
) |>
  distinct(selection, matchup, market, side, line, .keep_all = TRUE) |>
  arrange(desc(probability_difference))

write_csv(board, file.path(site_dir, "latest_board.csv"))
message("Wrote ", nrow(board), " qualified priced signals.")
