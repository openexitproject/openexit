package openexit

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"testing"
)

type readCounter struct {
	r     io.Reader
	reads int
}

func (r *readCounter) Read(p []byte) (int, error) {
	r.reads++
	return r.r.Read(p)
}

func TestHashReaderStreamsLargeFile(t *testing.T) {
	const size = 16 * 1024 * 1024
	path := filepath.Join(t.TempDir(), "large.bin")
	pattern := make([]byte, 64*1024)
	for i := range pattern {
		pattern[i] = byte(i * 31)
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	expected := sha256.New()
	for written := 0; written < size; written += len(pattern) {
		if _, err := file.Write(pattern); err != nil {
			file.Close()
			t.Fatal(err)
		}
		_, _ = expected.Write(pattern)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	file, err = os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	reader := &readCounter{r: file}
	count, digest, err := hashReader(reader)
	file.Close()
	if err != nil {
		t.Fatal(err)
	}
	if count != size {
		t.Fatalf("byte count = %d, want %d", count, size)
	}
	if digest != hex.EncodeToString(expected.Sum(nil)) {
		t.Fatalf("digest mismatch")
	}
	if reader.reads <= 1 {
		t.Fatalf("hash path performed %d read, want multiple bounded reads", reader.reads)
	}
}
