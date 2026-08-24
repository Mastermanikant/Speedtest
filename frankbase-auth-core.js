/**
 * 🌐 FrankBase Universal Authentication & SSO Client Core SDK
 * Ecosystem: FrankBase Global Digital Network
 * Google OAuth Client ID: 1086435746053-viv2odbldg31n72j6o3k4nhi32vdl8l4.apps.googleusercontent.com
 * Supports: Google One-Tap, 1-Click OAuth, Wildcard Subdomain SSO (.frankbase.com), D1 Edge Sync
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrankBaseAuth = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GOOGLE_CLIENT_ID = '1086435746053-viv2odbldg31n72j6o3k4nhi32vdl8l4.apps.googleusercontent.com';
  const COOKIE_NAME = 'fb_sso_session';
  const STORAGE_KEY = 'frankbase_user';

  // Helper: Cookie Management with Wildcard Subdomain Support (.frankbase.com)
  function setSSOCookie(name, value, days = 30) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + d.toUTCString();
    const hostname = window.location.hostname;
    let domainStr = '';
    
    if (hostname.endsWith('frankbase.com')) {
      domainStr = '; domain=.frankbase.com';
    } else if (hostname.endsWith('mastermanikant.com')) {
      domainStr = '; domain=.mastermanikant.com';
    } else if (hostname.endsWith('englishvidya.com')) {
      domainStr = '; domain=.englishvidya.com';
    }

    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/${domainStr}; SameSite=Lax; Secure`;
  }

  function getSSOCookie(name) {
    const cname = name + '=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(cname) === 0) {
        return c.substring(cname.length, c.length);
      }
    }
    return '';
  }

  function deleteSSOCookie(name) {
    const hostname = window.location.hostname;
    let domainStr = '';
    if (hostname.endsWith('frankbase.com')) domainStr = '; domain=.frankbase.com';
    else if (hostname.endsWith('mastermanikant.com')) domainStr = '; domain=.mastermanikant.com';
    else if (hostname.endsWith('englishvidya.com')) domainStr = '; domain=.englishvidya.com';

    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domainStr}; SameSite=Lax; Secure`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure`;
  }

  // Helper: Decode JWT Token safely
  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.warn('[FrankBaseAuth] JWT Parse error:', e);
      return null;
    }
  }

  // Device Fingerprint for Security and 3-Device Sync
  function getDeviceFingerprint() {
    let fp = localStorage.getItem('fb_device_fp');
    if (!fp) {
      const raw = [
        navigator.userAgent,
        screen.width + 'x' + screen.height,
        navigator.language,
        new Date().getTimezoneOffset()
      ].join('||');
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = (hash << 5) - hash + raw.charCodeAt(i);
        hash |= 0;
      }
      fp = 'fp_' + Math.abs(hash).toString(36) + '_' + Math.random().toString(36).substr(2, 6);
      localStorage.setItem('fb_device_fp', fp);
    }
    return fp;
  }

  class FrankBaseAuthEngine {
    constructor() {
      this.user = null;
      this.listeners = [];
      this.isInitialized = false;
    }

    init(options = {}) {
      if (this.isInitialized) return;
      this.isInitialized = true;
      this.options = options;

      // 1. Check existing cookie or localStorage session
      this.restoreSession();

      // 2. Load Google Identity Services SDK if not present
      this.loadGoogleSDK();

      // 3. Auto-render UI elements if targets exist
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.autoBindUI());
      } else {
        this.autoBindUI();
      }
    }

    restoreSession() {
      // First check SSO Cookie for cross-subdomain synchronization
      const cookieData = getSSOCookie(COOKIE_NAME);
      if (cookieData) {
        try {
          this.user = JSON.parse(cookieData);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.user));
          this.notifyListeners();
          return;
        } catch (e) {}
      }

      // Fallback check localStorage
      const localData = localStorage.getItem(STORAGE_KEY);
      if (localData) {
        try {
          this.user = JSON.parse(localData);
          // Set cookie for other subdomains if not present
          setSSOCookie(COOKIE_NAME, JSON.stringify(this.user));
          this.notifyListeners();
        } catch (e) {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }

    loadGoogleSDK() {
      if (document.getElementById('google-gsi-client')) return;
      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => this.initGoogleOneTap();
      document.head.appendChild(script);
    }

    initGoogleOneTap() {
      if (!window.google?.accounts?.id) return;

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (res) => this.handleGoogleCredential(res),
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Prompt Google One Tap on non-intrusive pages if user is not logged in
        if (!this.user && !this.options.disableOneTap) {
          window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              // Gracefully handle dismissed prompt
            }
          });
        }
      } catch (err) {
        console.warn('[FrankBaseAuth] Google GSI Init error:', err);
      }
    }

    async handleGoogleCredential(response) {
      if (!response.credential) return;

      const payload = parseJwt(response.credential);
      if (!payload || !payload.email) return;

      const userData = {
        accountId: payload.sub ? `FB-${payload.sub.substr(-6)}` : `FB-${Date.now().toString().substr(-6)}`,
        email: payload.email.toLowerCase(),
        name: payload.name || payload.email.split('@')[0],
        avatar: payload.picture || '',
        sub: payload.sub,
        authProvider: 'google',
        lastLogin: Date.now()
      };

      // 1. Sync with Cloudflare D1 Backend API if available
      try {
        const apiEndpoint = this.options.apiEndpoint || '/api/auth/google';
        const res = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credential: response.credential,
            device_fingerprint: getDeviceFingerprint(),
            device_name: navigator.userAgent
          })
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData.user) {
            userData.accountId = resData.user.id || resData.user.account_id || userData.accountId;
            userData.tier = resData.user.tier || 'FREE';
          }
        }
      } catch (err) {
        console.log('[FrankBaseAuth] Edge API offline or local fallback enabled');
      }

      // 2. Persist locally and across all subdomains
      this.user = userData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      setSSOCookie(COOKIE_NAME, JSON.stringify(userData));

      this.notifyListeners();
      this.closeModal();

      if (this.options.onLogin) {
        this.options.onLogin(userData);
      }
    }

    getUser() {
      return this.user;
    }

    isLoggedIn() {
      return !!this.user;
    }

    onAuthStateChanged(callback) {
      this.listeners.push(callback);
      if (this.user !== null) {
        callback(this.user);
      }
      return () => {
        this.listeners = this.listeners.filter((cb) => cb !== callback);
      };
    }

    notifyListeners() {
      this.listeners.forEach((cb) => {
        try {
          cb(this.user);
        } catch (e) {
          console.error(e);
        }
      });
      this.updateUIAfterStateChange();
    }

    logout() {
      this.user = null;
      localStorage.removeItem(STORAGE_KEY);
      deleteSSOCookie(COOKIE_NAME);
      this.notifyListeners();
      if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect();
      }
      if (this.options.onLogout) {
        this.options.onLogout();
      }
    }

    // Modal and UI Renderer
    openModal() {
      let modal = document.getElementById('fb-universal-auth-modal');
      if (!modal) {
        modal = this.createModalElement();
        document.body.appendChild(modal);
      }
      modal.classList.add('active');
      modal.style.display = 'flex';

      // Render Google Sign-In Button inside Modal
      setTimeout(() => {
        const btnSlot = document.getElementById('fb-gsi-modal-button-slot');
        if (btnSlot && window.google?.accounts?.id) {
          btnSlot.innerHTML = '';
          window.google.accounts.id.renderButton(btnSlot, {
            theme: 'outline',
            size: 'large',
            width: 300,
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'left'
          });
        }
      }, 50);
    }

    closeModal() {
      const modal = document.getElementById('fb-universal-auth-modal');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    }

    createModalElement() {
      const modal = document.createElement('div');
      modal.id = 'fb-universal-auth-modal';
      modal.className = 'fb-auth-modal-backdrop';
      modal.innerHTML = `
        <div class="fb-auth-modal-card" role="dialog" aria-modal="true">
          <button class="fb-auth-close-btn" onclick="FrankBaseAuth.closeModal()" aria-label="Close">&times;</button>
          <div class="fb-auth-brand-badge">🌐</div>
          <h3 class="fb-auth-modal-title">Sign in to FrankBase</h3>
          <p class="fb-auth-modal-sub">
            One universal account across all FrankBase Ecosystem websites, Cloud Books, Clipboard sync, and Tools. Zero passwords required.
          </p>
          <div id="fb-gsi-modal-button-slot" class="fb-gsi-slot"></div>
          <div class="fb-auth-modal-footer">
            <span>🔒 100% Privacy • End-to-End Edge Security</span>
          </div>
        </div>
      `;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
      return modal;
    }

    autoBindUI() {
      // Find all header containers marked for auth
      const containers = document.querySelectorAll('#fb-auth-header, [data-fb-auth]');
      containers.forEach((el) => this.renderHeaderWidget(el));
    }

    updateUIAfterStateChange() {
      const containers = document.querySelectorAll('#fb-auth-header, [data-fb-auth]');
      containers.forEach((el) => this.renderHeaderWidget(el));
    }

    renderHeaderWidget(container) {
      if (!container) return;
      if (this.user) {
        container.innerHTML = `
          <div class="fb-user-badge-menu" style="display:inline-flex; align-items:center; gap:0.5rem;">
            <div class="fb-user-avatar" title="${this.user.name} (${this.user.email})" style="width:34px; height:34px; border-radius:50%; background:var(--brand-primary, #4f46e5); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:0.85rem; overflow:hidden; border:2px solid var(--border-color, #e2e8f0); cursor:pointer;" onclick="FrankBaseAuth.showUserDropdown(this)">
              ${this.user.avatar ? `<img src="${this.user.avatar}" alt="${this.user.name}" style="width:100%; height:100%; object-fit:cover;" />` : this.user.name.charAt(0).toUpperCase()}
            </div>
            <button class="fb-auth-logout-btn" onclick="FrankBaseAuth.logout()" title="Log Out" style="background:transparent; border:none; cursor:pointer; color:var(--text-muted, #64748b); font-size:0.8rem; padding:4px 8px; border-radius:6px;">
              🚪
            </button>
          </div>
        `;
      } else {
        container.innerHTML = `
          <button class="fb-auth-btn-signin" onclick="FrankBaseAuth.openModal()" style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.45rem 0.9rem; border-radius:9999px; border:1px solid var(--border-color, #e2e8f0); background:var(--card-bg, #ffffff); color:var(--text-primary, #0f172a); font-size:0.85rem; font-weight:600; cursor:pointer; transition:all 0.2s;">
            <span>👤</span>
            <span>Sign In</span>
          </button>
        `;
      }
    }
  }

  const instance = new FrankBaseAuthEngine();
  return instance;
});
