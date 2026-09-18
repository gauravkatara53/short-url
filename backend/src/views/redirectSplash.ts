/**
 * HTML escaper to protect against XSS when interpolating dynamic values into HTML.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderRedirectSplash(options: {
  shortCode: string;
  destinationUrl: string;
  countdownSeconds?: number;
}): string {
  const { shortCode, destinationUrl, countdownSeconds = 5 } = options;
  const safeShortCode = escapeHtml(shortCode);
  const safeDestinationUrl = escapeHtml(destinationUrl);

  // Extract hostname safely
  let targetDomain = '';
  try {
    const parsed = new URL(destinationUrl);
    targetDomain = parsed.hostname;
  } catch {
    targetDomain = destinationUrl;
  }
  const safeDomain = escapeHtml(targetDomain);
  const jsonDestination = JSON.stringify(destinationUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="${countdownSeconds};url=${safeDestinationUrl}" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>Redirecting to ${safeDomain} | ClickStream</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f8fafc;
      background-image: radial-gradient(#e2e8f0 1.2px, transparent 1.2px);
      background-size: 24px 24px;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      padding: 1.5rem;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .card {
      position: relative;
      width: 100%;
      max-width: 480px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 2.75rem 2.25rem;
      box-shadow: 
        0 1px 3px rgba(0, 0, 0, 0.04),
        0 10px 25px -5px rgba(15, 23, 42, 0.08),
        0 4px 10px -2px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      animation: cardAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes cardAppear {
      from { opacity: 0; transform: scale(0.98) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 1.5rem;
    }
    .brand-icon {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: #f36601;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(243, 102, 1, 0.25);
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0f172a;
    }
    .brand-tag {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #64748b;
      background: #f1f5f9;
      padding: 0.2rem 0.45rem;
      border-radius: 4px;
    }
    .badge-safe {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      background: #ecfdf5;
      border: 1px solid #d1fae5;
      color: #047857;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      margin-bottom: 1.5rem;
    }
    .timer-container {
      position: relative;
      width: 112px;
      height: 112px;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .timer-svg {
      width: 112px;
      height: 112px;
      transform: rotate(-90deg);
    }
    .timer-circle-bg {
      fill: none;
      stroke: #f1f5f9;
      stroke-width: 6;
    }
    .timer-circle-progress {
      fill: none;
      stroke: #f36601;
      stroke-width: 6;
      stroke-linecap: round;
      stroke-dasharray: 314.159;
      stroke-dashoffset: 0;
      transition: stroke-dashoffset 0.05s linear;
    }
    .timer-number {
      position: absolute;
      font-size: 2.5rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #0f172a;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .heading {
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      color: #0f172a;
      margin-bottom: 0.4rem;
    }
    .subheading {
      font-size: 0.9rem;
      color: #64748b;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    .destination-card {
      width: 100%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.1rem 1.25rem;
      margin-bottom: 1.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      text-align: left;
    }
    .destination-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
    }
    .destination-domain {
      font-size: 1.05rem;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .destination-domain svg {
      color: #f36601;
      flex-shrink: 0;
    }
    .destination-url {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      color: #475569;
      word-break: break-all;
      line-height: 1.45;
      max-height: 3.8em;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .btn-redirect {
      width: 100%;
      padding: 0.9rem 1.5rem;
      background-color: #f36601;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(243, 102, 1, 0.35);
      transition: all 0.18s ease-in-out;
    }
    .btn-redirect:hover {
      background-color: #e05500;
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(243, 102, 1, 0.45);
    }
    .btn-redirect:active {
      transform: translateY(0);
      box-shadow: 0 2px 6px rgba(243, 102, 1, 0.25);
    }
    .btn-arrow {
      transition: transform 0.18s;
    }
    .btn-redirect:hover .btn-arrow {
      transform: translateX(3px);
    }
    .footer-note {
      margin-top: 1.5rem;
      font-size: 0.78rem;
      color: #64748b;
    }
    .short-ref {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: #0f172a;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <span class="brand-title">ClickStream</span>
      <span class="brand-tag">SECURE REDIRECT</span>
    </div>

    <div class="badge-safe">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
      <span>Verified Safe Destination</span>
    </div>

    <div class="timer-container">
      <svg class="timer-svg" viewBox="0 0 112 112">
        <circle class="timer-circle-bg" cx="56" cy="56" r="50" />
        <circle id="timerRing" class="timer-circle-progress" cx="56" cy="56" r="50" />
      </svg>
      <div id="countdownNumber" class="timer-number">${countdownSeconds}</div>
    </div>

    <h1 class="heading">Taking you to your destination</h1>
    <p class="subheading">
      Redirecting in <strong id="countdownText" style="color: #f36601; font-weight: 700;">${countdownSeconds}s</strong>...
    </p>

    <div class="destination-card">
      <span class="destination-label">Destination URL</span>
      <div class="destination-domain">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>${safeDomain}</span>
      </div>
      <div class="destination-url" title="${safeDestinationUrl}">${safeDestinationUrl}</div>
    </div>

    <a id="redirectBtn" href="${safeDestinationUrl}" class="btn-redirect">
      <span>Redirect Now</span>
      <svg class="btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    </a>

    <div class="footer-note">
      Short link: <span class="short-ref">/${safeShortCode}</span> &bull; Verified & protected
    </div>
  </div>

  <script>
    (function() {
      const destination = ${jsonDestination};
      const totalDuration = ${countdownSeconds} * 1000;
      const startTime = Date.now();
      const ring = document.getElementById('timerRing');
      const numberEl = document.getElementById('countdownNumber');
      const textEl = document.getElementById('countdownText');
      const radius = 50;
      const circumference = 2 * Math.PI * radius;

      let redirected = false;
      function doRedirect() {
        if (redirected) return;
        redirected = true;
        window.location.replace(destination);
      }

      document.getElementById('redirectBtn').addEventListener('click', function(e) {
        e.preventDefault();
        doRedirect();
      });

      const interval = setInterval(function() {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, totalDuration - elapsed);
        const progress = Math.min(1, elapsed / totalDuration);

        // Update circular ring offset
        if (ring) {
          const offset = circumference * progress;
          ring.style.strokeDashoffset = offset;
        }

        // Update seconds remaining
        const secondsRemaining = Math.ceil(remaining / 1000);
        if (numberEl) {
          numberEl.textContent = secondsRemaining;
        }
        if (textEl) {
          textEl.textContent = secondsRemaining + 's';
        }

        if (remaining <= 0) {
          clearInterval(interval);
          if (numberEl) numberEl.textContent = '0';
          if (textEl) textEl.textContent = 'now';
          doRedirect();
        }
      }, 50);
    })();
  </script>
</body>
</html>`;
}
