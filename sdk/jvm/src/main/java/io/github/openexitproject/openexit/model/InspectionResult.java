package io.github.openexitproject.openexit.model;

import java.util.List;

/** Summary produced while inspecting a directory bundle. */
public record InspectionResult(boolean valid, String paspVersion, int resources, int assets, List<InspectionError> errors) {
    /** One inspection error. */
    public record InspectionError(String code, String message, String path) { }
    public InspectionResult { errors = List.copyOf(errors); }
}
