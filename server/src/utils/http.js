const defaultHeaders = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

function describeFetchFailure(url, error) {
  if (error instanceof Error) {
    return `Network fetch failed for ${url}: ${error.message}`;
  }

  return `Network fetch failed for ${url}: ${String(error)}`;
}

export async function fetchText(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 20000),
    });
  } catch (error) {
    throw new Error(describeFetchFailure(url, error), {
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    headers: {
      accept: "application/json,text/plain;q=0.8,*/*;q=0.5",
      ...(options.headers ?? {}),
    },
  });
  return JSON.parse(text);
}

export const __testables = {
  describeFetchFailure,
};
