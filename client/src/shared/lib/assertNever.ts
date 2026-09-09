/**
 * Compile-time exhaustiveness guard for a discriminated union. Call it from the `default:` of a
 * `switch` (or the `else` of an `if`-chain) that is meant to handle every arm: if a new arm is
 * added to the union without a branch, `value` is no longer `never` and the call stops compiling,
 * naming the unhandled type in the error.
 *
 * At runtime it throws — reserved for a value the type system says is impossible. A surface that
 * must *degrade* rather than crash on an unknown value (e.g. a client older than a schema that
 * added an attribute type) does its own runtime check first and never reaches here.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}
