package openexit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"unicode/utf8"
)

func decodeJSON(data []byte) (any, error) {
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("invalid UTF-8")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var value any
	if err := dec.Decode(&value); err != nil {
		return nil, err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("multiple JSON values")
		}
		return nil, err
	}
	return value, nil
}

// ParseManifest parses one UTF-8 PASP manifest without verifying a bundle.
func ParseManifest(data []byte) (*Manifest, error) {
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("invalid UTF-8")
	}
	var m Manifest
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	if err := dec.Decode(&m); err != nil {
		return nil, err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("multiple JSON values")
		}
		return nil, err
	}
	return &m, nil
}

// ParseManifestReader parses a manifest from a caller-owned reader.
func ParseManifestReader(r io.Reader) (*Manifest, error) {
	if r == nil {
		return nil, fmt.Errorf("nil reader")
	}
	b, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	return ParseManifest(b)
}

// ParseManifestFile parses a manifest file from an explicitly supplied path.
func ParseManifestFile(path string) (*Manifest, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return ParseManifestReader(f)
}

// ValidateManifest validates raw JSON against PASP manifest semantics.
func ValidateManifest(data []byte) error {
	v, err := decodeJSON(data)
	if err != nil {
		return pasp("PASP_INVALID_MANIFEST", "validate manifest", "manifest.json", err)
	}
	if err := validateManifestValue(v); err != nil {
		if _, ok := err.(*PASPError); ok {
			return err
		}
		return pasp("PASP_INVALID_MANIFEST", "validate manifest", "manifest.json", err)
	}
	return nil
}

func validateManifestValue(value any) error {
	m, ok := value.(map[string]any)
	if !ok {
		return fmt.Errorf("manifest must be an object")
	}
	if version, ok := m["paspVersion"].(string); ok && version != PASPVersion {
		return pasp("PASP_UNSUPPORTED_VERSION", "validate manifest", "paspVersion", fmt.Errorf("unsupported PASP version %q", version))
	}
	if resources, ok := m["resources"].([]any); ok {
		seen := make(map[string]bool, len(resources))
		for _, raw := range resources {
			entry, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			name, _ := entry["name"].(string)
			descriptor, _ := entry["descriptor"].(string)
			if !resourceName(name) {
				return pasp("PASP_INVALID_RESOURCE", "validate manifest", name, fmt.Errorf("invalid resource name"))
			}
			if seen[name] {
				return pasp("PASP_DUPLICATE_RESOURCE", "validate manifest", name, fmt.Errorf("duplicate resource"))
			}
			seen[name] = true
			if err := validatePackagePath(descriptor); err != nil {
				return pasp("PASP_PATH_TRAVERSAL", "validate manifest", descriptor, err)
			}
		}
	}
	if err := validateCanonical("manifest", m); err != nil {
		return err
	}
	resources, ok := m["resources"].([]any)
	if !ok {
		return fmt.Errorf("invalid resources")
	}
	seen := make(map[string]bool, len(resources))
	for _, raw := range resources {
		entry, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("invalid resource entry")
		}
		name, _ := entry["name"].(string)
		descriptor, _ := entry["descriptor"].(string)
		if seen[name] {
			return pasp("PASP_DUPLICATE_RESOURCE", "validate manifest", name, fmt.Errorf("duplicate resource"))
		}
		seen[name] = true
		if err := validatePackagePath(descriptor); err != nil {
			return pasp("PASP_PATH_TRAVERSAL", "validate manifest", descriptor, err)
		}
	}
	return nil
}

func resourceName(s string) bool {
	if len(s) == 0 || len(s) > 128 {
		return false
	}
	for i, r := range s {
		if !(r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '.' || r == '_' || r == '-') {
			return false
		}
		if i == 0 && !(r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9') {
			return false
		}
	}
	return true
}
