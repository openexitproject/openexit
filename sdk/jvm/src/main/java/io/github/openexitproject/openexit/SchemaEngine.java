package io.github.openexitproject.openexit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.*;
import java.io.*;
import java.nio.CharBuffer;
import java.nio.charset.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Bundled-only schema validation. */
final class SchemaEngine {
    static final ObjectMapper MAPPER = new ObjectMapper();
    static final JsonSchemaFactory FACTORY = JsonSchemaFactory.builder(JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012))
        .schemaMappers(m -> {
            m.mapPrefix("https://openexit.dev/pasp/1.0/schemas/", "classpath:/io/github/openexitproject/openexit/schemas/");
            m.add(uri -> {
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme) || "file".equalsIgnoreCase(scheme))
                    return new com.networknt.schema.AbsoluteIri("urn:openexit:blocked:" + Integer.toHexString(uri.toString().hashCode()));
                return uri;
            });
        })
        .build();
    private static final Map<String, JsonSchema> SCHEMAS = new ConcurrentHashMap<>();
    private SchemaEngine() { }
    static JsonNode parse(byte[] bytes, String code) {
        try { CharBuffer chars = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)); return MAPPER.readTree(chars.toString()); }
        catch (Exception e) { throw new PaspException(code, "Invalid UTF-8 or JSON", e); }
    }
    static byte[] resource(String name) {
        try (InputStream in = SchemaEngine.class.getResourceAsStream("/io/github/openexitproject/openexit/schemas/" + name)) {
            if (in == null) throw new IllegalArgumentException("Unknown schema: " + name); return in.readAllBytes();
        } catch (IOException e) { throw new IllegalStateException(e); }
    }
    static JsonSchema schema(String name) {
        return SCHEMAS.computeIfAbsent(name, n -> FACTORY.getSchema(parse(resource(n), "PASP_INVALID_MANIFEST")));
    }
    static void validate(JsonNode value, JsonSchema schema, String code, String label) {
        Set<ValidationMessage> errors = schema.validate(value);
        if (!errors.isEmpty()) throw new PaspException(code, label + ": " + errors.iterator().next().getMessage());
    }
    static JsonSchema compileUntrusted(JsonNode schema) {
        try { return FACTORY.getSchema(schema); }
        catch (RuntimeException e) { throw new PaspException("PASP_INVALID_RESOURCE", "Schema resolution failed safely", e); }
    }
    static void validateUntrusted(JsonNode schema, JsonNode instance) {
        try { compileUntrusted(schema).validate(instance); }
        catch (RuntimeException e) { throw new PaspException("PASP_INVALID_RESOURCE", "Schema resolution failed safely", e); }
    }
}
