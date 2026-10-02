package io.github.openexitproject.openexit;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import static org.junit.jupiter.api.Assertions.*;

class ConformanceTest {
    static Path repo() { Path p=Path.of("").toAbsolutePath(); while(p!=null&&!Files.exists(p.resolve("protocol/pasp/v1/conformance/suite.json"))) p=p.getParent(); if(p==null) throw new IllegalStateException("Repository root not found"); return p; }
    @TestFactory Stream<DynamicTest> suite() throws Exception {
        JsonNode suite=SchemaEngine.MAPPER.readTree(Files.readAllBytes(repo().resolve("protocol/pasp/v1/conformance/suite.json")));
        return StreamSupport.stream(suite.path("cases").spliterator(),false).map(c->DynamicTest.dynamicTest(c.path("id").asText(),()->{
            Path root=repo().resolve("protocol/pasp/v1/conformance").resolve(c.path("path").asText());
            if(c.path("expected").path("valid").asBoolean()) OpenExit.verifyBundle(root);
            else { PaspException e=assertThrows(PaspException.class,()->OpenExit.verifyBundle(root)); assertEquals(c.path("expected").path("errorCode").asText(),e.getCode()); }
        }));
    }
    @org.junit.jupiter.api.Test void versionsSchemasAndStrictUtf8() throws Exception {
        assertEquals("0.1.0",OpenExitInfo.VERSION); assertEquals("1.0",OpenExitInfo.PASP_VERSION);
        assertEquals(9,Files.list(repo().resolve("protocol/pasp/v1/schemas")).count());
        assertThrows(PaspException.class,()->OpenExit.parseManifest(new byte[]{(byte)0xc3,0x28}));
        assertDoesNotThrow(()->OpenExit.parseManifest(Files.readAllBytes(repo().resolve("protocol/pasp/v1/conformance/valid/minimal/manifest.json"))));
    }
    @org.junit.jupiter.api.Test void schemaCopyDrift() throws Exception {
        Path canonical=repo().resolve("protocol/pasp/v1/schemas"), bundled=Path.of("src/main/resources/io/github/openexitproject/openexit/schemas");
        try(var files=Files.list(canonical)) { assertEquals(9,files.count()); }
        try(var files=Files.list(canonical)) { files.forEach(p->{try{assertArrayEquals(Files.readAllBytes(p),Files.readAllBytes(bundled.resolve(p.getFileName())));}catch(Exception e){throw new RuntimeException(e);}}); }
    }
}
