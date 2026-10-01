package openexit

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestEmbeddedSchemasAndDrift(t *testing.T) {
	root := repositoryRoot(t)
	canonical := filepath.Join(root, "protocol", "pasp", "v1", "schemas")
	entries, err := os.ReadDir(canonical)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 9 {
		t.Fatalf("canonical schema count = %d", len(entries))
	}
	for _, entry := range entries {
		want, err := os.ReadFile(filepath.Join(canonical, entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		got, err := LoadSchema(entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(want, got) {
			t.Fatalf("schema drift: %s", entry.Name())
		}
	}
}

func TestUnknownSchema(t *testing.T) {
	if _, err := LoadSchema("unknown"); err == nil {
		t.Fatal("expected error")
	}
}

func TestRemoteSchemaReferencesAreRejectedWithoutRequests(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests++ }))
	defer server.Close()
	value := []byte(`{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"` + server.URL + `/schema.json"}`)
	if _, err := compileCustomerSchema(value, "bundle://remote-test.json"); err == nil {
		t.Fatal("expected remote reference rejection")
	}
	if requests != 0 {
		t.Fatalf("remote requests = %d", requests)
	}
	fileRef := []byte(`{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"file:///outside/schema.json"}`)
	if _, err := compileCustomerSchema(fileRef, "bundle://file-test.json"); err == nil {
		t.Fatal("expected file reference rejection")
	}
}

func TestDraft2020Features(t *testing.T) {
	tests := []struct {
		name   string
		schema string
		valid  []byte
		bad    []byte
	}{
		{
			name:   "$defs and $ref",
			schema: `{"$schema":"https://json-schema.org/draft/2020-12/schema","$defs":{"id":{"type":"integer"}},"$ref":"#/$defs/id"}`,
			valid:  []byte(`7`),
			bad:    []byte(`"7"`),
		},
		{
			name:   "const",
			schema: `{"$schema":"https://json-schema.org/draft/2020-12/schema","const":"pasp"}`,
			valid:  []byte(`"pasp"`),
			bad:    []byte(`"other"`),
		},
		{
			name:   "prefixItems",
			schema: `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"array","prefixItems":[{"type":"string"},{"type":"integer"}],"items":false}`,
			valid:  []byte(`["x",1]`),
			bad:    []byte(`["x",1,2]`),
		},
		{
			name:   "dependentRequired",
			schema: `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","dependentRequired":{"credit":["card"]}}`,
			valid:  []byte(`{"credit":true,"card":"123"}`),
			bad:    []byte(`{"credit":true}`),
		},
		{
			name:   "unevaluatedProperties",
			schema: `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"id":{"type":"integer"}},"unevaluatedProperties":false}`,
			valid:  []byte(`{"id":1}`),
			bad:    []byte(`{"id":1,"extra":true}`),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			sch, err := compileCustomerSchema([]byte(tc.schema), "bundle://draft-test.json")
			if err != nil {
				t.Fatal(err)
			}
			valid, err := decodeJSON(tc.valid)
			if err != nil {
				t.Fatal(err)
			}
			if err := sch.Validate(valid); err != nil {
				t.Fatalf("valid instance rejected: %v", err)
			}
			invalid, err := decodeJSON(tc.bad)
			if err != nil {
				t.Fatal(err)
			}
			if err := sch.Validate(invalid); err == nil {
				t.Fatal("invalid instance accepted")
			}
		})
	}
}
