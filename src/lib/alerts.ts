/**
 * Best-effort operator alerts. There is no account model, so a webhook is the
 * only way to reach the user when the nightly run fails unattended. When
 * `ALERT_WEBHOOK_URL` is unset this is a no-op, and a failing webhook never
 * breaks processing.
 *
 * The JSON body carries both `text` (Slack / Mattermost) and `content`
 * (Discord) so the same URL works with the common chat webhooks.
 */
export async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Swallow: an alert that fails must not fail the job that raised it.
  }
}
