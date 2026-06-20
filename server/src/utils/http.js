const defaultHeaders = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

export async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000),
  });

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
