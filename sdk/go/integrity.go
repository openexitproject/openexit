package openexit

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
)

func hashReader(r io.Reader) (int64, string, error) {
	h := sha256.New()
	buf := make([]byte, 256*1024)
	n, err := io.CopyBuffer(h, r, buf)
	if err != nil {
		return n, "", err
	}
	return n, hex.EncodeToString(h.Sum(nil)), nil
}
