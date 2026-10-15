export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("The request body must be JSON.");
  }
}
