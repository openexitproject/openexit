package openexit

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed schemas/*.schema.json
var schemaFS embed.FS

var schemaNames = []string{"manifest", "scope", "resource", "resource-chunk", "asset", "relationship", "checkpoint", "event", "inspection-result"}

var (
	canonicalOnce      sync.Once
	canonicalCompiler  *jsonschema.Compiler
	canonicalSchemas   map[string]*jsonschema.Schema
	canonicalSchemaErr error
)

type deniedSchemaLoader struct{}

func (deniedSchemaLoader) Load(url string) (any, error) {
	return nil, fmt.Errorf("external schema loading is disabled: %s", url)
}

// LoadSchema returns an embedded canonical PASP JSON Schema.
func LoadSchema(name string) ([]byte, error) {
	for _, known := range schemaNames {
		if name == known || name == known+".schema.json" {
			return schemaFS.ReadFile("schemas/" + known + ".schema.json")
		}
	}
	return nil, pasp("PASP_MISSING_SCHEMA", "load schema", name, fmt.Errorf("unknown canonical schema"))
}

func decodeSchemaDocument(data []byte) (any, map[string]any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var value any
	if err := dec.Decode(&value); err != nil {
		return nil, nil, err
	}
	if err := rejectRemoteRefs(value); err != nil {
		return nil, nil, err
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, nil, fmt.Errorf("schema must be an object")
	}
	return value, object, nil
}

func initializeCanonicalSchemas() {
	canonicalOnce.Do(func() {
		compiler := jsonschema.NewCompiler()
		compiler.DefaultDraft(jsonschema.Draft2020)
		compiler.UseLoader(deniedSchemaLoader{})
		canonicalSchemas = make(map[string]*jsonschema.Schema, len(schemaNames))
		for _, name := range schemaNames {
			data, err := LoadSchema(name)
			if err != nil {
				canonicalSchemaErr = err
				return
			}
			document, object, err := decodeSchemaDocument(data)
			if err != nil {
				canonicalSchemaErr = err
				return
			}
			id, ok := object["$id"].(string)
			if !ok || id == "" {
				canonicalSchemaErr = fmt.Errorf("schema %s has no $id", name)
				return
			}
			if err := compiler.AddResource(id, document); err != nil {
				canonicalSchemaErr = err
				return
			}
		}
		for _, name := range schemaNames {
			data, _ := LoadSchema(name)
			_, object, _ := decodeSchemaDocument(data)
			id := object["$id"].(string)
			sch, err := compiler.Compile(id)
			if err != nil {
				canonicalSchemaErr = err
				return
			}
			canonicalSchemas[name] = sch
		}
		canonicalCompiler = compiler
	})
}

func validateCanonical(name string, value any) error {
	initializeCanonicalSchemas()
	if canonicalSchemaErr != nil {
		return canonicalSchemaErr
	}
	sch := canonicalSchemas[name]
	if sch == nil {
		return fmt.Errorf("unknown canonical schema %q", name)
	}
	return sch.Validate(value)
}

func compileCustomerSchema(data []byte, location string) (*jsonschema.Schema, error) {
	document, object, err := decodeSchemaDocument(data)
	if err != nil {
		return nil, err
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	compiler.UseLoader(deniedSchemaLoader{})
	if err := compiler.AddResource(location, document); err != nil {
		return nil, err
	}
	if id, ok := object["$id"].(string); ok && id != "" && id != location {
		if err := compiler.AddResource(id, document); err != nil {
			return nil, err
		}
	}
	return compiler.Compile(location)
}

func rejectRemoteRefs(value any) error {
	switch v := value.(type) {
	case map[string]any:
		if ref, ok := v["$ref"].(string); ok && strings.Contains(ref, "://") {
			return fmt.Errorf("external schema reference is disabled: %s", ref)
		}
		for _, child := range v {
			if err := rejectRemoteRefs(child); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range v {
			if err := rejectRemoteRefs(child); err != nil {
				return err
			}
		}
	}
	return nil
}

func schemaBytesEqual(a, b []byte) bool { return bytes.Equal(a, b) }
