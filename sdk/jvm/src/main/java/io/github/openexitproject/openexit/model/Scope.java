package io.github.openexitproject.openexit.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

/** PASP logical state scope. */
public record Scope(String type, String id, JsonNode metadata) { }
