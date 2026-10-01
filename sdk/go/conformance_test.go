package openexit

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type suiteFile struct {
	Cases []suiteCase `json:"cases"`
}
type suiteCase struct {
	ID       string `json:"id"`
	Path     string `json:"path"`
	Expected struct {
		Valid     bool   `json:"valid"`
		ErrorCode string `json:"errorCode"`
	} `json:"expected"`
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	p := filepath.Dir(file)
	for {
		marker := filepath.Join(p, "protocol", "pasp", "v1", "conformance", "suite.json")
		if _, err := os.Stat(marker); err == nil {
			return p
		}
		next := filepath.Dir(p)
		if next == p {
			t.Fatal("repository root not found")
		}
		p = next
	}
}

func TestConformance(t *testing.T) {
	root := repositoryRoot(t)
	data, err := os.ReadFile(filepath.Join(root, "protocol", "pasp", "v1", "conformance", "suite.json"))
	if err != nil {
		t.Fatal(err)
	}
	var suite suiteFile
	if err := json.Unmarshal(data, &suite); err != nil {
		t.Fatal(err)
	}
	for _, tc := range suite.Cases {
		tc := tc
		t.Run(tc.ID, func(t *testing.T) {
			err := VerifyBundle(filepath.Join(root, "protocol", "pasp", "v1", "conformance", filepath.FromSlash(tc.Path)))
			if tc.Expected.Valid {
				if err != nil {
					t.Fatalf("expected valid bundle: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected protocol error")
			}
			var pe *PASPError
			if !errors.As(err, &pe) {
				t.Fatalf("expected PASPError, got %T: %v", err, err)
			}
			if pe.Code != tc.Expected.ErrorCode {
				t.Fatalf("error code = %s, want %s", pe.Code, tc.Expected.ErrorCode)
			}
		})
	}
}
