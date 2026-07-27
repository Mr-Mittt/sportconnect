package message

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Send validates content before ever touching the repository or cache, so a
// zero-value Service (nil repo, nil cache) is safe to exercise here — no
// database needed for this test.
func TestSendRejectsEmptyContent(t *testing.T) {
	svc := NewService(nil, nil)

	_, err := svc.Send(context.Background(), 1, "user-1", "")

	assert.True(t, errors.Is(err, ErrEmptyContent))
}

func TestSendRejectsContentOverMaxLength(t *testing.T) {
	svc := NewService(nil, nil)
	tooLong := strings.Repeat("a", MaxContentLength+1)

	_, err := svc.Send(context.Background(), 1, "user-1", tooLong)

	assert.True(t, errors.Is(err, ErrContentTooLong))
}
