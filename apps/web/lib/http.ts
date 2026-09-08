function jsonError(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown error";
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status: number }).status)
      : message.includes("MACHINE_JWT") || message.includes("bearer") || message.includes("machine token")
        ? 401
        : 400;
  return Response.json({ error: message }, { status: Number.isFinite(status) ? status : 400 });
}

export { jsonError };
