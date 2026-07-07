interface ComingSoonPageProps {
  title: string;
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <main className="py-4">
      <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
      <p className="mt-2 text-text-muted">Coming soon.</p>
    </main>
  );
}
