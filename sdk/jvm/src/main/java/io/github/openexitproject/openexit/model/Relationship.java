package io.github.openexitproject.openexit.model;

import com.fasterxml.jackson.databind.JsonNode;

/** Explicit PASP relationship; metadata remains generic JSON. */
public record Relationship(String id, RelationshipEndpoint from, RelationshipEndpoint to,
                           String cardinality, JsonNode metadata) { }
