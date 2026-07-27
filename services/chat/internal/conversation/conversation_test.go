package conversation

import "testing"

func TestDMKeyIsOrderIndependent(t *testing.T) {
	a, b := "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"

	got1 := dmKey(a, b)
	got2 := dmKey(b, a)

	if got1 != got2 {
		t.Fatalf("dmKey(a, b) = %q, dmKey(b, a) = %q; want equal regardless of argument order", got1, got2)
	}
	if got1 != a+":"+b {
		t.Fatalf("dmKey(a, b) = %q; want %q", got1, a+":"+b)
	}
}
