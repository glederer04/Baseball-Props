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

event_date <- as.Date(Sys.getenv("EVENT_DATE", unset = as.character(Sys.Date())))
event_timezone <- "America/New_York"
run_timestamp <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
slate_label <- sprintf("%s %d, %s", format(event_date, "%B"), as.integer(format(event_date, "%d")), format(event_date, "%Y"))

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
format_game_time <- function(x) sub("^0", "", format(with_tz(ymd_hms(x), event_timezone), "%I:%M %p ET"))
clamp <- function(x, lower = 0, upper = 100) pmin(pmax(x, lower), upper)
side_from_probability <- function(probability_over) if_else(probability_over >= 0.5, "Over", "Under")
side_probability <- function(probability_over) pmax(probability_over, 1 - probability_over)
confidence_score <- function(probability, line_gap, line_scale) {
  probability_component <- clamp((probability - 0.5) / 0.25, 0, 1)
  gap_component <- clamp(abs(line_gap) / line_scale, 0, 1)
  round(85 * (0.62 * probability_component + 0.38 * gap_component), 1)
}

get_json <- function(url, ...) {
  request(url) |>
    req_url_query(...) |>
    req_user_agent("Diamond Signal MLB research dashboard") |>
    req_timeout(seconds = 30) |>
    req_retry(max_tries = 3) |>
    req_perform() |>
    resp_body_json(simplifyVector = FALSE)
}

