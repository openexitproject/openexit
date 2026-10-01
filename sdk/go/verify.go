package openexit

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"hash"
	"io"
	"os"
	"path"
	"strings"
	"unicode/utf8"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
)

// VerifyBundle verifies a PASP 1.0 directory bundle.
func VerifyBundle(root string) error {
	r, err := os.OpenRoot(root)
	if err != nil {
		return pasp("PASP_MALFORMED_PACKAGE", "verify bundle", root, err)
	}
	defer r.Close()
	manifestBytes, err := r.ReadFile("manifest.json")
	if err != nil {
		return pasp("PASP_MALFORMED_PACKAGE", "verify bundle", "manifest.json", err)
	}
	if err := ValidateManifest(manifestBytes); err != nil {
		return err
	}
	manifest, err := ParseManifest(manifestBytes)
	if err != nil {
		return pasp("PASP_INVALID_MANIFEST", "verify bundle", "manifest.json", err)
	}
	seen := map[string]bool{}
	for _, entry := range manifest.Resources {
		if seen[entry.Name] {
			return pasp("PASP_DUPLICATE_RESOURCE", "verify resource", entry.Name, nil)
		}
		seen[entry.Name] = true
		if err := verifyResource(r, entry); err != nil {
			return err
		}
	}
	if manifest.Relationships != "" {
		if err := verifyRelationships(r, manifest.Relationships, seen); err != nil {
			return err
		}
	}
	if manifest.Assets.Count > 0 || manifest.Assets.Index != "" {
		if err := verifyAssets(r, *manifest); err != nil {
			return err
		}
	}
	return nil
}

func verifyResource(root *os.Root, entry ManifestEntry) error {
	if err := validatePackagePath(entry.Descriptor); err != nil {
		return pasp("PASP_PATH_TRAVERSAL", "verify resource", entry.Descriptor, err)
	}
	f, err := openBundleFile(root, entry.Descriptor)
	if err != nil {
		return missing("PASP_MALFORMED_PACKAGE", "verify resource", entry.Descriptor, err)
	}
	defer f.Close()
	b, err := io.ReadAll(f)
	if err != nil {
		return pasp("PASP_INVALID_RESOURCE", "read resource descriptor", entry.Descriptor, err)
	}
	v, err := decodeJSON(b)
	if err != nil {
		return pasp("PASP_INVALID_RESOURCE", "parse resource descriptor", entry.Descriptor, err)
	}
	if err := validateCanonical("resource", v); err != nil {
		return pasp("PASP_INVALID_RESOURCE", "validate resource descriptor", entry.Descriptor, err)
	}
	resourceMap := v.(map[string]any)
	if resourceMap["name"] != entry.Name {
		return pasp("PASP_INVALID_RESOURCE", "verify resource", entry.Name, fmt.Errorf("descriptor name mismatch"))
	}
	resource := Resource{}
	if err := json.Unmarshal(b, &resource); err != nil {
		return pasp("PASP_INVALID_RESOURCE", "decode resource descriptor", entry.Descriptor, err)
	}
	compiledSchema, err := validateResourceSchema(root, resource.Schema)
	if err != nil {
		return mapResourceSchemaError(err, resource.Schema)
	}
	previous := int64(0)
	total := int64(0)
	for _, chunk := range resource.Chunks {
		if chunk.Sequence != previous+1 || chunk.Sequence < 1 {
			return pasp("PASP_INVALID_RESOURCE", "verify chunk", entry.Name, fmt.Errorf("non-contiguous chunk sequence"))
		}
		previous = chunk.Sequence
		base := path.Base(chunk.Path)
		expected := fmt.Sprintf("%08d.ndjson", chunk.Sequence)
		if base != expected || !strings.HasPrefix(chunk.Path, "resources/"+entry.Name+"/") {
			return pasp("PASP_INVALID_RESOURCE", "verify chunk", chunk.Path, fmt.Errorf("filename or resource mismatch"))
		}
		if err := validatePackagePath(chunk.Path); err != nil {
			return pasp("PASP_PATH_TRAVERSAL", "verify chunk", chunk.Path, err)
		}
		cf, err := openBundleFile(root, chunk.Path)
		if err != nil {
			return missing("PASP_MALFORMED_PACKAGE", "open chunk", chunk.Path, err)
		}
		count, n, sum, err := readChunk(cf, compiledSchema)
		cf.Close()
		if err != nil {
			return err
		}
		if count != chunk.RecordCount || n != chunk.UncompressedBytes || sum != chunk.SHA256 {
			return pasp("PASP_CHECKSUM_MISMATCH", "verify chunk", chunk.Path, fmt.Errorf("chunk integrity mismatch"))
		}
		total += count
	}
	if total != resource.RecordCount {
		return pasp("PASP_INVALID_RESOURCE", "verify resource", entry.Name, fmt.Errorf("record count mismatch"))
	}
	return nil
}

