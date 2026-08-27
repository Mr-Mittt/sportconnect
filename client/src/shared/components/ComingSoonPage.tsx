interface ComingSoonPageProps {
  title: string;
}

// PROFILE-7: no longer a `<main>` — its only call site (`MemoriesTab`) mounts
// it inside `ProfilePage`'s own `<main>`, and a nested `<main>` landmark is
// invalid document structure (axe: landmark-main-is-top-level). A generic
// route-level placeholder (this component's original purpose) would need its
// own `<main>` again — reintroduce it there if a future route-level use
// returns, rather than assuming this div is always the right wrapper.
export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="py-4">
      <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
      <p className="mt-2 text-text-muted">Coming soon.</p>
    </div>
  );
}
