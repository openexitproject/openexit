package io.github.openexitproject.openexit.model;

/** Manifest integrity algorithm and optional checksum index path. */
public record IntegrityInfo(String algorithm, String checksums) { }