func validateResourceSchema(root *os.Root, schema json.RawMessage) (*jsonschema.Schema, error) {
	if len(schema) == 0 {
		return nil, fmt.Errorf("missing resource schema")
	}
	if schema[0] == '"' {
		var ref string
		if err := json.Unmarshal(schema, &ref); err != nil {
			return nil, err
		}
		if err := validatePackagePath(ref); err != nil {
			return nil, err
		}
		if !strings.HasPrefix(ref, "schemas/") {
			return nil, fmt.Errorf("schema must be package-local")
		}
		f, err := root.Open(ref)
		if err != nil {
			if os.IsNotExist(err) {
				return nil, fmt.Errorf("missing schema: %w", err)
			}
			return nil, err
		}
		defer f.Close()
		b, err := io.ReadAll(f)
		if err != nil {
			return nil, err
		}
		return compileCustomerSchema(b, "bundle://"+ref)
	}
	return compileCustomerSchema(schema, "bundle://inline/resource.schema.json")
}

func mapResourceSchemaError(err error, schema json.RawMessage) error {
	if strings.Contains(err.Error(), "missing") {
		return pasp("PASP_MISSING_SCHEMA", "load resource schema", string(schema), err)
	}
	return pasp("PASP_INVALID_RESOURCE", "load resource schema", "", err)
}

func readChunk(f io.Reader, schema *jsonschema.Schema) (int64, int64, string, error) {
	tee := &countingReader{r: f}
	h := bufio.NewReaderSize(tee, 256*1024)
	var records int64
	for {
		line, err := h.ReadBytes('\n')
		if len(line) > 0 {
			raw := bytes.TrimSuffix(line, []byte{'\n'})
			raw = bytes.TrimSuffix(raw, []byte{'\r'})
			if len(raw) == 0 {
				return 0, 0, "", pasp("PASP_INVALID_RECORD", "read resource", "", fmt.Errorf("empty NDJSON record"))
			}
			if !utf8.Valid(raw) {
				return 0, 0, "", pasp("PASP_INVALID_RECORD", "read resource", "", fmt.Errorf("invalid UTF-8"))
			}
			value, decErr := decodeJSON(raw)
			if decErr != nil {
				return 0, 0, "", pasp("PASP_INVALID_RECORD", "read resource", "", decErr)
			}
			if _, ok := value.(map[string]any); !ok {
				return 0, 0, "", pasp("PASP_INVALID_RECORD", "read resource", "", fmt.Errorf("record must be an object"))
			}
			if err := schema.Validate(value); err != nil {
				return 0, 0, "", pasp("PASP_INVALID_RECORD", "read resource", "", err)
			}
			records++
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, 0, "", err
		}
	}
	return records, tee.n, tee.hash(), nil
}

type countingReader struct {
	r io.Reader
	n int64
	h hash.Hash
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	if c.h == nil {
		c.h = sha256.New()
	}
	_, _ = c.h.Write(p[:n])
	return n, err
}
func (c *countingReader) hash() string {
	if c.h == nil {
		c.h = sha256.New()
	}
	return hex.EncodeToString(c.h.Sum(nil))
}

