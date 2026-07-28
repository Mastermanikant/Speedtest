# 04. Backend Telemetry & Anonymous Data Strategy

## Executive Summary
This document specifies how to collect, process, and store anonymous speed test telemetry to build valuable ISP benchmarks, regional speed reports, and user history without compromising user privacy or incurring database hosting costs.

---

## 1. Zero-Cost Storage Architecture

```
[ User Browser ]
   │
   ├──────► IndexedDB (Client-Side Storage - 100% Free, Unlimited History)
   │
   └──────► Cloudflare Worker (In-Memory IP Anonymization)
               │
               ▼
   [ Cloudflare D1 (SQLite Edge DB) ] OR [ Supabase Postgres (Free Tier) ]
```

### A. Client-Side History (IndexedDB)
* **Zero Backend Cost:** Store every test result directly inside the user's browser using `IndexedDB`.
* **Features:** Allows users to view their complete speed timeline, compare day/night performance, and export history to CSV.
* **Privacy First:** Data stays on the device unless explicitly shared by the user.

### B. Global ISP Aggregated Telemetry (Cloudflare D1)
* **Database Choice:** **Cloudflare D1** (SQLite at the edge) or **Supabase** (Postgres Free Tier).
* **Free Tier Allowance:** 
  * Cloudflare D1: 5 million read rows/day, 100k write rows/day for FREE.
  * Supabase: 500 MB database, unlimited reads for FREE.
* **Payload Structure (Non-PII Telemetry):**
  ```json
  {
    "id": "evt_98f2a1b",
    "timestamp": 1772152800,
    "isp": "Airtel Broadband",
    "asn": "AS9498",
    "country": "IN",
    "city": "New Delhi",
    "connection_type": "wifi",
    "download_mbps": 142.50,
    "upload_mbps": 95.10,
    "idle_ping_ms": 14.2,
    "jitter_ms": 1.8,
    "bufferbloat_grade": "A+",
    "device_category": "mobile"
  }
  ```

---

## 2. Privacy Compliance & IP Anonymization (GDPR / CCPA)

1. **Strict Zero IP Storage:** The user's public IP address is extracted in-memory inside the Cloudflare Worker ONLY to perform an IP-to-ASN / IP-to-City lookup. The IP address is immediately discarded and NEVER saved to the database.
2. **No Tracking Cookies:** No persistent cross-site cookies or device fingerprinting.
3. **Opt-Out Mechanism:** Clear toggle for users who do not wish to contribute anonymized benchmarks to global reports.

---

## 3. Data Monetization & Future Value

By accumulating anonymized global ISP speed data over time:
* **Public ISP Benchmarks:** Publish monthly reports like "Best Broadband Providers in [City]" to drive organic SEO traffic.
* **Public API:** Provide open-source datasets on GitHub/R2 for researchers and tech journalists.
