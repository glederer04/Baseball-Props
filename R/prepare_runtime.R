dir.create("runtime", recursive = TRUE, showWarnings = FALSE)

slim_glm <- function(model) {
  model$model <- NULL
  model$y <- NULL
  model$residuals <- NULL
  model$fitted.values <- NULL
  model$effects <- NULL
  model$weights <- NULL
  model$prior.weights <- NULL
  model$linear.predictors <- NULL
  model
}

models <- lapply(readRDS("data/processed/benchmark_models.rds"), slim_glm)
nrfi_model <- slim_glm(readRDS("data/processed/nrfi_model.rds"))

saveRDS(models, "runtime/prop_models.rds", compress = "xz")
saveRDS(nrfi_model, "runtime/nrfi_model.rds", compress = "xz")

runtime_files <- c(
  current_player_form = "current_player_form.rds",
  current_opponent_form = "current_opponent_form.rds",
  current_nrfi_team_form = "current_nrfi_team_form.rds",
  current_nrfi_venue_form = "current_nrfi_venue_form.rds"
)
for (name in names(runtime_files)) {
  saveRDS(
    readRDS(file.path("data", "processed", runtime_files[[name]])),
    file.path("runtime", paste0(name, ".rds")),
    compress = "xz"
  )
}