func verifyAssets(root *os.Root, manifest Manifest) error {
	index := manifest.Assets.Index
	if index == "" {
		index = "assets/index.ndjson"
	}
	if err := validatePackagePath(index); err != nil {
		return pasp("PASP_PATH_TRAVERSAL", "verify assets", index, err)
	}
	f, err := root.Open(index)
	if err != nil {
		return pasp("PASP_MISSING_ASSET", "open asset index", index, err)
	}
	defer f.Close()
	reader := bufio.NewReaderSize(f, 256*1024)
	var count, total int64
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			line = bytes.TrimSuffix(bytes.TrimSuffix(line, []byte{'\n'}), []byte{'\r'})
			if !utf8.Valid(line) {
				return pasp("PASP_INVALID_RECORD", "read asset index", index, fmt.Errorf("invalid UTF-8"))
			}
			value, e := decodeJSON(line)
			if e != nil {
				return pasp("PASP_INVALID_RECORD", "read asset index", index, e)
			}
			if e = validateCanonical("asset", value); e != nil {
				return pasp("PASP_INVALID_RECORD", "read asset index", index, e)
			}
			b, _ := json.Marshal(value)
			var asset struct {
				Path       string `json:"path"`
				SHA256     string `json:"sha256"`
				ByteLength int64  `json:"byteLength"`
			}
			_ = json.Unmarshal(b, &asset)
			if e = verifyAsset(root, asset.Path, asset.SHA256, asset.ByteLength); e != nil {
				return e
			}
			count++
			total += asset.ByteLength
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	if count != manifest.Assets.Count || total != manifest.Assets.TotalBytes {
		return pasp("PASP_CHECKSUM_MISMATCH", "verify assets", index, fmt.Errorf("asset totals mismatch"))
	}
	return nil
}
func verifyAsset(root *os.Root, p, expected string, size int64) error {
	if err := validatePackagePath(p); err != nil {
		return pasp("PASP_PATH_TRAVERSAL", "verify asset", p, err)
	}
	f, err := root.Open(p)
	if err != nil {
		return pasp("PASP_MISSING_ASSET", "open asset", p, err)
	}
	defer f.Close()
	n, sum, err := hashReader(f)
	if err != nil {
		return err
	}
	if n != size || sum != expected {
		return pasp("PASP_CHECKSUM_MISMATCH", "verify asset", p, fmt.Errorf("asset integrity mismatch"))
	}
	return nil
}

func verifyRelationships(root *os.Root, p string, resources map[string]bool) error {
	if err := validatePackagePath(p); err != nil {
		return pasp("PASP_PATH_TRAVERSAL", "verify relationships", p, err)
	}
	f, err := root.Open(p)
	if err != nil {
		return pasp("PASP_INVALID_RELATIONSHIP", "open relationships", p, err)
	}
	defer f.Close()
	b, err := io.ReadAll(f)
	if err != nil {
		return err
	}
	v, err := decodeJSON(b)
	if err != nil {
		return pasp("PASP_INVALID_RELATIONSHIP", "parse relationships", p, err)
	}
	list, ok := v.([]any)
	if !ok {
		return pasp("PASP_INVALID_RELATIONSHIP", "validate relationships", p, fmt.Errorf("relationships must be an array"))
	}
	for _, raw := range list {
		m, ok := raw.(map[string]any)
		if !ok {
			return pasp("PASP_INVALID_RELATIONSHIP", "validate relationship", p, fmt.Errorf("relationship must be object"))
		}
		from, fok := m["from"].(map[string]any)
		to, tok := m["to"].(map[string]any)
		if !fok || !tok {
			return pasp("PASP_INVALID_RELATIONSHIP", "validate relationship", p, fmt.Errorf("missing endpoints"))
		}
		fr, _ := from["resource"].(string)
		tr, _ := to["resource"].(string)
		if !resources[fr] || !resources[tr] {
			return pasp("PASP_INVALID_RELATIONSHIP", "validate relationship", p, fmt.Errorf("unknown endpoint resource"))
		}
	}
	return nil
}
