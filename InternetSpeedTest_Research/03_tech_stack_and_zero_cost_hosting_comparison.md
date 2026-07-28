# 03. Tech Stack & Zero-Cost Edge Hosting Comparison

## Executive Summary
This document analyzes zero-cost hosting platforms (Netlify vs Cloudflare Pages vs Cloudflare Workers vs Vercel) and provides technical architectural blueprints for hosting a high-bandwidth, ultra-low-latency Internet Speed Test application for zero dollars.

---

## 1. Hosting Platform Evaluation Matrix

| Platform | Free Tier Bandwidth | Edge Locations | Worker/Serverless Limits | Suitability for Speed Test | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cloudflare Pages** | **Unlimited** | 300+ Cities worldwide | N/A (Static Assets) | 🟢 Ideal for Frontend UI | **Selected (Frontend)** |
| **Cloudflare Workers**| **Free Egress Data** | 300+ Cities worldwide | 100,000 requests/day | 🟢 Ideal for Speed Endpoints | **Selected (API/Endpoints)**|
| **Netlify** | 100 GB / month cap | ~30 Edge locations | 125,000 function invocations | 🔴 Will exceed bandwidth fast | Not Recommended |
| **Vercel** | 100 GB / month cap | ~20 Edge locations | 100,000 serverless executions | 🔴 Bandwidth limit risk | Not Recommended |

### Why Cloudflare Pages + Cloudflare Workers Wins Hands-Down:
1. **Zero Bandwidth Bill:** Cloudflare Pages provides **unlimited free egress bandwidth** for static HTML/CSS/JS assets. Cloudflare Workers do not bill for bandwidth bytes transferred on the free tier (only request counts).
2. **300+ Edge Locations:** Cloudflare's network operates in almost every major city globally. When a user runs a ping test, they connect to an edge node milliseconds away, giving true local network speed without cross-country transit routing.
3. **100,000 Free Worker Requests/Day:** A single speed test session requires only ~5 to 10 API requests (ping sweep, warmup, download stream, upload stream). This allows **10,000 to 20,000 full speed tests per day at zero cost**.

---

## 2. Technical Architecture & Worker Endpoint Specification

```
[ User Browser / Mobile App ]
         |
         +-----> (1) Static UI Request -----> [ Cloudflare Pages CDN ] (Unlimited Free Bandwidth)
         |
         +-----> (2) /api/ping -------------> [ Cloudflare Worker Edge Node ] (Instant RTT/Jitter)
         |
         +-----> (3) /api/download ---------> [ Cloudflare Worker ReadableStream ] (No-Store Cache)
         |
         +-----> (4) /api/upload ------------> [ Cloudflare Worker Request Void ] (Saturates Upload)
```

### Worker API Specifications

#### Endpoint 1: `/api/ping`
* **Method:** `GET` or `HEAD`
* **Response:** `200 OK` with payload `{"status":"pong", "timestamp": 1772152800}`
* **Headers:** 
  * `Cache-Control: no-store, no-cache, must-revalidate`
  * `Access-Control-Allow-Origin: *`

#### Endpoint 2: `/api/download`
* **Method:** `GET`
* **Query Parameters:** `?size=25000000` (e.g., 25MB)
* **Mechanism:** Uses Cloudflare Worker `ReadableStream` to generate dummy byte chunks (e.g., `new Uint8Array(chunkSize)`) on the fly. Does not allocate memory overhead.
* **Headers:** 
  * `Content-Type: application/octet-stream`
  * `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`

#### Endpoint 3: `/api/upload`
* **Method:** `POST`
* **Mechanism:** Worker accepts incoming HTTP POST body stream, reads the stream into void (`request.body.cancel()`), and returns total bytes received.
* **Headers:** `Access-Control-Allow-Origin: *`

---

## 3. Frontend Tech Stack Recommendation

* **Core Framework:** Vanilla HTML5 / Modern ES6 JavaScript or Lightweight Vite + React/Svelte.
* **Styling:** Modular CSS3 with Flexbox, CSS Grid, and CSS Variables (No heavy Tailwind runtime overhead needed for maximum speed).
* **Speed Gauge:** Custom HTML5 Canvas / SVG rendering engine.
* **Stream Handler:** Fetch API with `ReadableStream` reader for real-time progress events.
