# Security

Please report vulnerabilities in this tool, or in the Joomni API it uses, privately to **security@joomni.com** rather than in a public issue.

Keep `JOOMNI_API_KEY` out of CSV files, scripts you commit and screenshots. Use an environment variable, or a `.env` file (ignored by git) loaded with `node --env-file=.env`. If a key leaks, revoke it in **Settings › API & Webhooks**.
