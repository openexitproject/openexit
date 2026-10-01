package openexit

import (
	"errors"
	"testing"
)

func TestManifestValidationErrors(t *testing.T) {
	if err := ValidateManifest([]byte{0xff}); err == nil {
		t.Fatal("expected UTF-8 error")
	}
	if err := ValidateManifest([]byte(`{"format":"openexit.bundle","paspVersion":"2.0"}`)); err == nil {
		t.Fatal("expected version error")
	} else {
		var pe *PASPError
		if !errors.As(err, &pe) || pe.Code != "PASP_UNSUPPORTED_VERSION" {
			t.Fatalf("unexpected error: %v", err)
		}
	}
}
