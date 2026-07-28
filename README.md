# HyperSpeed - Next-Gen Speed Test

A modern, high-performance Progressive Web App (PWA) for testing internet speed, designed to be deployed for free on Cloudflare Pages & Workers.

## Local Testing & Development Setup

1. **Serve the Static Files locally**
   You can run any static file server in this directory to load the UI.
   For example, if you have Node.js installed, use `serve`:
   ```bash
   npx serve .
   ```
   Or if you have Python:
   ```bash
   python -m http.server 8000
   ```

2. **Verify PWA Installation**
   - Open your browser to `http://localhost:3000` (or `8000`).
   - Open Developer Tools -> **Application** tab.
   - Under **Manifest**, verify that the app name and icons are loaded properly.
   - Under **Service Workers**, verify that `service-worker.js` is registered and running.

3. **Local API Testing**
   Since the app relies on Cloudflare Workers for the `/api/*` endpoints to conduct the actual speed test, you will need to run the worker locally using Cloudflare's `wrangler` CLI to test the full flow:
   ```bash
   npm install -g wrangler
   wrangler dev
   ```

## Pushing project to GitHub repository

1. **Initialize a Git Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: PWA Setup and core app files"
   ```

2. **Create a GitHub Repository**
   - Navigate to [GitHub.com](https://github.com/new) and create a new blank repository.
   - Do NOT add a README, license, or .gitignore from the GitHub UI.

3. **Push the Local Code**
   Replace `<username>` and `<repo-name>` with your actual details:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<username>/<repo-name>.git
   git push -u origin main
   ```

## Connecting GitHub Repo to Cloudflare Pages & Workers ($0.00 Cost)

This project architecture utilizes Cloudflare's free tier for $0 hosting costs:
- **Cloudflare Pages:** Free unlimited bandwidth for static assets (`index.html`, `manifest.json`, etc.)
- **Cloudflare Workers:** Free 100,000 requests per day for the `/api/*` backend.

### 1. Deploy Frontend to Cloudflare Pages
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Authorize Cloudflare to access your GitHub repositories and select your `HyperSpeed` repository.
4. Configure the Build Settings:
   - **Framework preset:** `None`
   - **Build command:** (Leave blank)
   - **Build output directory:** (Leave blank or set to `/`)
5. Click **Save and Deploy**. Cloudflare will automatically build and assign a `.pages.dev` subdomain to your app.

### 2. Deploy Backend to Cloudflare Workers
1. Back in the **Workers & Pages** menu, click **Create application** -> **Workers** -> **Create Worker**.
2. Name it (e.g., `hyperspeed-worker`) and deploy.
3. Click **Edit code** and paste your API logic for download/upload testing into the editor.
4. Click **Save and deploy**.

### 3. Routing Setup
To ensure the app doesn't encounter CORS issues and the Service Worker correctly bypasses cache for the API, route requests seamlessly using your custom domain.
1. Add a Custom Domain to your Pages project in Cloudflare.
2. In your Cloudflare DNS, ensure traffic routes through Cloudflare (Proxied).
3. Go to **Workers & Pages** -> **Workers Routes** and set a route to map `/api/*` on your domain to the `hyperspeed-worker` you deployed.

Now, all requests to `yourdomain.com/api/*` will hit the Worker, while everything else will hit Pages and be cached by your Service Worker for rapid offline load times!
