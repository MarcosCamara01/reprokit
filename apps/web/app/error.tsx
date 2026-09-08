"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-lg font-medium">Something broke</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button type="button" className="mt-4 text-sm text-primary underline" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