fetch_venue <- function(venue_id) {
  venue <- get_json(
    "https://statsapi.mlb.com/api/v1/venues",
    venueIds = venue_id,
    hydrate = "location,fieldInfo"
  )$venues[[1]]
  location <- venue$location %||% list()
  field <- venue$fieldInfo %||% list()
  coordinates <- location$defaultCoordinates %||% list()
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

fetch_forecast_at_start <- function(latitude, longitude, commence_time) {
  if (is.na(latitude) || is.na(longitude)) {
    return(tibble(temperature_f = 70, wind_mph = 0))
  }
  payload <- tryCatch(
    get_json(
      "https://api.open-meteo.com/v1/forecast",
      latitude = latitude,
      longitude = longitude,
      hourly = "temperature_2m,wind_speed_10m",
      temperature_unit = "fahrenheit",
      wind_speed_unit = "mph",
      timezone = event_timezone,
      forecast_days = 16
    ),
    error = function(cnd) {
      warning(
        sprintf(
          "Open-Meteo forecast unavailable for %.4f, %.4f at %s: %s",
          latitude, longitude, commence_time, conditionMessage(cnd)
        ),
        call. = FALSE
      )
      NULL
    }
  )
  if (is.null(payload) || is.null(payload$hourly)) {
    return(tibble(temperature_f = 70, wind_mph = 0))
  }
  forecast_time <- unlist(payload$hourly$time)
  temperature_f <- unlist(payload$hourly$temperature_2m)
  wind_mph <- unlist(payload$hourly$wind_speed_10m)
  n <- min(length(forecast_time), length(temperature_f), length(wind_mph))
  if (n == 0) {
    return(tibble(temperature_f = 70, wind_mph = 0))
  }
  hourly <- tibble(
    forecast_time = ymd_hm(forecast_time[seq_len(n)], tz = event_timezone),
    temperature_f = as.numeric(temperature_f[seq_len(n)]),
    wind_mph = as.numeric(wind_mph[seq_len(n)])
  )
  local_start <- with_tz(ymd_hms(commence_time), event_timezone)
  hourly[which.min(abs(difftime(hourly$forecast_time, local_start, units = "mins"))), c("temperature_f", "wind_mph")]
}

fetch_schedule <- function() {
  payload <- get_json(
    "https://statsapi.mlb.com/api/v1/schedule",
    sportId = 1,
    date = as.character(event_date),
    hydrate = "venue,probablePitcher"
  )
  games <- map_dfr(payload$dates %||% list(), function(day) {
    map_dfr(day$games %||% list(), function(game) {
      tibble(
        game_pk = int(game$gamePk),
        home_team = chr(game$teams$home$team$name),
        away_team = chr(game$teams$away$team$name),
        home_probable_pitcher = chr(game$teams$home$probablePitcher$fullName),
        away_probable_pitcher = chr(game$teams$away$probablePitcher$fullName),
        commence_time = chr(game$gameDate),
        venue_id = int(game$venue$id),
        is_night = as.integer(chr(game$dayNight) == "night")
      )
    })
  })
  if (!nrow(games)) return(games)
  venues <- map_dfr(unique(games$venue_id), fetch_venue)
  games |>
    left_join(venues, by = "venue_id") |>
    mutate(
      matchup = paste(away_team, "at", home_team),
      game_time = format_game_time(commence_time),
      weather = pmap(list(latitude, longitude, commence_time), fetch_forecast_at_start)
    ) |>
    unnest(weather)
}

make_player_features <- function(schedule, market) {
  teams <- unique(c(schedule$home_team, schedule$away_team))
  recent_cutoff <- max(current_form$last_game_date) - days(35)
  team_games <- bind_rows(
    schedule |>
      transmute(
        matchup, game_time, team = home_team, opponent = away_team, is_home = 1L,
        temperature_f, wind_mph, is_night, roof_closed_or_fixed, grass_surface,
        elevation_ft, center_ft
      ),
    schedule |>
      transmute(
        matchup, game_time, team = away_team, opponent = home_team, is_home = 0L,
        temperature_f, wind_mph, is_night, roof_closed_or_fixed, grass_surface,
        elevation_ft, center_ft
      )
  )
  current_form |>
    filter(market == !!market, team %in% teams, last_game_date >= recent_cutoff) |>
    left_join(team_games, by = "team") |>
    left_join(current_opponent_form, by = c("market", "opponent"))
}

project_batters <- function(schedule) {
  features <- make_player_features(schedule, "batter_total_bases")
  if (!nrow(features)) return(tibble())
  features |>
    mutate(
      expected_count = pmax(predict(models$batter_total_bases, newdata = features, type = "response"), .001),
      reference_line = 1.5,
      probability_over = ppois(reference_line, expected_count, lower.tail = FALSE),
      selected_side = "Over",
      model_probability = probability_over,
      line_gap = expected_count - reference_line,
      confidence = confidence_score(model_probability, pmax(line_gap, 0), line_scale = 1),
      recommendation = paste(selected_side, reference_line, "TB")
    ) |>
    group_by(matchup) |>
    slice_max(confidence, n = 5, with_ties = FALSE) |>
    ungroup() |>
    transmute(
      slate_date = as.character(event_date), slate_label, selection = player_name,
      matchup, game_time, market, recommended_side = selected_side,
      recommendation, expected_count, reference_line, line_gap,
      probability_over, model_probability, confidence,
      projection_note = "Lineup unconfirmed · reference over 1.5 TB",
      status = "Batter watch", generated_at = run_timestamp
    )
}

project_pitchers <- function(schedule) {
  pitcher_names <- schedule |>
    select(matchup, game_time, home_team, away_team, home_probable_pitcher, away_probable_pitcher) |>
    pivot_longer(c(home_probable_pitcher, away_probable_pitcher), names_to = "location", values_to = "player_name") |>
    filter(!is.na(player_name), nzchar(player_name)) |>
    mutate(player_key = clean_key(player_name))
  features <- make_player_features(schedule, "pitcher_strikeouts") |>
    mutate(player_key = clean_key(player_name)) |>
    inner_join(pitcher_names |> select(player_key, matchup), by = c("player_key", "matchup"))
  if (!nrow(features)) return(tibble())
  features |>
    mutate(
      expected_count = pmax(predict(models$pitcher_strikeouts, newdata = features, type = "response"), .001),
      reference_line = pmax(2.5, pmin(8.5, floor(player_mean_10) + 0.5)),
      probability_over = ppois(reference_line, expected_count, lower.tail = FALSE),
      selected_side = side_from_probability(probability_over),
      model_probability = side_probability(probability_over),
      line_gap = expected_count - reference_line,
      confidence = confidence_score(model_probability, line_gap, line_scale = 2),
      recommendation = paste(selected_side, reference_line, "K")
    ) |>
    transmute(
      slate_date = as.character(event_date), slate_label, selection = player_name,
      matchup, game_time, market, recommended_side = selected_side,
      recommendation, expected_count, reference_line, line_gap,
      probability_over, model_probability, confidence,
      projection_note = paste("Probable starter · model vs reference", reference_line, "K"),
      status = "Probable starter", generated_at = run_timestamp
    )
}

project_nrfi <- function(schedule) {
  pitcher_form <- current_form |>
    filter(market == "pitcher_strikeouts") |>
    mutate(pitcher_key = clean_key(player_name))
  features <- schedule |>
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
    left_join(current_nrfi_team_form |> rename(home_team = team, home_nrfi_mean_10 = nrfi_mean_10), by = "home_team") |>
    left_join(current_nrfi_team_form |> rename(away_team = team, away_nrfi_mean_10 = nrfi_mean_10), by = "away_team") |>
    left_join(current_nrfi_venue_form, by = "venue_id") |>
    filter(if_all(c(home_player_mean_10, away_player_mean_10, venue_nrfi_mean_20), ~ !is.na(.x)))
  if (!nrow(features)) return(tibble())
  features |>
    mutate(
      probability_nrfi = predict(nrfi_model, newdata = features, type = "response"),
      selected_side = if_else(probability_nrfi >= 0.5, "NRFI", "YRFI"),
      model_probability = pmax(probability_nrfi, 1 - probability_nrfi),
      confidence = round(85 * clamp((model_probability - 0.5) / 0.15, 0, 1), 1),
      recommendation = selected_side
    ) |>
    transmute(
      slate_date = as.character(event_date), slate_label, selection = selected_side,
      matchup, game_time, market = "nrfi", recommended_side = selected_side,
      recommendation, expected_count = NA_real_, reference_line = .5,
      line_gap = NA_real_, probability_over = probability_nrfi,
      model_probability, confidence,
      projection_note = paste(home_probable_pitcher, "vs", away_probable_pitcher),
      status = "Probable starters", generated_at = run_timestamp
    )
}

schedule <- fetch_schedule()
projections <- bind_rows(
  project_pitchers(schedule),
  project_nrfi(schedule),
  project_batters(schedule)
) |>
  mutate(market_order = match(market, c("pitcher_strikeouts", "batter_total_bases", "nrfi"))) |>
  arrange(desc(confidence), market_order, desc(model_probability), matchup) |>
  select(-market_order)

write_csv(projections, file.path(site_dir, "today_projections.csv"))
message("Wrote ", nrow(projections), " model-only projections for ", event_date, ".")
