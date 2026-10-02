package io.github.openexitproject.openexit;

import com.fasterxml.jackson.databind.JsonNode;
import com.networknt.schema.JsonSchema;
import io.github.openexitproject.openexit.model.*;
import java.io.*;
import java.nio.file.*;
import java.nio.charset.CharacterCodingException;
import java.util.*;

/** Public PASP parsing, inspection, schema loading, and verification facade. */
public final class OpenExit {
    private OpenExit() { }
    /** Parses a strict UTF-8 manifest as JSON. @param json manifest bytes @return parsed manifest */
    public static Manifest parseManifest(byte[] json) { return manifest(SchemaEngine.parse(json, "PASP_INVALID_MANIFEST")); }
    /** Parses a manifest without taking ownership of the stream. @param input caller-owned input @return parsed manifest */
    public static Manifest parseManifest(InputStream input) { try { return parseManifest(input.readAllBytes()); } catch (IOException e) { throw new PaspException("PASP_INVALID_MANIFEST", "Unable to read manifest", e); } }
    /** Parses a manifest file. @param path manifest path @return parsed manifest */
    public static Manifest parseManifest(Path path) { try { return parseManifest(Files.readAllBytes(path)); } catch (IOException e) { throw new PaspException("PASP_MALFORMED_PACKAGE", "Unable to read manifest", e); } }
    private static Manifest manifest(JsonNode n) {
        if (n == null || !n.isObject()) throw new PaspException("PASP_INVALID_MANIFEST", "Manifest must be an object");
        try { return SchemaEngine.MAPPER.treeToValue(n, Manifest.class); }
        catch (IOException | IllegalArgumentException e) { throw new PaspException("PASP_INVALID_MANIFEST", "Manifest fields cannot be represented", e); }
    }
    private static String text(JsonNode n,String key) { JsonNode v=n.get(key); return v != null && v.isTextual()?v.textValue():null; }
    /** Validates manifest against the bundled canonical schema. @param json manifest bytes */
    public static void validateManifest(byte[] json) {
        JsonNode node=SchemaEngine.parse(json,"PASP_INVALID_MANIFEST");
        if (node.has("paspVersion") && !"1.0".equals(text(node,"paspVersion"))) throw new PaspException("PASP_UNSUPPORTED_VERSION","Unsupported PASP version");
        Set<String> resourceNames = new HashSet<>();
        for (JsonNode resource : node.path("resources")) {
            String name = text(resource,"name"), descriptor = text(resource,"descriptor");
            if (name != null && !resourceNames.add(name)) throw new PaspException("PASP_DUPLICATE_RESOURCE","Duplicate resource");
            if (name != null && !name.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,127}")) throw new PaspException("PASP_INVALID_RESOURCE","Invalid resource name");
            if (descriptor != null && (Arrays.asList(descriptor.split("/",-1)).contains("..") || descriptor.startsWith("/") || descriptor.startsWith("~") || descriptor.matches("^[A-Za-z]:.*") || descriptor.indexOf('\\')>=0 || descriptor.indexOf('\0')>=0)) throw new PaspException("PASP_PATH_TRAVERSAL","Unsafe descriptor path");
        }
        SchemaEngine.validate(node,SchemaEngine.schema("manifest.schema.json"),"PASP_INVALID_MANIFEST","Invalid manifest");
    }
    /** Loads a canonical schema from the JAR. @param name schema filename @return schema bytes */
    public static byte[] loadSchema(String name) { return SchemaEngine.resource(name); }
    /** Returns bundle summary, capturing protocol failures. @param root directory bundle @return summary */
    public static InspectionResult inspectBundle(Path root) {
        try { JsonNode n=SchemaEngine.MAPPER.readTree(Files.readAllBytes(root.resolve("manifest.json"))); return new InspectionResult(true,text(n,"paspVersion"),n.path("resources").size(),(int)n.path("assets").path("count").asLong(0),List.of()); }
        catch(Exception e) { String code=e instanceof PaspException p?p.getCode():"PASP_MALFORMED_PACKAGE"; return new InspectionResult(false,null,0,0,List.of(new InspectionResult.InspectionError(code,e.getMessage(),"manifest.json"))); }
    }
    /** Fully verifies a directory bundle. @param root bundle root */
    public static void verifyBundle(Path root) {
        Path base=root.toAbsolutePath().normalize();
        try {
            if(!Files.isDirectory(base)) throw new PaspException("PASP_MALFORMED_PACKAGE","Bundle directory is missing");
            Path mp=safe(base,"manifest.json"); if(!Files.isRegularFile(mp)) throw new PaspException("PASP_MALFORMED_PACKAGE","manifest.json is missing");
            byte[] manifest=Files.readAllBytes(mp); validateManifest(manifest); JsonNode m=SchemaEngine.parse(manifest,"PASP_INVALID_MANIFEST");
            Set<String> names=new HashSet<>();
            for(JsonNode entry:m.path("resources")) {
                String name=text(entry,"name"), dp=text(entry,"descriptor");
                if(!names.add(name)) throw new PaspException("PASP_DUPLICATE_RESOURCE","Duplicate resource");
                JsonNode d=readJson(safe(base,dp),"PASP_INVALID_RESOURCE"); SchemaEngine.validate(d,SchemaEngine.schema("resource.schema.json"),"PASP_INVALID_RESOURCE","Invalid resource descriptor");
                if(!name.equals(text(d,"name"))) throw new PaspException("PASP_INVALID_RESOURCE","Resource name mismatch");
                JsonNode rs=d.path("schema"); JsonSchema recordSchema;
                if(rs.isTextual()) { Path sp=safe(base,rs.asText()); if(!Files.exists(sp)) throw new PaspException("PASP_MISSING_SCHEMA","Resource schema missing"); recordSchema=SchemaEngine.FACTORY.getSchema(SchemaEngine.parse(Files.readAllBytes(sp),"PASP_INVALID_RESOURCE")); }
                else recordSchema=SchemaEngine.FACTORY.getSchema(rs);
                long records=0, expectedSeq=1;
                for(JsonNode c:d.path("chunks")) {
                    long seq=c.path("sequence").asLong(-1); String rel=text(c,"path");
                    if(seq!=expectedSeq++ || !rel.equals(String.format(Locale.ROOT,"resources/%s/%08d.ndjson",name,seq))) throw new PaspException("PASP_INVALID_RESOURCE","Chunk sequence or path invalid");
                    Path chunk=safe(base,rel); DigestResult digest=streamNdjson(chunk,recordSchema);
                    if(digest.bytes!=c.path("uncompressedBytes").asLong(-1) || digest.records!=c.path("recordCount").asLong(-1) || !digest.sha.equals(text(c,"sha256"))) throw new PaspException("PASP_CHECKSUM_MISMATCH","Chunk metadata mismatch");
                    records+=digest.records;
                }
                if(records!=d.path("recordCount").asLong(-1)) throw new PaspException("PASP_INVALID_RESOURCE","Resource record count mismatch");
            }
            verifyRelationships(base,m); verifyAssets(base,m);
        } catch(PaspException e) { throw e; } catch(IOException e) { throw new PaspException("PASP_MALFORMED_PACKAGE","Unable to read bundle",e); } catch(RuntimeException e) { throw new PaspException("PASP_INVALID_RESOURCE","Malformed bundle data",e); }
    }
    private static JsonNode readJson(Path p,String code) throws IOException { return SchemaEngine.parse(Files.readAllBytes(p),code); }
    static Path safe(Path root,String raw) {
        if(raw==null || raw.indexOf('\0')>=0 || raw.startsWith("/") || raw.startsWith("~") || raw.matches("^[A-Za-z]:.*") || raw.startsWith("\\\\") || raw.indexOf('\\')>=0) throw new PaspException("PASP_PATH_TRAVERSAL","Unsafe package path");
        for(String segment:raw.split("/",-1)) if(segment.equals("..") || segment.isEmpty()) throw new PaspException("PASP_PATH_TRAVERSAL","Unsafe package path");
        Path p=root.resolve(raw).normalize(); if(!p.startsWith(root)) throw new PaspException("PASP_PATH_TRAVERSAL","Path escapes bundle");
        try { Path realRoot=root.toRealPath(); Path real=p.toRealPath(); if(!real.startsWith(realRoot)) throw new PaspException("PASP_PATH_TRAVERSAL","Path escapes bundle through link"); }
        catch(NoSuchFileException e) { /* existence is checked by caller */ } catch(IOException e) { throw new PaspException("PASP_PATH_TRAVERSAL","Cannot establish path containment",e); }
        return p;
    }
    record DigestResult(long bytes,long records,String sha) { }
    static DigestResult streamNdjson(Path file,JsonSchema schema) throws IOException {
        java.security.MessageDigest md=sha(); long bytes=0,records=0; byte[] buf=new byte[8192]; ByteArrayOutputStream line=new ByteArrayOutputStream();
        try(InputStream in=Files.newInputStream(file)) { int n; while((n=in.read(buf))!=-1) { bytes+=n; md.update(buf,0,n); for(int i=0;i<n;i++) { if(buf[i]=='\n') { validateRecord(line.toByteArray(),schema); line.reset(); records++; } else line.write(buf[i]); } } }
        if(line.size()>0) { validateRecord(line.toByteArray(),schema); records++; }
        return new DigestResult(bytes,records,HexFormat.of().formatHex(md.digest()));
    }
    private static void validateRecord(byte[] b,JsonSchema schema) { JsonNode node=SchemaEngine.parse(b,"PASP_INVALID_RECORD"); if(!node.isObject()) throw new PaspException("PASP_INVALID_RECORD","Resource record must be an object"); SchemaEngine.validate(node,schema,"PASP_INVALID_RECORD","Invalid resource record"); }
    private static java.security.MessageDigest sha() { try{return java.security.MessageDigest.getInstance("SHA-256");}catch(Exception e){throw new IllegalStateException(e);} }
    private static void verifyRelationships(Path root,JsonNode manifest) throws IOException {
        if(!manifest.has("relationships")) return; Path p=safe(root,"relationships.json"); JsonNode a=readJson(p,"PASP_INVALID_RELATIONSHIP"); JsonSchema s=SchemaEngine.schema("relationship.schema.json");
        if(!a.isArray()) throw new PaspException("PASP_INVALID_RELATIONSHIP","Relationships must be an array"); Set<String> resources=new HashSet<>(); manifest.path("resources").forEach(x->resources.add(text(x,"name")));
        for(JsonNode rel:a) { SchemaEngine.validate(rel,s,"PASP_INVALID_RELATIONSHIP","Invalid relationship"); if(!resources.contains(rel.path("from").path("resource").asText())||!resources.contains(rel.path("to").path("resource").asText())) throw new PaspException("PASP_INVALID_RELATIONSHIP","Relationship resource missing"); }
    }
    private static void verifyAssets(Path root,JsonNode m) throws IOException {
        JsonNode expected=m.path("assets"); if(!expected.has("index") && expected.path("count").asLong()==0) return;
        String index=expected.has("index")?expected.path("index").asText():"assets/index.ndjson";
        Path p=safe(root,index); JsonSchema schema=SchemaEngine.schema("asset.schema.json"); long count=0,total=0;
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(Files.newInputStream(p),java.nio.charset.StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)))) { String line; while((line=reader.readLine())!=null) { JsonNode a=SchemaEngine.parse(line.getBytes(java.nio.charset.StandardCharsets.UTF_8),"PASP_INVALID_RESOURCE"); SchemaEngine.validate(a,schema,"PASP_INVALID_RESOURCE","Invalid asset descriptor"); Path asset=safe(root,text(a,"path")); if(!Files.isRegularFile(asset)) throw new PaspException("PASP_MISSING_ASSET","Asset bytes missing"); DigestResult dg=hash(asset); if(dg.bytes!=a.path("byteLength").asLong()||!dg.sha.equals(text(a,"sha256"))) throw new PaspException("PASP_CHECKSUM_MISMATCH","Asset metadata mismatch"); count++; total+=dg.bytes; } }
        catch(CharacterCodingException e) { throw new PaspException("PASP_INVALID_RESOURCE","Invalid asset index UTF-8",e); }
        if(count!=expected.path("count").asLong()||total!=expected.path("totalBytes").asLong()) throw new PaspException("PASP_INVALID_MANIFEST","Asset totals mismatch");
    }
    static DigestResult hash(Path p) throws IOException { try(InputStream in=Files.newInputStream(p)) { return hash(in); } }
    static DigestResult hash(InputStream in) throws IOException { java.security.MessageDigest md=sha(); long bytes=0; byte[] b=new byte[8192]; int n; while((n=in.read(b))!=-1){md.update(b,0,n);bytes+=n;} return new DigestResult(bytes,0,HexFormat.of().formatHex(md.digest())); }
}
