package io.github.openexitproject.openexit.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** PASP consistency guarantee. */
public enum ConsistencyLevel {
    SNAPSHOT("snapshot"), BOUNDED("bounded"), BEST_EFFORT("best_effort");
    private final String wireName;
    ConsistencyLevel(String wireName) { this.wireName = wireName; }
    /** Returns the exact PASP wire value. */
    @JsonValue public String wireName() { return wireName; }
    /** Parses an exact PASP wire value. */
    @JsonCreator public static ConsistencyLevel fromWireName(String name) {
        for (ConsistencyLevel value : values()) if (value.wireName.equals(name)) return value;
        throw new IllegalArgumentException("Unknown PASP consistency level: " + name);
    }
}
