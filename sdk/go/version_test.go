package openexit

import "testing"

func TestVersion(t *testing.T) {
	if Version != "0.1.0" || PASPVersion != "1.0" {
		t.Fatalf("unexpected versions: %s %s", Version, PASPVersion)
	}
}
