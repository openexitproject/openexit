package io.github.openexitproject.openexit;

/** A machine-readable PASP failure. */
public class PaspException extends RuntimeException {
    private final String code;
    /** Creates a protocol failure. @param code canonical PASP error code @param message safe description */
    public PaspException(String code, String message) { super(message); this.code = code; }
    /** Creates a protocol failure with cause. @param code canonical PASP error code @param message safe description @param cause underlying cause */
    public PaspException(String code, String message, Throwable cause) { super(message, cause); this.code = code; }
    /** Returns the canonical PASP error code. @return error code */
    public String getCode() { return code; }
}
