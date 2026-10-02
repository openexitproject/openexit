package io.github.openexitproject.openexit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.networknt.schema.JsonSchema;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicInteger;
import com.sun.net.httpserver.HttpServer;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class DeepGatesTest {
    @TempDir Path temp;

    @Test void draft202012KeywordsAreExecuted() throws Exception {
        JsonNode def=read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"$defs\":{\"positive\":{\"type\":\"integer\",\"minimum\":1}},\"$ref\":\"#/$defs/positive\"}");
        assertValid(def,"2"); assertInvalid(def,"0");
        JsonNode constant=read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"const\":\"pasp\"}"); assertValid(constant,"\"pasp\""); assertInvalid(constant,"\"other\"");
        JsonNode prefix=read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"prefixItems\":[{\"type\":\"integer\"},{\"type\":\"string\"}],\"items\":false}"); assertValid(prefix,"[1,\"x\"]"); assertInvalid(prefix,"[\"x\",1]");
        JsonNode dependent=read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"properties\":{\"credit_card\":{},\"billing_address\":{}},\"dependentRequired\":{\"credit_card\":[\"billing_address\"]}}"); assertValid(dependent,"{\"credit_card\":1,\"billing_address\":\"x\"}"); assertInvalid(dependent,"{\"credit_card\":1}");
        JsonNode unevaluated=read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"allOf\":[{\"properties\":{\"known\":{\"type\":\"string\"}}}],\"unevaluatedProperties\":false}"); assertValid(unevaluated,"{\"known\":\"x\"}"); assertInvalid(unevaluated,"{\"extra\":true}");
    }
    private static JsonNode read(String s) throws IOException { return SchemaEngine.MAPPER.readTree(s); }
    private static void assertValid(JsonNode schema,String instance) throws Exception { assertTrue(SchemaEngine.compileUntrusted(schema).validate(read(instance)).isEmpty()); }
    private static void assertInvalid(JsonNode schema,String instance) throws Exception { assertFalse(SchemaEngine.compileUntrusted(schema).validate(read(instance)).isEmpty()); }

    @Test void canonicalSchemasResolveFromPackagedRegistry() throws Exception {
        JsonSchema manifest=SchemaEngine.schema("manifest.schema.json");
        JsonNode fixture=SchemaEngine.MAPPER.readTree(Files.readAllBytes(ConformanceTest.repo().resolve("protocol/pasp/v1/conformance/valid/minimal/manifest.json")));
        assertTrue(manifest.validate(fixture).isEmpty());
    }

    @Test void remoteAndFileReferencesAreRejectedWithoutLoading() throws Exception {
        AtomicInteger requests=new AtomicInteger(); HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/evil-schema.json",exchange->{requests.incrementAndGet(); exchange.sendResponseHeaders(200,2); exchange.getResponseBody().write("{}".getBytes(StandardCharsets.UTF_8)); exchange.close();}); server.start();
        try {
            String http="http://127.0.0.1:"+server.getAddress().getPort()+"/evil-schema.json";
            assertThrows(PaspException.class,()->SchemaEngine.validateUntrusted(read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"$ref\":\""+http+"\"}"),read("{}")));
            assertEquals(0,requests.get());
            assertThrows(PaspException.class,()->SchemaEngine.validateUntrusted(read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"$ref\":\"https://example.invalid/schema.json\"}"),read("{}")));
            Path external=temp.resolve("external-schema.json"); Files.writeString(external,"{\"type\":\"object\"}"); String fileUri=external.toUri().toASCIIString();
            assertThrows(PaspException.class,()->SchemaEngine.validateUntrusted(read("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"$ref\":\""+fileUri+"\"}"),read("{}")));
        } finally { server.stop(0); }
        assertEquals(0,requests.get());
    }

    @Test void malformedResourceUtf8FailsAsPaspError() throws Exception {
        Path bundle=copyMinimal(); Path chunk=bundle.resolve("resources/users/00000001.ndjson"); byte[] valid=Files.readAllBytes(chunk); byte[] invalid=java.util.Arrays.copyOf(valid,valid.length+2); invalid[valid.length]=(byte)0xc3; invalid[valid.length+1]=0x28; Files.write(chunk,invalid);
        PaspException e=assertThrows(PaspException.class,()->OpenExit.verifyBundle(bundle)); assertEquals("PASP_INVALID_RECORD",e.getCode());
    }

    @Test void manyRecordsVerifyWithIncrementalNdjsonPath() throws Exception {
        Path bundle=copyMinimal(), chunk=bundle.resolve("resources/users/00000001.ndjson"), descriptor=bundle.resolve("resources/users/resource.json");
        MessageDigest digest=MessageDigest.getInstance("SHA-256"); long bytes=0, records=12000;
        try(OutputStream out=Files.newOutputStream(chunk)) { for(int i=0;i<records;i++) { byte[] row=("{\"id\":\"u"+i+"\"}\n").getBytes(StandardCharsets.UTF_8); out.write(row); digest.update(row); bytes+=row.length; } }
        ObjectNode d=(ObjectNode)SchemaEngine.MAPPER.readTree(Files.readAllBytes(descriptor)); d.put("recordCount",records); ((ObjectNode)d.withArray("chunks").get(0)).put("recordCount",records).put("uncompressedBytes",bytes).put("sha256",HexFormat.of().formatHex(digest.digest()));
        Files.write(descriptor,SchemaEngine.MAPPER.writeValueAsBytes(d)); OpenExit.verifyBundle(bundle);
    }

    @Test void productionDigestUsesMultipleBoundedReadsFor16MiB() throws Exception {
        Path file=temp.resolve("sixteen.bin"); byte[] pattern=new byte[4096]; for(int i=0;i<pattern.length;i++) pattern[i]=(byte)(i*31+7);
        MessageDigest expected=MessageDigest.getInstance("SHA-256"); try(OutputStream out=Files.newOutputStream(file)) { for(int i=0;i<4096;i++){out.write(pattern);expected.update(pattern);} }
        AtomicInteger reads=new AtomicInteger(); InputStream counted=new FilterInputStream(Files.newInputStream(file)) { @Override public int read(byte[] b,int off,int len)throws IOException{reads.incrementAndGet();return super.read(b,off,Math.min(len,8192));} };
        OpenExit.DigestResult result; try(counted){result=OpenExit.hash(counted);}
        assertEquals(16L*1024*1024,result.bytes()); assertEquals(HexFormat.of().formatHex(expected.digest()),result.sha()); assertTrue(reads.get()>1);
    }

    @Test void assetIndexIsProcessedOneDescriptorAtATime() throws Exception {
        Path bundle=copyMinimal(); Path index=bundle.resolve("assets/index.ndjson"); Files.createDirectories(index.getParent()); MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(BufferedWriter writer=Files.newBufferedWriter(index)) { for(int i=0;i<250;i++){ String id="a"+i,path="assets/objects/"+id+".bin"; Path asset=bundle.resolve(path); Files.createDirectories(asset.getParent()); Files.write(asset,new byte[0]); String row="{\"id\":\""+id+"\",\"path\":\""+path+"\",\"sha256\":\""+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest())+"\",\"byteLength\":0}"; writer.write(row);writer.newLine();digest.update((row+"\n").getBytes(StandardCharsets.UTF_8)); } }
        Path manifest=bundle.resolve("manifest.json"); ObjectNode m=(ObjectNode)SchemaEngine.MAPPER.readTree(Files.readAllBytes(manifest)); m.withObject("assets").put("count",250).put("totalBytes",0).put("index","assets/index.ndjson"); Files.write(manifest,SchemaEngine.MAPPER.writeValueAsBytes(m)); OpenExit.verifyBundle(bundle);
    }

    @Test void rawProtocolPathRulesArePlatformIndependent() throws Exception {
        Path root=temp.resolve("bundle"); Files.createDirectories(root);
        for(String bad:new String[]{"../foo","../../foo","/foo","C:\\foo","C:/foo","\\\\server\\share","..\\foo","foo/../../bar","foo\\..\\..\\bar","foo/..\\bar","a\0b"}) assertThrows(PaspException.class,()->OpenExit.safe(root,bad),bad);
        for(String good:new String[]{"resources/projects/00000001.ndjson","assets/index.ndjson","schemas/project.schema.json"}) assertEquals(root.resolve(good),OpenExit.safe(root,good));
    }

    @Test void fileAndDirectorySymlinksCannotEscapeRoot() throws Exception {
        Path root=temp.resolve("bundle"), outside=temp.resolve("outside"); Files.createDirectories(root); Files.createDirectories(outside); Path secret=Files.writeString(outside.resolve("secret.bin"),"secret");
        try { Files.createSymbolicLink(root.resolve("file-link"),secret); } catch(IOException|UnsupportedOperationException|SecurityException e) { assumeTrue(false,"File symlink unavailable: "+e.getMessage()); }
        assertEquals("PASP_PATH_TRAVERSAL",assertThrows(PaspException.class,()->OpenExit.safe(root,"file-link")).getCode());
        try { Files.createSymbolicLink(root.resolve("assets"),outside); } catch(IOException|UnsupportedOperationException|SecurityException e) { assumeTrue(false,"Directory symlink unavailable: "+e.getMessage()); }
        assertEquals("PASP_PATH_TRAVERSAL",assertThrows(PaspException.class,()->OpenExit.safe(root,"assets/secret.bin")).getCode());
    }

    @Test void windowsJunctionCannotEscapeRootWhenAvailable() throws Exception {
        Path root=temp.resolve("bundle"), outside=temp.resolve("junction-target"), junction=root.resolve("assets"); Files.createDirectories(root); Files.createDirectories(outside); Files.writeString(outside.resolve("secret.bin"),"secret");
        Process process=new ProcessBuilder("cmd.exe","/c","mklink /J \""+junction+"\" \""+outside+"\"").redirectErrorStream(true).start();
        String output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8); int result=process.waitFor();
        assumeTrue(result==0,"Windows junction unavailable: "+output);
        assertEquals("PASP_PATH_TRAVERSAL",assertThrows(PaspException.class,()->OpenExit.safe(root,"assets/secret.bin")).getCode());
    }

    @Test void manifestModelsCoverSchemaFieldsAndWireEnums() throws Exception {
        Path manifest=ConformanceTest.repo().resolve("protocol/pasp/v1/conformance/valid/minimal/manifest.json"); var parsed=OpenExit.parseManifest(Files.readAllBytes(manifest));
        assertEquals("organization",parsed.scope().type()); assertEquals("openexit-fixture",parsed.producer().name()); assertEquals("snapshot",parsed.consistency().level().wireName()); assertEquals(1,parsed.resources().size());
        assertEquals("snapshot",SchemaEngine.MAPPER.writeValueAsString(parsed.consistency().level()).replace("\"",""));
    }

    private Path copyMinimal() throws IOException {
        Path source=ConformanceTest.repo().resolve("protocol/pasp/v1/conformance/valid/minimal"), target=temp.resolve("bundle"+System.nanoTime());
        try(var paths=Files.walk(source)) { for(Path p:paths.toList()) { Path dest=target.resolve(source.relativize(p).toString()); if(Files.isDirectory(p))Files.createDirectories(dest); else Files.copy(p,dest); } }
        return target;
    }
}
