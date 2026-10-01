package openexit

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestSymlinkEscapeRejected(t *testing.T) {
	if runtimeSymlinkUnavailable(t) {
		return
	}
	d := t.TempDir()
	bundle := filepath.Join(d, "bundle")
	outside := filepath.Join(d, "outside")
	if err := os.MkdirAll(filepath.Join(bundle, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(outside, 0o755); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(outside, "secret.bin")
	if err := os.WriteFile(secret, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(bundle, "assets", "link.bin")
	if err := os.Symlink(secret, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	root, err := os.OpenRoot(bundle)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if _, err := root.Open("assets/link.bin"); err == nil {
		t.Fatal("root allowed symlink escape")
	}
}
func runtimeSymlinkUnavailable(t *testing.T) bool { return false }

func TestMissingBundle(t *testing.T) {
	err := VerifyBundle(filepath.Join(t.TempDir(), "missing"))
	if err == nil {
		t.Fatal("expected error")
	}
	var pe *PASPError
	if !errors.As(err, &pe) || pe.Code != "PASP_MALFORMED_PACKAGE" {
		t.Fatalf("unexpected error: %v", err)
	}
}
