package openexit

import "fmt"

// PASPError is a protocol error with a stable PASP error code.
type PASPError struct {
	Code string
	Op   string
	Path string
	Err  error
}

// Error returns a concise diagnostic without embedding record contents.
func (e *PASPError) Error() string {
	if e == nil {
		return "<nil>"
	}
	message := e.Code
	if e.Op != "" {
		message += " during " + e.Op
	}
	if e.Path != "" {
		message += " (" + e.Path + ")"
	}
	if e.Err != nil {
		message += ": " + e.Err.Error()
	}
	return message
}

// Unwrap returns the underlying cause, when one exists.
func (e *PASPError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func pasp(code, op, path string, err error) error {
	if err == nil {
		err = fmt.Errorf("protocol validation failed")
	}
	return &PASPError{Code: code, Op: op, Path: path, Err: err}
}
