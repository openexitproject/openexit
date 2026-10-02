package io.github.openexitproject.openexit.model;

import com.fasterxml.jackson.databind.JsonNode;

/** Manifest consistency declaration and optional generic metadata. */
public record Consistency(ConsistencyLevel level, JsonNode metadata) { }
