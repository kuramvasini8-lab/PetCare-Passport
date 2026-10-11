/**
 * PetCare Passport - Frontend Application Controller
 * Calm Golden Fur & Natural Cream Design System
 */

// Application State
const state = {
  currentUser: null,
  token: localStorage.getItem('petcare_token') || null,
  currentRoute: '#dashboard',
  pets: [],
  healthRecords: [],
  reports: [],
  notifications: [],
  selectedPetForAi: null,
  aiChatHistory: [],
  adminMode: false,
};

// Lucide icon helper
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-circle';
  if (type === 'warning') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width:18px;height:18px;flex-shrink:0;"></i>
    <div style="flex:1;">${escapeHtml(message)}</div>
  `;
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// API Fetch wrapper with Auth header & Error handling
async function api(endpoint, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const res = await fetch(endpoint, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
        // Token expired or invalid
        signOut();
      }
      if (res.status === 403 && data.suspended) {
        showToast(data.message || 'Account suspended.', 'error');
        signOut();
      }
      const err = new Error(data.message || `Request failed with status ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    throw err;
  }
}

// ==========================================================================
// ROUTER & NAVIGATION
// ==========================================================================

const router = {
  async navigate(hash) {
    if (!hash) hash = '#dashboard';
    if (hash.startsWith('/emergency/')) {
      hash = '#' + hash.slice(1);
    }
    window.location.hash = hash;
    state.currentRoute = hash;

    // Check if public emergency route
    if (hash.startsWith('#emergency/')) {
      const publicCode = hash.split('/')[1];
      await renderEmergencyPortal(publicCode);
      updateNavHighlight(null);
      return;
    }

    // Auth gate for non-emergency pages
    if (!state.currentUser && !state.token) {
      renderWelcomeLanding();
      updateNavHighlight(null);
      return;
    }

    // Verify session if token exists but user not loaded
    if (!state.currentUser && state.token) {
      const ok = await checkCurrentUser();
      if (!ok) {
        renderWelcomeLanding();
        updateNavHighlight(null);
        return;
      }
    }

    // Admin routes protection
    if (hash.startsWith('#admin-')) {
      if (state.currentUser.role !== 'ADMIN') {
        showToast('Administrative privileges required.', 'error');
        router.navigate('#dashboard');
        return;
      }
      state.adminMode = true;
      syncNavUi();
      updateNavHighlight(hash);

      if (hash === '#admin-overview') await renderAdminOverview();
      else if (hash === '#admin-users') await renderAdminUsers();
      else if (hash === '#admin-reports') await renderAdminReports();
      else if (hash === '#admin-pets') await renderAdminPets();
      else if (hash === '#admin-analytics') await renderAdminAnalytics();
      else if (hash === '#admin-audit') await renderAdminAudit();
      return;
    }

    // Normal Owner routes
    state.adminMode = false;
    syncNavUi();
    updateNavHighlight(hash);

    if (hash === '#dashboard') await renderDashboard();
    else if (hash === '#pets') await renderPets();
    else if (hash === '#health') await renderHealth();
    else if (hash === '#lost-center') await renderLostCenter();
    else if (hash === '#ai-assistant') await renderAiAssistant();
    else await renderDashboard();
  },
};

function updateNavHighlight(activeHash) {
  document.querySelectorAll('.nav-item').forEach((item) => {
    if (activeHash && item.getAttribute('data-route') === activeHash) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function syncNavUi() {
  const ownerNav = document.getElementById('ownerNavLinks');
  const adminNav = document.getElementById('adminNavLinks');
  const btnAdminSwitch = document.getElementById('btnAdminSwitch');
  const adminSwitchText = document.getElementById('adminSwitchText');
  const brandSubtitle = document.getElementById('brandSubtitle');
  const authContainer = document.getElementById('authProfileContainer');

  if (!state.currentUser) {
    if (ownerNav) ownerNav.style.display = 'none';
    if (adminNav) adminNav.style.display = 'none';
    if (btnAdminSwitch) btnAdminSwitch.style.display = 'none';
    if (authContainer) {
      authContainer.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openAuthModal()">Sign In</button>`;
    }
    return;
  }

  // User is authenticated
  if (state.currentUser.role === 'ADMIN') {
    if (btnAdminSwitch) {
      btnAdminSwitch.style.display = 'inline-flex';
      adminSwitchText.innerText = state.adminMode ? 'Owner Dashboard' : 'Admin Portal';
    }
  } else {
    if (btnAdminSwitch) btnAdminSwitch.style.display = 'none';
  }

  if (state.adminMode && state.currentUser.role === 'ADMIN') {
    if (ownerNav) ownerNav.style.display = 'none';
    if (adminNav) adminNav.style.display = 'flex';
    if (brandSubtitle) brandSubtitle.innerText = 'Platform Oversight & Moderation';
  } else {
    if (ownerNav) ownerNav.style.display = 'flex';
    if (adminNav) adminNav.style.display = 'none';
    if (brandSubtitle) brandSubtitle.innerText = 'Digital Pet Health & Emergency ID';
  }

  if (authContainer) {
    authContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">${escapeHtml(state.currentUser.name)}</span>
        <button class="btn btn-secondary btn-sm" onclick="signOut()" title="Sign Out">
          <i data-lucide="log-out" style="width:14px;height:14px;"></i>
        </button>
      </div>
    `;
  }

  refreshIcons();
}

function toggleAdminOwnerMode() {
  if (state.adminMode) {
    state.adminMode = false;
    router.navigate('#dashboard');
  } else {
    state.adminMode = true;
    router.navigate('#admin-overview');
  }
}

// ==========================================================================
// AUTHENTICATION CONTROLLER
// ==========================================================================

async function checkCurrentUser() {
  if (!state.token) return false;
  try {
    const data = await api('/api/auth/me');
    if (data.success && data.user) {
      state.currentUser = data.user;
      syncNavUi();
      loadNotifications();
      startNotificationPolling();
      return true;
    }
    return false;
  } catch (err) {
    state.token = null;
    state.currentUser = null;
    localStorage.removeItem('petcare_token');
    return false;
  }
}

function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  openModal('modalAuth');
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('authTabSignIn').style.background = isLogin ? 'var(--gold-primary)' : 'transparent';
  document.getElementById('authTabSignIn').style.color = isLogin ? '#2A2416' : 'var(--text-main)';
  document.getElementById('authTabRegister').style.background = !isLogin ? 'var(--gold-primary)' : 'transparent';
  document.getElementById('authTabRegister').style.color = !isLogin ? '#2A2416' : 'var(--text-main)';

  document.getElementById('groupAuthName').style.display = isLogin ? 'none' : 'block';
  document.getElementById('groupAuthPhone').style.display = isLogin ? 'none' : 'block';
  document.getElementById('authModalTitle').innerText = isLogin ? 'Sign In to PetCare Passport' : 'Create Pet Owner Account';
  document.getElementById('btnAuthSubmit').innerHTML = isLogin
    ? `<i data-lucide="log-in" style="width:16px;height:16px;"></i><span>Sign In</span>`
    : `<i data-lucide="user-plus" style="width:16px;height:16px;"></i><span>Create Account</span>`;
  refreshIcons();
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const isLogin = document.getElementById('groupAuthName').style.display === 'none';
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value.trim();
  const phone = document.getElementById('authPhone').value.trim();
  const submitBtn = document.getElementById('btnAuthSubmit');

  submitBtn.disabled = true;

  try {
    let endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    let body = isLogin ? { email, password } : { name, email, password, phone };

    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Handle Registration OTP flow: Requires email verification
    if (data.requiresVerification) {
      closeModal('modalAuth');
      openOtpModal(data.email || email);
      showToast(data.message || 'Please verify your email address to continue.', 'info');
      return;
    }

    if (data.success && data.token) {
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem('petcare_token', data.token);

      closeModal('modalAuth');
      showToast(data.message || 'Authentication successful!', 'success');
      syncNavUi();
      loadNotifications();
      startNotificationPolling();

      if (state.currentUser.role === 'ADMIN') {
        router.navigate('#admin-overview');
      } else {
        router.navigate('#dashboard');
      }
    }
  } catch (err) {
    // Handle unverified accounts attempting to log in
    if (err.data && err.data.requiresVerification) {
      closeModal('modalAuth');
      openOtpModal(err.data.email || email);
      showToast(err.message || 'Please verify your email address.', 'warning');
      return;
    }
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

// ==========================================================================
// OTP EMAIL VERIFICATION CONTROLLER
// ==========================================================================

const otpState = {
  email: '',
  expiryTimer: null,
  cooldownTimer: null,
  expiresAt: null,
  cooldownEndsAt: null,
  isVerifying: false,
};

function openOtpModal(email) {
  if (!email) return;
  otpState.email = email.trim();

  const targetEmailEl = document.getElementById('otpTargetEmail');
  if (targetEmailEl) targetEmailEl.innerText = otpState.email;

  // Clear inputs & reset classes
  for (let i = 0; i < 6; i++) {
    const input = document.getElementById(`otpDigit${i}`);
    if (input) {
      input.value = '';
      input.classList.remove('filled', 'error');
    }
  }

  hideOtpAlert();
  startOtpExpiryTimer(300); // 5 minutes
  startOtpCooldownTimer(60); // 60 seconds

  openModal('modalOtpVerify');

  setTimeout(() => {
    const first = document.getElementById('otpDigit0');
    if (first) first.focus();
  }, 150);
}

function getEnteredOtp() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById(`otpDigit${i}`);
    if (el) code += el.value.trim();
  }
  return code;
}

function startOtpExpiryTimer(seconds = 300) {
  if (otpState.expiryTimer) clearInterval(otpState.expiryTimer);

  otpState.expiresAt = Date.now() + seconds * 1000;
  const timerBadge = document.getElementById('otpTimerBadge');
  const countdownEl = document.getElementById('otpExpiryCountdown');

  function update() {
    const remainingMs = otpState.expiresAt - Date.now();
    if (remainingMs <= 0) {
      clearInterval(otpState.expiryTimer);
      otpState.expiryTimer = null;
      if (countdownEl) countdownEl.innerText = '00:00';
      if (timerBadge) timerBadge.classList.add('urgent');
      showOtpAlert('Your verification code has expired. Please click "Resend Code" to receive a new one.', 'error');
      return;
    }

    const totalSec = Math.floor(remainingMs / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');

    if (countdownEl) countdownEl.innerText = `${m}:${s}`;
    if (timerBadge) {
      if (totalSec <= 60) {
        timerBadge.classList.add('urgent');
      } else {
        timerBadge.classList.remove('urgent');
      }
    }
  }

  update();
  otpState.expiryTimer = setInterval(update, 1000);
}

function startOtpCooldownTimer(seconds = 60) {
  if (otpState.cooldownTimer) clearInterval(otpState.cooldownTimer);

  otpState.cooldownEndsAt = Date.now() + seconds * 1000;
  const resendBtn = document.getElementById('btnResendOtp');
  const resendText = document.getElementById('btnResendOtpText');
  const resendIcon = document.getElementById('iconResendOtp');

  if (resendBtn) resendBtn.disabled = true;

  function update() {
    const remainingMs = otpState.cooldownEndsAt - Date.now();
    if (remainingMs <= 0) {
      clearInterval(otpState.cooldownTimer);
      otpState.cooldownTimer = null;
      if (resendBtn) resendBtn.disabled = false;
      if (resendText) resendText.innerText = 'Resend Code';
      if (resendIcon) resendIcon.classList.remove('lucide-spin');
      return;
    }

    const sec = Math.ceil(remainingMs / 1000);
    if (resendText) resendText.innerText = `Resend in ${sec}s`;
  }

  update();
  otpState.cooldownTimer = setInterval(update, 1000);
}

function showOtpAlert(message, type = 'error') {
  const box = document.getElementById('otpAlertBox');
  if (!box) return;

  box.className = `otp-alert ${type}`;
  let icon = 'alert-circle';
  if (type === 'success') icon = 'check-circle-2';
  if (type === 'info') icon = 'info';

  box.innerHTML = `
    <i data-lucide="${icon}" style="width:16px;height:16px;flex-shrink:0;margin-top:2px;"></i>
    <div>${escapeHtml(message)}</div>
  `;
  box.style.display = 'flex';
  refreshIcons();
}

function hideOtpAlert() {
  const box = document.getElementById('otpAlertBox');
  if (box) {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

async function handleOtpSubmit(e) {
  if (e) e.preventDefault();
  if (otpState.isVerifying) return;

  const otp = getEnteredOtp();
  if (!/^\d{6}$/.test(otp)) {
    showOtpAlert('Please enter the complete 6-digit code sent to your email.', 'error');
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById(`otpDigit${i}`);
      if (el && !el.value) {
        el.focus();
        break;
      }
    }
    return;
  }

  const verifyBtn = document.getElementById('btnVerifyOtp');
  otpState.isVerifying = true;
  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = `
      <i data-lucide="loader-2" style="width:18px;height:18px;"></i>
      <span>Verifying...</span>
    `;
    refreshIcons();
  }

  try {
    const data = await api('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: otpState.email,
        otp,
      }),
    });

    if (data.success && data.token) {
      showOtpAlert(data.message || 'Email verified successfully!', 'success');

      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem('petcare_token', data.token);

      if (otpState.expiryTimer) clearInterval(otpState.expiryTimer);
      if (otpState.cooldownTimer) clearInterval(otpState.cooldownTimer);

      setTimeout(() => {
        closeModal('modalOtpVerify');
        showToast(data.message || 'Email verified! Welcome to PetCare Passport.', 'success');
        syncNavUi();
        loadNotifications();
        startNotificationPolling();

        if (state.currentUser.role === 'ADMIN') {
          router.navigate('#admin-overview');
        } else {
          router.navigate('#dashboard');
        }
      }, 700);
    }
  } catch (err) {
    showOtpAlert(err.message, 'error');

    // Shake error animation on inputs
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById(`otpDigit${i}`);
      if (el) {
        el.classList.add('error');
        setTimeout(() => el.classList.remove('error'), 600);
      }
    }

    if (err.data && err.data.maxAttemptsExceeded) {
      if (verifyBtn) verifyBtn.disabled = true;
    }
  } finally {
    otpState.isVerifying = false;
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = `
        <i data-lucide="shield-check" style="width:18px;height:18px;"></i>
        <span>Verify &amp; Continue</span>
      `;
      refreshIcons();
    }
  }
}

async function handleResendOtp() {
  if (!otpState.email) return;

  const resendBtn = document.getElementById('btnResendOtp');
  const resendText = document.getElementById('btnResendOtpText');

  if (resendBtn) resendBtn.disabled = true;
  if (resendText) resendText.innerText = 'Sending...';

  try {
    const data = await api('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email: otpState.email }),
    });

    showOtpAlert(data.message || 'A new 6-digit code has been sent to your email.', 'info');

    // Reset inputs
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById(`otpDigit${i}`);
      if (el) {
        el.value = '';
        el.classList.remove('filled', 'error');
      }
    }
    const first = document.getElementById('otpDigit0');
    if (first) first.focus();

    const verifyBtn = document.getElementById('btnVerifyOtp');
    if (verifyBtn) verifyBtn.disabled = false;

    // Reset 5m expiry timer and 60s cooldown
    startOtpExpiryTimer(300);
    startOtpCooldownTimer(data.cooldownSeconds || 60);
    showToast('A fresh verification code was sent to your email.', 'info');
  } catch (err) {
    showOtpAlert(err.message, 'error');
    if (err.data && err.data.retryAfterSeconds) {
      startOtpCooldownTimer(err.data.retryAfterSeconds);
    } else {
      if (resendBtn) resendBtn.disabled = false;
      if (resendText) resendText.innerText = 'Resend Code';
    }
  }
}

function setupOtpDigitInputs() {
  for (let i = 0; i < 6; i++) {
    const input = document.getElementById(`otpDigit${i}`);
    if (!input) continue;

    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val ? val[val.length - 1] : '';

      if (e.target.value) {
        e.target.classList.add('filled');
        if (i < 5) {
          const next = document.getElementById(`otpDigit${i + 1}`);
          if (next) next.focus();
        } else {
          // If all 6 digits entered, auto-verify
          const fullOtp = getEnteredOtp();
          if (fullOtp.length === 6) {
            handleOtpSubmit();
          }
        }
      } else {
        e.target.classList.remove('filled');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!e.target.value && i > 0) {
          const prev = document.getElementById(`otpDigit${i - 1}`);
          if (prev) {
            prev.value = '';
            prev.classList.remove('filled');
            prev.focus();
          }
        } else {
          e.target.classList.remove('filled');
        }
      } else if (e.key === 'ArrowLeft' && i > 0) {
        const prev = document.getElementById(`otpDigit${i - 1}`);
        if (prev) prev.focus();
      } else if (e.key === 'ArrowRight' && i < 5) {
        const next = document.getElementById(`otpDigit${i + 1}`);
        if (next) next.focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteText = (e.clipboardData || window.clipboardData).getData('text') || '';
      const digits = pasteText.replace(/[^0-9]/g, '').slice(0, 6);
      if (!digits) return;

      for (let j = 0; j < 6; j++) {
        const target = document.getElementById(`otpDigit${j}`);
        if (target) {
          target.value = digits[j] || '';
          if (digits[j]) {
            target.classList.add('filled');
          } else {
            target.classList.remove('filled');
          }
        }
      }

      if (digits.length === 6) {
        handleOtpSubmit();
      } else {
        const nextIdx = Math.min(digits.length, 5);
        const nextEl = document.getElementById(`otpDigit${nextIdx}`);
        if (nextEl) nextEl.focus();
      }
    });
  }
}


function quickFillAdmin() {
  switchAuthTab('login');
  document.getElementById('authEmail').value = 'admin@petpassport.internal';
  document.getElementById('authPassword').value = 'AdminSecurePass2026!';
}

function quickRegisterDemoOwner() {
  switchAuthTab('register');
  const rand = Math.floor(Math.random() * 900) + 100;
  document.getElementById('authName').value = `Jordan Cooper ${rand}`;
  document.getElementById('authEmail').value = `owner${rand}@petcare.demo`;
  document.getElementById('authPassword').value = 'OwnerPass2026!';
  document.getElementById('authPhone').value = '+1 (555) 019-2834';
}

function signOut() {
  stopNotificationPolling();
  state.token = null;
  state.currentUser = null;
  state.adminMode = false;
  localStorage.removeItem('petcare_token');
  syncNavUi();
  showToast('You have been signed out.', 'info');
  router.navigate('#dashboard');
}

// ==========================================================================
// WELCOME LANDING VIEW
// ==========================================================================

function renderWelcomeLanding() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `
    <div style="max-width: 960px; margin: 40px auto; text-align: center;">
      <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px; background:var(--gold-light); border:1px solid var(--gold-highlight); border-radius:var(--radius-pill); font-size:0.82rem; font-weight:600; color:var(--gold-dark); margin-bottom:20px;">
        <i data-lucide="sparkles" style="width:16px;height:16px;"></i>
        <span>AI-Powered Pet Healthcare &amp; Emergency Recovery</span>
      </div>

      <h1 style="font-size:2.8rem; font-weight:800; color:var(--text-main); letter-spacing:-0.03em; line-height:1.2; margin-bottom:16px;">
        A Calm, Beautiful Digital Passport<br>For Every Pet You Love.
      </h1>

      <p style="font-size:1.1rem; color:var(--text-secondary); max-width:680px; margin:0 auto 32px; line-height:1.6;">
        Manage health records, smart vaccination due-dates, and emergency recovery from one serene place. When an emergency strikes, scan the high-contrast QR passport to reconnect finders with owners instantly.
      </p>

      <div style="display:flex; justify-content:center; gap:14px; flex-wrap:wrap; margin-bottom:48px;">
        <button class="btn btn-primary btn-lg" onclick="openAuthModal('register')">
          <i data-lucide="paw-print" style="width:20px;height:20px;"></i>
          <span>Get Started Free</span>
        </button>
        <button class="btn btn-secondary btn-lg" onclick="openAuthModal('login')">
          <i data-lucide="log-in" style="width:20px;height:20px;"></i>
          <span>Sign In to Dashboard</span>
        </button>
      </div>

      <!-- Feature preview grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; text-align:left;">
        <div class="card">
          <div class="stat-icon gold" style="margin-bottom:16px;">
            <i data-lucide="qr-code"></i>
          </div>
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:8px;">Instant QR Emergency ID</h3>
          <p style="color:var(--text-secondary); font-size:0.9rem;">
            Generate printable, high-contrast digital passports. Strictly filter which medical alerts and contacts finders can view.
          </p>
        </div>

        <div class="card">
          <div class="stat-icon sage" style="margin-bottom:16px;">
            <i data-lucide="activity"></i>
          </div>
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:8px;">Smart Vaccination Tracker</h3>
          <p style="color:var(--text-secondary); font-size:0.9rem;">
            Calculates overdue and upcoming vaccines automatically from clinical due-dates. Never miss a booster.
          </p>
        </div>

        <div class="card">
          <div class="stat-icon info" style="margin-bottom:16px;">
            <i data-lucide="sparkles"></i>
          </div>
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:8px;">AI Pet Care &amp; Vet Notes</h3>
          <p style="color:var(--text-secondary); font-size:0.9rem;">
            Powered by Google Gemini. Translate complex veterinary clinical notes into plain language with safety disclaimers.
          </p>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

// ==========================================================================
// OWNER DASHBOARD VIEW
// ==========================================================================

async function renderDashboard() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i><p style="margin-top:12px;color:var(--text-secondary);">Loading your pet dashboard...</p></div>`;
  refreshIcons();

  try {
    const statsData = await api('/api/pets/dashboard-stats');
    const petsData = await api('/api/pets');
    const stats = statsData.stats || {};
    state.pets = petsData.pets || [];

    const ownerName = state.currentUser ? state.currentUser.name.split(' ')[0] : 'Owner';

    root.innerHTML = `
      <!-- Welcome header -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Welcome back, ${escapeHtml(ownerName)}</h2>
          <p>Here is the health status, emergency readiness, and active care schedule for your companions.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="seedDemoData()">
            <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--gold-dark);"></i>
            <span>Load Demo Pets</span>
          </button>
          <button class="btn btn-primary" onclick="openAddPetModal()">
            <i data-lucide="plus" style="width:16px;height:16px;"></i>
            <span>Add Pet</span>
          </button>
        </div>
      </div>

      <!-- Quick Actions Toolbar -->
      <div class="quick-actions-bar">
        <div class="quick-actions-title">
          <i data-lucide="zap" style="width:18px;height:18px;color:var(--gold-dark);"></i>
          <span>Quick Actions:</span>
        </div>
        <div class="quick-actions-group">
          <button class="btn btn-secondary btn-sm" onclick="openAddPetModal()">
            <i data-lucide="plus" style="width:14px;height:14px;"></i> Add Pet
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openAddHealthModal()">
            <i data-lucide="activity" style="width:14px;height:14px;"></i> Add Health Record
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openAddVaccineModal()">
            <i data-lucide="shield-plus" style="width:14px;height:14px;"></i> Add Vaccination
          </button>
          <button class="btn btn-secondary btn-sm" onclick="router.navigate('#ai-assistant')">
            <i data-lucide="sparkles" style="width:14px;height:14px;"></i> Ask AI Assistant
          </button>
          <button class="btn btn-secondary btn-sm" onclick="router.navigate('#lost-center')">
            <i data-lucide="map-pin" style="width:14px;height:14px;color:var(--status-error);"></i> Lost Pet Center
          </button>
        </div>
      </div>

      <!-- Real Database Summary Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon gold"><i data-lucide="paw-print"></i></div>
          <div class="stat-info">
            <div class="stat-value">${stats.totalPets || 0}</div>
            <div class="stat-label">Registered Pets</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon warning"><i data-lucide="clock"></i></div>
          <div class="stat-info">
            <div class="stat-value">${stats.upcomingVaccinations || 0}</div>
            <div class="stat-label">Upcoming Vaccines (7 Days)</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon error"><i data-lucide="alert-circle"></i></div>
          <div class="stat-info">
            <div class="stat-value">${stats.overdueVaccinations || 0}</div>
            <div class="stat-label">Overdue Vaccinations</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon sage">
            <i data-lucide="shield-check"></i>
          </div>
          <div class="stat-info">
            <div class="stat-value">${stats.totalPets || 0}</div>
            <div class="stat-label">Safe &amp; Protected</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon sage"><i data-lucide="stethoscope"></i></div>
          <div class="stat-info">
            <div class="stat-value">${stats.totalVetVisits || 0}</div>
            <div class="stat-label">Recorded Vet Visits</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon info"><i data-lucide="map-pin"></i></div>
          <div class="stat-info">
            <div class="stat-value">${stats.pendingReportsCount || 0}</div>
            <div class="stat-label">Pending Sightings</div>
          </div>
        </div>
      </div>

      <!-- Main Layout: Pet Cards & Recent Medical Activity -->
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:24px; align-items:start;">
        <!-- Left: Pets Overview -->
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-size:1.25rem; font-weight:700;">My Registered Pets</h3>
            <button class="btn btn-sm btn-secondary" onclick="router.navigate('#pets')">View All (${state.pets.length})</button>
          </div>

          ${
            state.pets.length === 0
              ? `
            <div class="empty-state">
              <div class="empty-state-icon"><i data-lucide="paw-print"></i></div>
              <h3>No pets registered yet</h3>
              <p>Add your companion or click "Load Demo Pets" to explore sample healthcare and emergency passport workflows.</p>
              <button class="btn btn-primary" onclick="openAddPetModal()">+ Register Your First Pet</button>
            </div>
            `
              : `
            <div class="pets-grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
              ${state.pets.slice(0, 4).map((pet) => renderPetCardHtml(pet)).join('')}
            </div>
            `
          }
        </div>

        <!-- Right: Recent Clinical & Healthcare Activity -->
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-size:1.25rem; font-weight:700;">Recent Health Activity</h3>
            <button class="btn btn-sm btn-secondary" onclick="router.navigate('#health')">Health Log</button>
          </div>

          <div class="card" style="padding:16px;">
            ${
              !stats.recentActivity || stats.recentActivity.length === 0
                ? `<div style="text-align:center; padding:30px; color:var(--text-secondary); font-size:0.88rem;">No recent health entries recorded.</div>`
                : `<div style="display:flex; flex-direction:column; gap:12px;">
                    ${stats.recentActivity
                      .map(
                        (act) => `
                      <div style="padding:12px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-subtle); display:flex; gap:12px; align-items:center;">
                        <div style="width:38px; height:38px; border-radius:var(--radius-sm); background:var(--bg-secondary); overflow:hidden; flex-shrink:0;">
                          <img src="${act.pet?.photoUrl || defaultPetPhoto(act.pet?.species)}" style="width:100%;height:100%;object-fit:cover;">
                        </div>
                        <div style="flex:1; min-width:0;">
                          <div style="font-weight:600; font-size:0.88rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHtml(act.title)}
                          </div>
                          <div style="font-size:0.75rem; color:var(--text-secondary);">
                            ${act.pet?.name || 'Pet'} • ${new Date(act.date).toLocaleDateString()}
                          </div>
                        </div>
                        <span class="status-tag ${act.category === 'VACCINATION' ? 'upcoming' : 'active'}" style="font-size:0.7rem;">
                          ${act.category.replace('_', ' ')}
                        </span>
                      </div>
                    `
                      )
                      .join('')}
                  </div>`
            }
          </div>
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="text-align:center; padding:40px; color:var(--status-error);"><p>Error loading dashboard: ${escapeHtml(err.message)}</p></div>`;
  }
}

// Default pet photo placeholder using reliable Unsplash pet photography
function defaultPetPhoto(species = 'Dog') {
  if (species === 'Cat') {
    return 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80';
}

function renderPetCardHtml(pet) {
  const photo = pet.photoUrl || defaultPetPhoto(pet.species);
  const isLost = pet.status === 'LOST';

  return `
    <div class="pet-card">
      <div class="pet-card-image-wrap">
        <img src="${photo}" alt="${escapeHtml(pet.name)}" class="pet-card-image">
        <span class="pet-status-pill ${pet.status}">${pet.status}</span>
      </div>

      <div class="pet-card-body">
        <div class="pet-card-header">
          <div>
            <div class="pet-card-name">${escapeHtml(pet.name)}</div>
            <div class="pet-card-breed">${escapeHtml(pet.breed || pet.species)}</div>
          </div>
          <span class="pet-public-code">${pet.publicCode}</span>
        </div>

        <div class="pet-meta-row">
          <span class="pet-meta-badge"><i data-lucide="tag" style="width:12px;height:12px;"></i> ${pet.species}</span>
          ${pet.weight ? `<span class="pet-meta-badge"><i data-lucide="scale" style="width:12px;height:12px;"></i> ${pet.weight} kg</span>` : ''}
          ${pet.neutered ? `<span class="pet-meta-badge"><i data-lucide="check" style="width:12px;height:12px;"></i> Neutered</span>` : ''}
        </div>

        ${
          pet.allergies || pet.conditions
            ? `<div class="pet-notes-preview">
                <strong>Medical note:</strong> ${escapeHtml(pet.allergies || pet.conditions)}
               </div>`
            : ''
        }

        <div class="pet-card-footer" style="flex-wrap:wrap; gap:6px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openPassportModal('${pet.publicCode}')" title="Generate Digital Passport">
            <i data-lucide="qr-code" style="width:14px;height:14px;"></i> Passport
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openPrivacyModal('${pet._id}')" title="Configure Emergency Privacy">
            <i data-lucide="lock" style="width:14px;height:14px;"></i> Privacy
          </button>
          <button class="btn btn-secondary btn-sm" onclick="editPet('${pet._id}')" title="Edit Profile">
            <i data-lucide="edit-2" style="width:14px;height:14px;"></i> Edit
          </button>
          <button class="btn btn-sm ${isLost ? 'btn-success' : 'btn-danger'}" onclick="togglePetLostMode('${pet._id}', '${pet.status}')" title="${isLost ? 'Mark Companion Recovered' : 'Activate Lost Mode'}">
            <i data-lucide="${isLost ? 'shield-check' : 'alert-triangle'}" style="width:14px;height:14px;"></i> ${isLost ? 'Recovered' : 'Mark as Lost'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// MY PETS VIEW (CRUD + SEARCH & FILTER)
// ==========================================================================

async function renderPets() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const data = await api('/api/pets');
    state.pets = data.pets || [];

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>My Pets Directory</h2>
          <p>Manage digital passports, healthcare records, and emergency privacy preferences.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="openAddPetModal()">
            <i data-lucide="plus" style="width:16px;height:16px;"></i>
            <span>Add New Pet</span>
          </button>
        </div>
      </div>

      <!-- Search & Filter Bar -->
      <div class="filter-bar">
        <div class="search-input-wrap">
          <i data-lucide="search" style="width:16px;height:16px;"></i>
          <input type="text" class="search-input" id="petSearchInput" placeholder="Search pets by name, breed, or microchip..." oninput="filterPetsList()">
        </div>
        <div class="filter-group">
          <select class="select-control" id="petSpeciesFilter" onchange="filterPetsList()">
            <option value="All">All Species</option>
            <option value="Dog">Dogs</option>
            <option value="Cat">Cats</option>
            <option value="Bird">Birds</option>
            <option value="Rabbit">Rabbits</option>
            <option value="Horse">Horses</option>
            <option value="Other">Other</option>
          </select>

          <select class="select-control" id="petStatusFilter" onchange="filterPetsList()">
            <option value="All">All Pets</option>
            <option value="SAFE">Safe &amp; Active</option>
            <option value="LOST">Lost (Active Alert)</option>
          </select>
        </div>
      </div>

      <!-- Pets Container -->
      <div id="petsContainer" class="pets-grid">
        ${
          state.pets.length === 0
            ? `<div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon"><i data-lucide="paw-print"></i></div>
                <h3>No pets found</h3>
                <p>Register a pet to generate an official digital passport and configure emergency protection.</p>
                <button class="btn btn-primary" onclick="openAddPetModal()">Add Pet Now</button>
               </div>`
            : state.pets.map((pet) => renderPetCardHtml(pet)).join('')
        }
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

function filterPetsList() {
  const searchTerm = (document.getElementById('petSearchInput')?.value || '').toLowerCase();
  const species = document.getElementById('petSpeciesFilter')?.value || 'All';
  const status = document.getElementById('petStatusFilter')?.value || 'All';

  const filtered = state.pets.filter((p) => {
    const matchesSearch =
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm) ||
      (p.breed && p.breed.toLowerCase().includes(searchTerm)) ||
      (p.microchip && p.microchip.toLowerCase().includes(searchTerm));

    const matchesSpecies = species === 'All' || p.species === species;
    const matchesStatus = status === 'All' || p.status === status;

    return matchesSearch && matchesSpecies && matchesStatus;
  });

  const container = document.getElementById('petsContainer');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>No matching pets</h3>
        <p>Try adjusting your search criteria or species filters.</p>
      </div>
    `;
  } else {
    container.innerHTML = filtered.map((pet) => renderPetCardHtml(pet)).join('');
  }
  refreshIcons();
}

// ==========================================================================
// HEALTH & VACCINATION TRACKER VIEW
// ==========================================================================

async function renderHealth() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const healthData = await api('/api/health');
    const petsData = await api('/api/pets');
    state.healthRecords = healthData.records || [];
    state.pets = petsData.pets || [];

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Digital Health Records &amp; Smart Vaccination Tracker</h2>
          <p>Track immunizations, veterinary consultations, medications, allergies, and weight trends.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="router.navigate('#ai-assistant')">
            <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--gold-dark);"></i>
            <span>Explain Vet Notes with AI</span>
          </button>
          <button class="btn btn-primary" onclick="openAddHealthModal()">
            <i data-lucide="plus" style="width:16px;height:16px;"></i>
            <span>Add Record</span>
          </button>
        </div>
      </div>

      <!-- Filter Controls -->
      <div class="filter-bar">
        <div class="filter-group" style="flex:1; flex-wrap:wrap;">
          <select class="select-control" id="healthPetFilter" onchange="filterHealthRecords()">
            <option value="ALL">All Pets</option>
            ${state.pets.map((p) => `<option value="${p._id}">${escapeHtml(p.name)} (${p.species})</option>`).join('')}
          </select>

          <select class="select-control" id="healthCategoryFilter" onchange="filterHealthRecords()">
            <option value="ALL">All Categories</option>
            <option value="VACCINATION">Vaccinations</option>
            <option value="VET_VISIT">Veterinary Visits</option>
            <option value="MEDICATION">Medications</option>
            <option value="ALLERGY">Allergies</option>
            <option value="WEIGHT">Weight History</option>
          </select>

          <select class="select-control" id="healthStatusFilter" onchange="filterHealthRecords()">
            <option value="ALL">All Vaccination Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="UPCOMING">Upcoming (Next 7 Days)</option>
            <option value="OVERDUE">Overdue</option>
            <option value="SCHEDULED">Scheduled</option>
          </select>
        </div>
      </div>

      <!-- Health records table -->
      <div id="healthTableContainer" class="table-responsive">
        ${renderHealthTableHtml(state.healthRecords)}
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

function renderHealthTableHtml(records) {
  if (!records || records.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="activity"></i></div>
        <h3>No health records found</h3>
        <p>Record your pet's vaccines, clinical visits, or weights to calculate real-time immunization alerts.</p>
        <button class="btn btn-primary" onclick="openAddHealthModal()">+ Add Health Record</button>
      </div>
    `;
  }

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Pet</th>
          <th>Category</th>
          <th>Title &amp; Clinic</th>
          <th>Date Administered</th>
          <th>Due / Follow-up</th>
          <th>Status</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${records
          .map((rec) => {
            const statusClass = (rec.computedStatus || rec.status || '').toLowerCase();
            const isVaccine = rec.category === 'VACCINATION';

            return `
            <tr>
              <td>
                <div style="display:flex; align-items:center; gap:10px;">
                  <img src="${rec.pet?.photoUrl || defaultPetPhoto(rec.pet?.species)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
                  <span style="font-weight:600;">${escapeHtml(rec.pet?.name || 'Pet')}</span>
                </div>
              </td>
              <td><span class="pet-meta-badge">${rec.category.replace('_', ' ')}</span></td>
              <td>
                <div style="font-weight:600; color:var(--text-main);">${escapeHtml(rec.title)}</div>
                ${rec.vetClinic ? `<div style="font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(rec.vetClinic)}</div>` : ''}
                ${rec.notes ? `<div style="font-size:0.75rem; color:var(--text-muted); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(rec.notes)}</div>` : ''}
              </td>
              <td>${new Date(rec.date).toLocaleDateString()}</td>
              <td>${rec.dueDate ? new Date(rec.dueDate).toLocaleDateString() : '—'}</td>
              <td>
                <span class="status-tag ${statusClass}">
                  ${escapeHtml(rec.computedStatus || rec.status)}
                </span>
              </td>
              <td style="text-align:right;">
                <div style="display:inline-flex; gap:6px;">
                  ${
                    isVaccine && rec.computedStatus !== 'COMPLETED'
                      ? `<button class="btn btn-sage btn-sm" onclick="completeVaccination('${rec._id}')" title="Mark as Administered">
                          <i data-lucide="check" style="width:14px;height:14px;"></i> Complete
                         </button>`
                      : ''
                  }
                  <button class="btn btn-secondary btn-sm" onclick="deleteHealthRecord('${rec._id}')" title="Delete Record">
                    <i data-lucide="trash-2" style="width:14px;height:14px;color:var(--status-error);"></i>
                  </button>
                </div>
              </td>
            </tr>
          `;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

function filterHealthRecords() {
  const petId = document.getElementById('healthPetFilter')?.value || 'ALL';
  const category = document.getElementById('healthCategoryFilter')?.value || 'ALL';
  const status = document.getElementById('healthStatusFilter')?.value || 'ALL';

  const filtered = state.healthRecords.filter((r) => {
    const matchPet = petId === 'ALL' || (r.pet && r.pet._id === petId);
    const matchCat = category === 'ALL' || r.category === category;
    const computed = r.computedStatus || r.status;
    const matchStatus = status === 'ALL' || computed === status;
    return matchPet && matchCat && matchStatus;
  });

  const container = document.getElementById('healthTableContainer');
  if (container) {
    container.innerHTML = renderHealthTableHtml(filtered);
    refreshIcons();
  }
}

async function completeVaccination(id) {
  try {
    const res = await api(`/api/health/${id}/complete`, { method: 'PATCH' });
    showToast(res.message || 'Vaccination recorded as completed!', 'success');
    await renderHealth();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteHealthRecord(id) {
  if (!confirm('Are you sure you want to delete this health record?')) return;
  try {
    const res = await api(`/api/health/${id}`, { method: 'DELETE' });
    showToast(res.message || 'Record deleted.', 'info');
    await renderHealth();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// LOST PET RECOVERY CENTER VIEW
// ==========================================================================

async function renderLostCenter() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const petsData = await api('/api/pets');
    const reportsData = await api('/api/reports');
    state.pets = petsData.pets || [];
    state.reports = reportsData.reports || [];

    const lostPets = state.pets.filter((p) => p.status === 'LOST');

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Community Sighting &amp; Recovery Reports</h2>
          <p>Review real-time sighting submissions and emergency alerts reported when finders scan your pets' digital QR passports.</p>
        </div>
      </div>

      <!-- Sighting Overview Banner -->
      <div class="card" style="margin-bottom:28px; background:var(--sage-surface); border-color:#C8D8C3;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
          <div>
            <h3 style="font-size:1.15rem; font-weight:700; color:var(--sage-dark);">
              <i data-lucide="shield-check" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>
              Active Digital QR Protection
            </h3>
            <p style="font-size:0.88rem; color:var(--text-secondary); margin-top:4px;">
              All registered companions have active digital passports. When someone scans a collar tag or passport, their location and contact details appear here instantly.
            </p>
          </div>
          <div>
            <button class="btn btn-secondary btn-sm" onclick="triggerTestNotification()">
              <i data-lucide="bell" style="width:14px;height:14px;"></i> Test Live Alert
            </button>
          </div>
        </div>
      </div>

      <!-- Active Lost Pets Section if any -->
      ${
        lostPets.length > 0
          ? `
        <div style="margin-bottom:28px;">
          <h3 style="font-size:1.15rem; font-weight:700; color:var(--status-error); margin-bottom:12px; display:flex; align-items:center; gap:8px;">
            <i data-lucide="alert-triangle" style="width:18px;height:18px;"></i> Currently Lost Companions (${lostPets.length})
          </h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px;">
            ${lostPets
              .map(
                (p) => `
              <div class="card" style="border-left:4px solid var(--status-error); padding:16px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <img src="${p.photoUrl || defaultPetPhoto(p.species)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
                  <div>
                    <h4 style="margin:0; font-size:1rem; font-weight:700;">${escapeHtml(p.name)}</h4>
                    <div style="font-size:0.78rem; color:var(--text-secondary);">${p.species} &bull; ${escapeHtml(p.breed || '')}</div>
                    ${p.lostDetails?.lastSeenLocation ? `<div style="font-size:0.75rem; color:var(--status-error); margin-top:3px;">Last seen: ${escapeHtml(p.lostDetails.lastSeenLocation)}</div>` : ''}
                  </div>
                </div>
                <button class="btn btn-sm btn-success" onclick="togglePetLostMode('${p._id}', 'LOST')" title="Mark companion as recovered">
                  <i data-lucide="shield-check" style="width:14px;height:14px;"></i> Recovered
                </button>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
        `
          : ''
      }

      <!-- Received Community Sighting Reports Table -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="font-size:1.25rem; font-weight:700;">Community Sighting Reports (${state.reports.length})</h3>
          <span style="font-size:0.85rem; color:var(--text-secondary);">Direct reports submitted by public finders via QR passport scan</span>
        </div>

        <div class="table-responsive">
          ${
            state.reports.length === 0
              ? `
            <div class="empty-state">
              <div class="empty-state-icon"><i data-lucide="map-pin"></i></div>
              <h3>No sighting reports submitted</h3>
              <p>When someone scans your lost pet's QR code, their sighting details, location, and message will appear here instantly.</p>
            </div>
            `
              : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Pet</th>
                  <th>Location Sighted</th>
                  <th>Sighting Time</th>
                  <th>Finder Info</th>
                  <th>Observations &amp; Message</th>
                  <th>Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${state.reports
                  .map(
                    (rep) => `
                  <tr>
                    <td>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <img src="${rep.pet?.photoUrl || defaultPetPhoto(rep.pet?.species)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
                        <div>
                          <div style="font-weight:600;">${escapeHtml(rep.pet?.name || 'Pet')}</div>
                          <div style="font-size:0.75rem; color:var(--text-secondary);">${rep.publicCode}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style="font-weight:600; color:var(--text-main);">${escapeHtml(rep.locationDescription)}</div>
                    </td>
                    <td>${new Date(rep.sightingDate).toLocaleString()}</td>
                    <td>
                      <div style="font-weight:500;">${escapeHtml(rep.finderName)}</div>
                      ${rep.finderContact ? `<div style="font-size:0.78rem; color:var(--gold-dark);">${escapeHtml(rep.finderContact)}</div>` : ''}
                    </td>
                    <td>
                      ${rep.observations ? `<div style="font-size:0.82rem;"><strong>Notes:</strong> ${escapeHtml(rep.observations)}</div>` : ''}
                      ${rep.message ? `<div style="font-size:0.82rem; color:var(--text-secondary);"><em>"${escapeHtml(rep.message)}"</em></div>` : ''}
                    </td>
                    <td>
                      <span class="status-tag ${rep.status === 'REVIEWED' ? 'completed' : rep.status === 'FLAGGED' ? 'suspended' : 'pending'}">
                        ${rep.status}
                      </span>
                    </td>
                    <td style="text-align:right;">
                      <div style="display:inline-flex; gap:6px;">
                        ${
                          rep.status === 'PENDING'
                            ? `<button class="btn btn-secondary btn-sm" onclick="markReportReviewed('${rep._id}')">
                                <i data-lucide="check" style="width:14px;height:14px;"></i> Mark Reviewed
                               </button>`
                            : ''
                        }
                        <button class="btn btn-secondary btn-sm" onclick="flagReport('${rep._id}')" title="Flag suspicious sighting to admin">
                          <i data-lucide="flag" style="width:14px;height:14px;color:var(--status-warning);"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
            `
          }
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

async function markReportReviewed(id) {
  try {
    const res = await api(`/api/reports/${id}/review`, { method: 'PATCH' });
    showToast(res.message || 'Report marked as reviewed.', 'success');
    await renderLostCenter();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function flagReport(id) {
  const reason = prompt('Please describe why this report is suspicious or inappropriate (this will be routed to administrator moderation):');
  if (!reason) return;
  try {
    const res = await api(`/api/reports/${id}/flag`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    showToast(res.message || 'Report flagged for administrator moderation.', 'info');
    await renderLostCenter();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// AI PET CARE ASSISTANT & VET EXPLAINER VIEW
// ==========================================================================

async function renderAiAssistant() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const petsData = await api('/api/pets');
    state.pets = petsData.pets || [];

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>AI Pet Healthcare &amp; Clinical Explainer</h2>
          <p>Educational veterinary guidance, plain-language clinical note breakdowns, and customized species care guides.</p>
        </div>
      </div>

      <!-- Feature Tabs -->
      <div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
        <button class="btn btn-primary btn-sm" id="aiTabChat" onclick="switchAiTab('chat')">
          <i data-lucide="message-square" style="width:16px;height:16px;"></i> Pet Care Assistant
        </button>
        <button class="btn btn-secondary btn-sm" id="aiTabExplainer" onclick="switchAiTab('explainer')">
          <i data-lucide="file-text" style="width:16px;height:16px;"></i> Veterinary Note Explainer
        </button>
        <button class="btn btn-secondary btn-sm" id="aiTabGuide" onclick="switchAiTab('guide')">
          <i data-lucide="book-open" style="width:16px;height:16px;"></i> Species Wellness Guide
        </button>
      </div>

      <!-- TAB 1: INTERACTIVE CHAT -->
      <div id="aiChatSection" class="ai-interface-grid">
        <!-- Sidebar: Pet Context Selection -->
        <div class="ai-sidebar">
          <h4 style="font-size:0.95rem; font-weight:700;">Active Pet Context</h4>
          <p style="font-size:0.8rem; color:var(--text-secondary);">Select a companion to provide relevant species and allergy context to the assistant.</p>

          <select class="form-control" id="aiPetContextSelect" onchange="changeAiPetContext(this.value)">
            <option value="">General Pet Care (No specific pet)</option>
            ${state.pets.map((p) => `<option value="${p._id}">${escapeHtml(p.name)} (${p.species} • ${p.breed || 'Mixed'})</option>`).join('')}
          </select>

          <div id="aiPetContextBadge" style="padding:12px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-color); font-size:0.82rem; display:none;">
            <!-- Injected dynamically -->
          </div>

          <div class="ai-disclaimer-box" style="margin-top:auto;">
            <i data-lucide="shield-alert" style="width:16px;height:16px;flex-shrink:0;"></i>
            <span>Educational guidance only. Never replaces professional veterinary consultation.</span>
          </div>
        </div>

        <!-- Chat Window -->
        <div class="ai-chat-window">
          <div class="ai-chat-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="brand-icon" style="width:32px;height:32px;border-radius:50%;">
                <i data-lucide="sparkles" style="width:16px;height:16px;"></i>
              </div>
              <div>
                <strong style="font-size:0.92rem;">PetCare Health Companion</strong>
                <span style="font-size:0.75rem; color:var(--text-secondary); display:block;">Powered by Google Gemini</span>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="clearAiChat()">Clear Conversation</button>
          </div>

          <div class="ai-messages-scroll" id="aiMessagesContainer">
            <div class="chat-bubble assistant">
              <p>Hello! I am your PetCare Healthcare Assistant. How can I assist you with your companion's nutrition, routine wellness, grooming, or veterinary appointment preparation today?</p>
            </div>
          </div>

          <div class="ai-input-bar">
            <textarea class="ai-textarea" id="aiChatInput" placeholder="Ask about vaccination schedules, nutrition questions, grooming tips..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault(); sendAiMessage();}"></textarea>
            <button class="btn btn-primary" id="btnSendAi" onclick="sendAiMessage()">
              <i data-lucide="send" style="width:16px;height:16px;"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- TAB 2: VET NOTE EXPLAINER -->
      <div id="aiExplainerSection" style="display:none;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
          <div class="card">
            <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:12px;">Enter Clinical Veterinary Notes</h3>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px;">
              Paste discharge summaries, diagnosis abbreviations, or prescription directions provided by your veterinarian.
            </p>

            <div class="form-group">
              <label class="form-label">Select Pet Context</label>
              <select class="form-control" id="explainerPetSelect">
                ${state.pets.map((p) => `<option value="${p._id}">${escapeHtml(p.name)} (${p.species})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Veterinary Clinical Text *</label>
              <textarea class="form-control" id="vetNoteInput" rows="8" placeholder="e.g. Canine presented with bilateral otitis externa. Erythematous canal with ceruminous exudate. Administered Osurnia 1 dose in AU. Follow-up cytology recommended in 14 days. Avoid water immersion."></textarea>
            </div>

            <button class="btn btn-primary" id="btnExplainNote" onclick="submitVetNoteExplainer()">
              <i data-lucide="sparkles" style="width:16px;height:16px;"></i>
              <span>Translate Clinical Note</span>
            </button>
          </div>

          <!-- Output Column -->
          <div class="card" id="explainerOutputCard" style="background:var(--bg-surface-soft);">
            <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:12px;">Plain-Language Explanation</h3>
            <div id="explainerOutputText" style="font-size:0.9rem; line-height:1.6; color:var(--text-main);">
              <p style="color:var(--text-secondary); font-style:italic;">Your AI-generated clinical explanation and medical glossary will appear here after clicking translate.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: PERSONALIZED CARE GUIDE -->
      <div id="aiGuideSection" style="display:none;">
        <div class="card" style="margin-bottom:24px;">
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:10px;">Tailored Species Care &amp; Wellness Guide</h3>
          <p style="font-size:0.88rem; color:var(--text-secondary); margin-bottom:16px;">
            Generate an educational guide covering nutrition, grooming, activity needs, and preventive care customized to your pet's breed and weight.
          </p>

          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <select class="form-control" id="guidePetSelect" style="max-width:320px;">
              ${state.pets.map((p) => `<option value="${p._id}">${escapeHtml(p.name)} (${p.species} • ${p.breed || 'Mixed'})</option>`).join('')}
            </select>
            <button class="btn btn-primary" id="btnGenerateGuide" onclick="submitCareGuide()">
              <i data-lucide="sparkles" style="width:16px;height:16px;"></i>
              <span>Generate Comprehensive Guide</span>
            </button>
          </div>
        </div>

        <div class="card" id="guideOutputCard" style="display:none; line-height:1.65;">
          <div id="guideOutputText"></div>
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

function switchAiTab(tab) {
  const tabChat = document.getElementById('aiTabChat');
  const tabExplainer = document.getElementById('aiTabExplainer');
  const tabGuide = document.getElementById('aiTabGuide');

  const secChat = document.getElementById('aiChatSection');
  const secExplainer = document.getElementById('aiExplainerSection');
  const secGuide = document.getElementById('aiGuideSection');

  tabChat.className = tab === 'chat' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  tabExplainer.className = tab === 'explainer' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  tabGuide.className = tab === 'guide' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

  secChat.style.display = tab === 'chat' ? 'grid' : 'none';
  secExplainer.style.display = tab === 'explainer' ? 'block' : 'none';
  secGuide.style.display = tab === 'guide' ? 'block' : 'none';
  refreshIcons();
}

function changeAiPetContext(petId) {
  state.selectedPetForAi = petId;
  const badge = document.getElementById('aiPetContextBadge');
  if (!petId) {
    badge.style.display = 'none';
    return;
  }
  const pet = state.pets.find((p) => p._id === petId);
  if (pet) {
    badge.style.display = 'block';
    badge.innerHTML = `
      <strong>${escapeHtml(pet.name)}</strong> (${pet.species})<br>
      Breed: ${escapeHtml(pet.breed || 'Not specified')}<br>
      Allergies: ${escapeHtml(pet.allergies || 'None recorded')}<br>
      Weight: ${pet.weight ? pet.weight + ' kg' : 'Not recorded'}
    `;
  }
}

async function sendAiMessage() {
  const input = document.getElementById('aiChatInput');
  const prompt = input.value.trim();
  if (!prompt) return;

  const container = document.getElementById('aiMessagesContainer');
  const btn = document.getElementById('btnSendAi');

  // Append user bubble
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.innerText = prompt;
  container.appendChild(userBubble);
  input.value = '';

  // Append assistant loading placeholder
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble assistant';
  loadingBubble.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;"></i> Consulting educational pet healthcare knowledge...`;
  container.appendChild(loadingBubble);
  container.scrollTop = container.scrollHeight;
  refreshIcons();

  btn.disabled = true;

  try {
    const res = await api('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        conversationHistory: state.aiChatHistory,
        petId: state.selectedPetForAi,
      }),
    });

    state.aiChatHistory.push({ role: 'user', content: prompt });
    state.aiChatHistory.push({ role: 'assistant', content: res.text || '' });

    loadingBubble.innerHTML = `
      <div>${formatMarkdown(res.text || 'No response generated.')}</div>
      ${
        res.disclaimer
          ? `<div class="ai-disclaimer-box" style="margin-top:10px;"><i data-lucide="info" style="width:14px;height:14px;"></i> <span>${escapeHtml(res.disclaimer)}</span></div>`
          : ''
      }
    `;
    refreshIcons();
  } catch (err) {
    loadingBubble.innerHTML = `<span style="color:var(--status-error);">${escapeHtml(err.message)}</span>`;
  } finally {
    btn.disabled = false;
    container.scrollTop = container.scrollHeight;
  }
}

function clearAiChat() {
  state.aiChatHistory = [];
  const container = document.getElementById('aiMessagesContainer');
  if (container) {
    container.innerHTML = `
      <div class="chat-bubble assistant">
        <p>Conversation cleared. Feel free to ask another pet health or care question!</p>
      </div>
    `;
  }
}

async function submitVetNoteExplainer() {
  const noteText = document.getElementById('vetNoteInput').value.trim();
  const petId = document.getElementById('explainerPetSelect')?.value;
  const btn = document.getElementById('btnExplainNote');
  const output = document.getElementById('explainerOutputText');

  if (!noteText) {
    showToast('Please enter clinical veterinary text to translate.', 'warning');
    return;
  }

  btn.disabled = true;
  output.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:20px;height:20px;display:inline-block;margin-right:8px;"></i> Analyzing veterinary note...`;
  refreshIcons();

  try {
    const res = await api('/api/ai/explain-note', {
      method: 'POST',
      body: JSON.stringify({ noteText, petId }),
    });

    output.innerHTML = formatMarkdown(res.text || 'Explanation unavailable.');
  } catch (err) {
    output.innerHTML = `<span style="color:var(--status-error);">${escapeHtml(err.message)}</span>`;
  } finally {
    btn.disabled = false;
    refreshIcons();
  }
}

async function submitCareGuide() {
  const petId = document.getElementById('guidePetSelect')?.value;
  const btn = document.getElementById('btnGenerateGuide');
  const card = document.getElementById('guideOutputCard');
  const output = document.getElementById('guideOutputText');

  if (!petId) {
    showToast('Please select a pet.', 'warning');
    return;
  }

  btn.disabled = true;
  card.style.display = 'block';
  output.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:20px;height:20px;display:inline-block;margin-right:8px;"></i> Crafting personalized breed and species care guide...`;
  refreshIcons();

  try {
    const res = await api('/api/ai/care-guide', {
      method: 'POST',
      body: JSON.stringify({ petId }),
    });

    output.innerHTML = formatMarkdown(res.text || 'Guide could not be generated.');
  } catch (err) {
    output.innerHTML = `<span style="color:var(--status-error);">${escapeHtml(err.message)}</span>`;
  } finally {
    btn.disabled = false;
    refreshIcons();
  }
}

// Comprehensive safe markdown formatter for AI assistant responses
function formatMarkdown(text) {
  if (!text) return '';
  let str = String(text).replace(/\r\n/g, '\n').trim();

  // Escape HTML characters
  str = escapeHtml(str);

  // Horizontal rules
  str = str.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr style="border:none; border-top:1px solid var(--border-color); margin:14px 0;">');

  // Headings
  str = str.replace(/^###\s+(.+)$/gm, '<h4 style="margin:16px 0 6px; font-size:1.02rem; font-weight:700; color:var(--text-main);">$1</h4>');
  str = str.replace(/^##\s+(.+)$/gm, '<h3 style="margin:18px 0 8px; font-size:1.15rem; font-weight:700; color:var(--text-main);">$1</h3>');
  str = str.replace(/^#\s+(.+)$/gm, '<h2 style="margin:20px 0 10px; font-size:1.25rem; font-weight:800; color:var(--text-main);">$1</h2>');

  // Bold & Italic & Code
  str = str.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/\*(.*?)\*/g, '<em>$1</em>');
  str = str.replace(/`([^`]+)`/g, '<code style="background:var(--bg-secondary); padding:2px 6px; border-radius:4px; font-size:0.88em; border:1px solid var(--border-subtle);">$1</code>');

  // Blockquotes
  str = str.replace(/^(?:&gt;|>)\s+(.+)$/gm, '<blockquote style="border-left:3px solid var(--gold-primary); padding:6px 12px; margin:10px 0; color:var(--text-secondary); background:var(--bg-surface-soft); border-radius:0 var(--radius-sm) var(--radius-sm) 0; font-style:italic;">$1</blockquote>');

  // Parse lists into separate <ul> and <ol> blocks
  const lines = str.split('\n');
  const result = [];
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    const ulMatch = line.match(/^(\s*)[\-\*]\s+(.+)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);

    if (ulMatch) {
      if (inOl) { result.push('</ol>'); inOl = false; }
      if (!inUl) { result.push('<ul style="margin:8px 0 10px 22px; padding:0; line-height:1.6;">'); inUl = true; }
      result.push(`<li style="margin-bottom:4px;">${ulMatch[2]}</li>`);
    } else if (olMatch) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (!inOl) { result.push('<ol style="margin:8px 0 10px 22px; padding:0; line-height:1.6;">'); inOl = true; }
      result.push(`<li style="margin-bottom:4px;">${olMatch[2]}</li>`);
    } else {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      result.push(line);
    }
  }
  if (inUl) result.push('</ul>');
  if (inOl) result.push('</ol>');

  str = result.join('\n');
  str = str.replace(/\n\n+/g, '<br><br>');
  str = str.replace(/([^\n>])\n([^\n<])/g, '$1<br>$2');

  return str;
}

// ==========================================================================
// PUBLIC EMERGENCY PORTAL (#emergency/:publicCode)
// ==========================================================================

async function renderEmergencyPortal(publicCode) {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i><p style="margin-top:12px;">Loading Emergency Profile...</p></div>`;
  refreshIcons();

  try {
    const data = await api(`/api/emergency/${publicCode}`);
    const profile = data.profile;
    const isLost = profile.status === 'LOST';

    root.innerHTML = `
      <div class="emergency-portal-container">
        <!-- Emergency alert card -->
        <div class="emergency-card">
          ${
            isLost
              ? `
            <div class="emergency-alert-banner lost-mode">
              <div class="emergency-alert-icon"><i data-lucide="alert-triangle"></i></div>
              <div>
                <strong style="font-size:1.05rem; display:block;">URGENT: THIS PET IS CURRENTLY LOST</strong>
                <span style="font-size:0.85rem;">The owner has reported this pet missing. If you have spotted or safely secured this pet, please call or submit a sighting below!</span>
              </div>
            </div>
            `
              : `
            <div style="background:var(--sage-surface); padding:14px 20px; display:flex; align-items:center; gap:10px; border-bottom:1px solid #C8D8C3; color:var(--sage-dark);">
              <i data-lucide="shield-check" style="width:20px;height:20px;"></i>
              <span style="font-size:0.88rem; font-weight:600;">Official PetCare Digital Emergency Profile</span>
            </div>
            `
          }

          ${
            profile.photoUrl
              ? `
            <div class="emergency-photo-header">
              <img src="${profile.photoUrl}" alt="${escapeHtml(profile.name)}">
            </div>
            `
              : ''
          }

          <div class="emergency-profile-details">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
              <div>
                <h2 style="font-size:1.8rem; font-weight:800; color:var(--text-main); letter-spacing:-0.02em;">
                  ${escapeHtml(profile.name)}
                </h2>
                <div style="color:var(--text-secondary); font-size:1rem;">
                  ${escapeHtml(profile.species)}${profile.breed ? ` • ${escapeHtml(profile.breed)}` : ''}
                </div>
              </div>
              <span class="pet-public-code" style="font-size:0.85rem;">ID: ${profile.publicCode}</span>
            </div>

            ${
              profile.microchip
                ? `<div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px;">
                    <i data-lucide="cpu" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Microchip: ${profile.microchip}
                   </div>`
                : ''
            }

            ${
              isLost && profile.lostDetails
                ? `
              <div style="background:#FFF5F3; border:1px solid #F5D3CC; border-radius:var(--radius-md); padding:16px; margin-bottom:20px;">
                <div style="font-weight:700; color:var(--status-error); margin-bottom:4px; font-size:0.9rem;">
                  <i data-lucide="map-pin" style="width:15px;height:15px;display:inline-block;vertical-align:middle;"></i> Last Seen Information:
                </div>
                <div style="font-size:0.88rem;"><strong>Location:</strong> ${escapeHtml(profile.lostDetails.lastSeenLocation || 'Not specified')}</div>
                ${profile.lostDetails.circumstances ? `<div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(profile.lostDetails.circumstances)}</div>` : ''}
              </div>
              `
                : ''
            }

            <!-- Medical alerts & Special care -->
            ${
              profile.allergies || profile.medicalConditions || profile.specialCare
                ? `
              <div style="background:var(--bg-surface-soft); border-radius:var(--radius-md); padding:16px; border:1px solid var(--border-color); margin-bottom:20px;">
                ${profile.allergies ? `<div style="margin-bottom:8px;"><strong style="color:var(--status-warning);">Allergies:</strong> ${escapeHtml(profile.allergies)}</div>` : ''}
                ${profile.medicalConditions ? `<div style="margin-bottom:8px;"><strong style="color:var(--status-error);">Medical Alert:</strong> ${escapeHtml(profile.medicalConditions)}</div>` : ''}
                ${profile.specialCare ? `<div><strong>Handling &amp; Care:</strong> ${escapeHtml(profile.specialCare)}</div>` : ''}
              </div>
              `
                : ''
            }

            <!-- Contact Owner buttons -->
            <div class="emergency-contact-box">
              <h4 style="font-size:0.95rem; font-weight:700; color:#2A2416; margin-bottom:6px;">Contact Owner Directly</h4>
              <p style="font-size:0.85rem; color:var(--text-secondary);">Owner-approved emergency communication channels:</p>

              <div class="emergency-action-buttons">
                ${
                  profile.emergencyPhone
                    ? `<a href="tel:${profile.emergencyPhone}" class="btn btn-primary">
                        <i data-lucide="phone" style="width:16px;height:16px;"></i> Call Owner (${profile.emergencyPhone})
                       </a>`
                    : `<button class="btn btn-secondary" disabled>No Phone Approved</button>`
                }

                ${
                  profile.emergencyEmail
                    ? `<a href="mailto:${profile.emergencyEmail}?subject=Found%20Pet%20Notice:%20${encodeURIComponent(profile.name)}" class="btn btn-secondary">
                        <i data-lucide="mail" style="width:16px;height:16px;"></i> Email Owner
                       </a>`
                    : `<button class="btn btn-secondary" disabled>No Email Approved</button>`
                }
              </div>
            </div>

            <!-- Sighting submission form card -->
            <div class="sighting-form-card">
              <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:6px;">Report a Sighting or Safe Location</h3>
              <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:18px;">
                Spotted this pet? Submit details immediately without creating an account. The owner receives an instant in-app notification.
              </p>

              <form onsubmit="handlePublicSightingSubmit(event, '${profile.publicCode}')">
                <div class="form-group">
                  <label class="form-label">Sighting Location *</label>
                  <input type="text" class="form-control" id="sightLocation" placeholder="e.g. Corner of Elm St & 5th Ave near the playground" required>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Your Name (Optional)</label>
                    <input type="text" class="form-control" id="sightFinderName" placeholder="e.g. Alex Green">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Your Contact Phone / Email (Optional)</label>
                    <input type="text" class="form-control" id="sightFinderContact" placeholder="e.g. +1 (555) 998-1122">
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Observations (Collar, Physical Condition, Behavior)</label>
                  <input type="text" class="form-control" id="sightObservations" placeholder="e.g. Looked thirsty; resting safely under tree; friendly">
                </div>

                <div class="form-group">
                  <label class="form-label">Personal Message to Owner</label>
                  <textarea class="form-control" id="sightMessage" rows="2" placeholder="e.g. Left a bowl of water for her. I will be in the park until 6pm!"></textarea>
                </div>

                <button type="submit" class="btn btn-primary" id="btnSubmitSighting" style="width:100%;">
                  <i data-lucide="send" style="width:16px;height:16px;"></i>
                  <span>Submit Sighting Report</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `
      <div class="card" style="max-width:540px; margin:60px auto; text-align:center;">
        <i data-lucide="alert-circle" style="width:48px;height:48px;color:var(--status-error);margin:0 auto 16px;"></i>
        <h3 style="margin-bottom:8px;">Pet Emergency Profile Not Found</h3>
        <p style="color:var(--text-secondary); margin-bottom:20px;">The passport code <strong>${escapeHtml(publicCode)}</strong> is invalid or the pet profile was removed.</p>
        <button class="btn btn-primary" onclick="router.navigate('#dashboard')">Go to PetCare Passport</button>
      </div>
    `;
    refreshIcons();
  }
}

async function handlePublicSightingSubmit(e, publicCode) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitSighting');
  btn.disabled = true;

  const locationDescription = document.getElementById('sightLocation').value.trim();
  const finderName = document.getElementById('sightFinderName').value.trim();
  const finderContact = document.getElementById('sightFinderContact').value.trim();
  const observations = document.getElementById('sightObservations').value.trim();
  const message = document.getElementById('sightMessage').value.trim();

  try {
    const res = await api(`/api/emergency/${publicCode}/report`, {
      method: 'POST',
      body: JSON.stringify({
        locationDescription,
        finderName,
        finderContact,
        observations,
        message,
      }),
    });

    showToast(res.message || 'Sighting report sent to owner successfully!', 'success');
    e.target.reset();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ==========================================================================
// ADMINISTRATOR EXPERIENCE (SEPARATE DASHBOARD & STRICT PERMISSIONS)
// ==========================================================================

async function renderAdminOverview() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const data = await api('/api/admin/stats');
    const s = data.stats || {};

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Administrator Command Center</h2>
          <p>Real-time platform metrics, account moderation, and emergency sighting oversight.</p>
        </div>
      </div>

      <!-- Real DB Admin Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon gold"><i data-lucide="users"></i></div>
          <div class="stat-info">
            <div class="stat-value">${s.totalUsers || 0}</div>
            <div class="stat-label">Total Users (${s.activeUsers || 0} Active)</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon error"><i data-lucide="user-x"></i></div>
          <div class="stat-info">
            <div class="stat-value">${s.suspendedUsers || 0}</div>
            <div class="stat-label">Suspended Accounts</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon sage"><i data-lucide="paw-print"></i></div>
          <div class="stat-info">
            <div class="stat-value">${s.totalPets || 0}</div>
            <div class="stat-label">Total Registered Pets</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon warning"><i data-lucide="map-pin"></i></div>
          <div class="stat-info">
            <div class="stat-value">${s.activeLostCases || 0}</div>
            <div class="stat-label">Active Lost Cases</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon info"><i data-lucide="eye"></i></div>
          <div class="stat-info">
            <div class="stat-value">${s.pendingReports || 0}</div>
            <div class="stat-label">Pending Sightings</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon error"><i data-lucide="flag"></i></div>
          <div class="stat-info">
            <div class="stat-value">${s.flaggedReports || 0}</div>
            <div class="stat-label">Flagged Reports</div>
          </div>
        </div>
      </div>

      <!-- Recent Administrative Activity & Registrations -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h3 style="font-size:1.15rem; font-weight:700;">Recent User Registrations</h3>
            <button class="btn btn-secondary btn-sm" onclick="router.navigate('#admin-users')">Manage Users</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${(data.recentUsers || [])
              .map(
                (u) => `
              <div style="padding:10px 14px; background:var(--bg-surface-soft); border-radius:var(--radius-md); display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:600; font-size:0.88rem;">${escapeHtml(u.name)}</div>
                  <div style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(u.email)}</div>
                </div>
                <span class="status-tag ${u.status === 'ACTIVE' ? 'active' : 'suspended'}">${u.status}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h3 style="font-size:1.15rem; font-weight:700;">Recent Audit Trail</h3>
            <button class="btn btn-secondary btn-sm" onclick="router.navigate('#admin-audit')">All Logs</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${(data.recentAuditLogs || [])
              .map(
                (log) => `
              <div style="padding:10px 14px; background:var(--bg-surface-soft); border-radius:var(--radius-md); font-size:0.82rem;">
                <div style="font-weight:600; color:var(--gold-dark);">${escapeHtml(log.action)}</div>
                <div style="color:var(--text-secondary);">${escapeHtml(log.reason || 'No description')}</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${new Date(log.createdAt).toLocaleString()} • ${escapeHtml(log.adminEmail)}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

async function renderAdminUsers() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const data = await api('/api/admin/users');
    const users = data.users || [];

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>User Account Management</h2>
          <p>Review registered owners, manage suspension statuses, and verify legitimate veterinary accounts.</p>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Verification</th>
              <th>Joined Date</th>
              <th style="text-align:right;">Administrative Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users
              .map(
                (u) => `
              <tr>
                <td>
                  <div style="font-weight:600; color:var(--text-main);">${escapeHtml(u.name)}</div>
                  <div style="font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(u.email)}</div>
                </td>
                <td><span class="pet-meta-badge">${u.role}</span></td>
                <td>
                  <span class="status-tag ${u.status === 'ACTIVE' ? 'active' : 'suspended'}">${u.status}</span>
                </td>
                <td>
                  <span class="status-tag ${u.verificationStatus === 'VERIFIED' ? 'verified' : 'pending'}">${u.verificationStatus}</span>
                </td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td style="text-align:right;">
                  <div style="display:inline-flex; gap:6px;">
                    ${
                      u.status === 'ACTIVE'
                        ? `<button class="btn btn-terracotta btn-sm" onclick="openAdminSuspendModal('${u._id}')" ${u._id === state.currentUser?.id ? 'disabled title="Cannot suspend self"' : ''}>
                            Suspend
                           </button>`
                        : `<button class="btn btn-sage btn-sm" onclick="reactivateUser('${u._id}')">
                            Reactivate
                           </button>`
                    }
                    <button class="btn btn-secondary btn-sm" onclick="verifyUser('${u._id}', '${u.verificationStatus}')">
                      Verify
                    </button>
                  </div>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

function openAdminSuspendModal(userId) {
  document.getElementById('suspendUserId').value = userId;
  document.getElementById('suspendReason').value = '';
  openModal('modalAdminSuspend');
}

async function confirmSuspendUser() {
  const userId = document.getElementById('suspendUserId').value;
  const reason = document.getElementById('suspendReason').value.trim();
  if (!reason) {
    showToast('Please provide a justification for suspension.', 'warning');
    return;
  }

  try {
    const res = await api(`/api/admin/users/${userId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    closeModal('modalAdminSuspend');
    showToast(res.message || 'User suspended.', 'success');
    await renderAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function reactivateUser(userId) {
  if (!confirm('Reactivate this account and restore operational access?')) return;
  try {
    const res = await api(`/api/admin/users/${userId}/reactivate`, { method: 'POST' });
    showToast(res.message || 'User reactivated.', 'success');
    await renderAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function verifyUser(userId, currentStatus) {
  const nextStatus = currentStatus === 'VERIFIED' ? 'UNVERIFIED' : 'VERIFIED';
  const notes = prompt(`Update verification status to ${nextStatus}. Enter moderation notes:`, 'Administrative review completed');
  if (notes === null) return;

  try {
    const res = await api(`/api/admin/users/${userId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verificationStatus: nextStatus, notes }),
    });
    showToast(res.message || 'Verification updated.', 'success');
    await renderAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderAdminReports() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const data = await api('/api/admin/reports');
    const reports = data.reports || [];

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Found-Pet Sighting Report Moderation</h2>
          <p>Review flagged community sightings, dismiss false alarms, and record audit actions.</p>
        </div>
      </div>

      <div class="table-responsive">
        ${
          reports.length === 0
            ? `<div class="empty-state"><h3>No reports submitted</h3></div>`
            : `
          <table class="data-table">
            <thead>
              <tr>
                <th>Target Pet</th>
                <th>Finder &amp; Contact</th>
                <th>Location</th>
                <th>Message Content</th>
                <th>Status</th>
                <th style="text-align:right;">Moderation</th>
              </tr>
            </thead>
            <tbody>
              ${reports
                .map(
                  (r) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(r.pet?.name || 'Pet')}</strong>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">${r.publicCode}</div>
                  </td>
                  <td>
                    <div>${escapeHtml(r.finderName)}</div>
                    <div style="font-size:0.75rem; color:var(--gold-dark);">${escapeHtml(r.finderContact)}</div>
                  </td>
                  <td>${escapeHtml(r.locationDescription)}</td>
                  <td>
                    <div style="font-size:0.82rem; max-width:280px;">${escapeHtml(r.message || r.observations || '—')}</div>
                    ${r.flagReason ? `<div style="font-size:0.75rem; color:var(--status-error); margin-top:3px;"><strong>Flagged:</strong> ${escapeHtml(r.flagReason)}</div>` : ''}
                  </td>
                  <td>
                    <span class="status-tag ${r.status === 'FLAGGED' ? 'suspended' : r.status === 'REVIEWED' ? 'completed' : 'pending'}">${r.status}</span>
                  </td>
                  <td style="text-align:right;">
                    <div style="display:inline-flex; gap:6px;">
                      <button class="btn btn-secondary btn-sm" onclick="moderateReport('${r._id}', 'REVIEWED')">Approve</button>
                      <button class="btn btn-terracotta btn-sm" onclick="moderateReport('${r._id}', 'DISMISSED')">Dismiss</button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
          `
        }
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

async function moderateReport(reportId, status) {
  const moderationNotes = prompt(`Enter moderation notes for marking report as ${status}:`, 'Verified by administrator');
  if (moderationNotes === null) return;

  try {
    const res = await api(`/api/admin/reports/${reportId}/moderate`, {
      method: 'POST',
      body: JSON.stringify({ status, moderationNotes }),
    });
    showToast(res.message || 'Report moderated.', 'success');
    await renderAdminReports();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderAdminPets() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const data = await api('/api/admin/pets');
    const pets = data.pets || [];

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Pet Profile Oversight</h2>
          <p>Supervise pet registrations, verify authenticity, and flag spam or misleading profiles.</p>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Pet</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Passport Code</th>
              <th>Moderation Flag</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pets
              .map(
                (p) => `
              <tr>
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <img src="${p.photoUrl || defaultPetPhoto(p.species)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
                    <div>
                      <div style="font-weight:600;">${escapeHtml(p.name)}</div>
                      <div style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(p.species)} • ${escapeHtml(p.breed || 'Mixed')}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div>${escapeHtml(p.owner?.name || 'Owner')}</div>
                  <div style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(p.owner?.email || '')}</div>
                </td>
                <td><span class="pet-status-pill ${p.status}" style="position:static;">${p.status}</span></td>
                <td><span class="pet-public-code">${p.publicCode}</span></td>
                <td>
                  ${
                    p.flaggedForModeration
                      ? `<span class="status-tag suspended">FLAGGED: ${escapeHtml(p.flagReason || 'Under Review')}</span>`
                      : `<span class="status-tag active">Clear</span>`
                  }
                </td>
                <td style="text-align:right;">
                  <button class="btn btn-secondary btn-sm" onclick="toggleAdminPetFlag('${p._id}', ${!p.flaggedForModeration})">
                    ${p.flaggedForModeration ? 'Clear Flag' : 'Flag Profile'}
                  </button>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

async function toggleAdminPetFlag(petId, flag) {
  let reason = '';
  if (flag) {
    reason = prompt('Reason for flagging pet profile for investigation:');
    if (!reason) return;
  }

  try {
    const res = await api(`/api/admin/pets/${petId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ flag, reason }),
    });
    showToast(res.message || 'Pet profile status updated.', 'info');
    await renderAdminPets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderAdminAnalytics() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const data = await api('/api/admin/analytics');
    const an = data.analytics || {};

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Platform Analytics &amp; Demographics</h2>
          <p>Distribution of registered companion species, recovery outcomes, and medical record categories.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:24px;">
        <div class="card">
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:16px;">Registered Species Breakdown</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${(an.speciesBreakdown || [])
              .map(
                (item) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-surface-soft); border-radius:var(--radius-md);">
                <span style="font-weight:600;">${item._id}</span>
                <span class="badge-counter">${item.count} pets</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="card">
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:16px;">Safety Status Distribution</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${(an.statusBreakdown || [])
              .map(
                (item) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-surface-soft); border-radius:var(--radius-md);">
                <span style="font-weight:600;">${item._id}</span>
                <span class="badge-counter" style="background:${item._id === 'LOST' ? 'var(--status-error)' : 'var(--sage-muted)'}; color:#FFF;">${item.count}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="card">
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:16px;">Health Record Categories</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${(an.recordsBreakdown || [])
              .map(
                (item) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-surface-soft); border-radius:var(--radius-md);">
                <span style="font-weight:600;">${item._id.replace('_', ' ')}</span>
                <span class="badge-counter">${item.count} entries</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

async function renderAdminAudit() {
  const root = document.getElementById('appRoot');
  root.innerHTML = `<div style="text-align:center; padding:60px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i></div>`;
  refreshIcons();

  try {
    const data = await api('/api/admin/audit-logs');
    const logs = data.logs || [];

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title-wrap">
          <h2>Administrative Audit Trail</h2>
          <p>Immutable chronological ledger of account suspensions, verifications, and moderation decisions.</p>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Administrator</th>
              <th>Action</th>
              <th>Target</th>
              <th>Reason &amp; Context</th>
            </tr>
          </thead>
          <tbody>
            ${logs
              .map(
                (l) => `
              <tr>
                <td>${new Date(l.createdAt).toLocaleString()}</td>
                <td><strong>${escapeHtml(l.adminEmail)}</strong></td>
                <td><span class="status-tag scheduled">${escapeHtml(l.action)}</span></td>
                <td>${escapeHtml(l.targetType)} (${escapeHtml(l.targetId)})</td>
                <td>${escapeHtml(l.reason || '—')}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    root.innerHTML = `<div class="card" style="color:var(--status-error);">${escapeHtml(err.message)}</div>`;
  }
}

// ==========================================================================
// PASSPORT MODAL & HIGH-CONTRAST QR GENERATION
// ==========================================================================

let currentPassportData = null;

async function openPassportModal(publicCode) {
  const target = document.getElementById('passportPrintTarget');
  target.innerHTML = `<div style="text-align:center; padding:40px;"><i data-lucide="loader-2" class="spin" style="width:36px;height:36px;color:var(--gold-primary);"></i><p style="margin-top:10px;">Rendering digital passport...</p></div>`;
  openModal('modalPassport');
  refreshIcons();

  try {
    const originParam = encodeURIComponent(window.location.origin);
    const qrData = await api(`/api/emergency/${publicCode}/qr?origin=${originParam}`);
    const petRes = await api(`/api/emergency/${publicCode}`);
    const p = petRes.profile;

    const qrUrl = qrData.qrDataUrl;
    const publicLink = qrData.publicUrl;
    currentPassportData = { publicCode, publicLink, qrUrl, profile: p };

    target.innerHTML = `
      <div class="passport-sheet" id="activePassportSheet">
        <div class="passport-watermark-header">
          <div class="passport-seal">
            <div class="passport-seal-icon">
              <i data-lucide="shield-check" style="width:26px;height:26px;"></i>
            </div>
            <div class="passport-seal-title">
              <h3>PetCare Official Digital Passport</h3>
              <span>Emergency Identification &amp; Recovery Document</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:monospace; font-weight:700; font-size:1.1rem; color:var(--text-main);">${p.publicCode}</div>
            <span class="status-tag ${p.status === 'LOST' ? 'overdue' : 'active'}" style="margin-top:4px;">${p.status}</span>
          </div>
        </div>

        <div class="passport-body-grid">
          <!-- Col 1: Photo Frame -->
          <div>
            <div class="passport-photo-frame">
              <img id="passportPetPhoto" src="${p.photoUrl || defaultPetPhoto(p.species)}" alt="${escapeHtml(p.name)}" crossorigin="anonymous">
            </div>
          </div>

          <!-- Col 2: Identification Table -->
          <div>
            <table class="passport-field-table">
              <tr>
                <td class="label">Name of Companion:</td>
                <td class="value"><strong>${escapeHtml(p.name)}</strong></td>
              </tr>
              <tr>
                <td class="label">Animal Species:</td>
                <td class="value">${escapeHtml(p.species)}</td>
              </tr>
              <tr>
                <td class="label">Breed:</td>
                <td class="value">${escapeHtml(p.breed || 'Mixed / Unspecified')}</td>
              </tr>
              <tr>
                <td class="label">Microchip Identifier:</td>
                <td class="value">${escapeHtml(p.microchip || 'Registered')}</td>
              </tr>
              <tr>
                <td class="label">Emergency Telephone:</td>
                <td class="value">${p.emergencyPhone ? escapeHtml(p.emergencyPhone) : 'Protected'}</td>
              </tr>
              <tr>
                <td class="label">Emergency Email:</td>
                <td class="value">${p.emergencyEmail ? escapeHtml(p.emergencyEmail) : 'Protected'}</td>
              </tr>
            </table>
          </div>

          <!-- Col 3: High Contrast QR Code & Actions -->
          <div class="passport-qr-pane">
            <div class="passport-qr-box">
              <img id="passportQrImg" src="${qrUrl}" alt="Emergency QR Code for ${p.publicCode}">
            </div>
            <div class="passport-qr-caption">Scan to view emergency profile &amp; notify owner</div>

            <div class="passport-actions-panel no-print" style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
              <button class="btn btn-primary btn-sm" onclick="viewEmergencyProfile('${escapeHtml(publicLink)}', '${p.publicCode}')" title="Test and open the emergency profile destination">
                <i data-lucide="external-link" style="width:14px;height:14px;"></i> View Emergency Profile
              </button>
              <button class="btn btn-secondary btn-sm" onclick="downloadQrAsJpg('${p.publicCode}')" title="Download high-resolution JPG image of QR code">
                <i data-lucide="download" style="width:14px;height:14px;"></i> Download QR as JPG
              </button>
              <button class="btn btn-secondary btn-sm" onclick="copyPublicLink('${escapeHtml(publicLink)}')" title="Copy emergency link to clipboard">
                <i data-lucide="copy" style="width:14px;height:14px;"></i> Copy Emergency Link
              </button>
              <button class="btn btn-secondary btn-sm" onclick="printCurrentPassport()" title="Print passport document">
                <i data-lucide="printer" style="width:14px;height:14px;"></i> Print Pet Passport
              </button>
            </div>
          </div>
        </div>

        <!-- Medical Alerts Strip -->
        ${
          p.allergies || p.medicalConditions || p.specialCare
            ? `
          <div class="passport-medical-strip">
            <div class="passport-medical-title">
              <i data-lucide="alert-circle" style="width:16px;height:16px;"></i> Owner-Approved Emergency Health Information
            </div>
            ${p.allergies ? `<div style="font-size:0.86rem; margin-bottom:4px;"><strong>Known Allergies:</strong> ${escapeHtml(p.allergies)}</div>` : ''}
            ${p.medicalConditions ? `<div style="font-size:0.86rem; margin-bottom:4px;"><strong>Medical Conditions:</strong> ${escapeHtml(p.medicalConditions)}</div>` : ''}
            ${p.specialCare ? `<div style="font-size:0.86rem;"><strong>Special Care Instructions:</strong> ${escapeHtml(p.specialCare)}</div>` : ''}
          </div>
          `
            : ''
        }

        <div class="passport-notice-footer">
          This digital identity document is issued via PetCare Passport. It certifies registered ownership preferences and provides instant emergency recovery access.
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    target.innerHTML = `<div style="color:var(--status-error); text-align:center; padding:30px;"><i data-lucide="alert-triangle" style="width:32px;height:32px;margin:0 auto 10px;"></i><p>Failed to render passport: ${escapeHtml(err.message)}</p></div>`;
    refreshIcons();
  }
}

/**
 * View Emergency Profile - verifies destination and navigates directly
 */
function viewEmergencyProfile(publicLink, publicCode) {
  closeModal('modalPassport');
  if (publicCode) {
    router.navigate('#emergency/' + publicCode);
    showToast(`Viewing Emergency Profile for ${publicCode}`, 'info');
  } else if (publicLink) {
    window.location.href = publicLink;
  }
}

/**
 * Download QR Code as a genuine JPG image
 */
async function downloadQrAsJpg(publicCode) {
  if (!publicCode) {
    showToast('Missing pet public identifier.', 'error');
    return;
  }

  showToast('Preparing JPG image download...', 'info');

  try {
    // 1. Fetch genuine JPEG binary from backend endpoint
    const response = await fetch(`/api/emergency/${publicCode}/qr.jpg`);
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = `${publicCode}_qr.jpg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      setTimeout(() => {
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobUrl);
      }, 100);
      showToast(`QR Code JPG downloaded for ${publicCode}`, 'success');
      return;
    }
  } catch (fetchErr) {
    console.warn('[JPG Fetch fallback to canvas]:', fetchErr);
  }

  // 2. Client-side Canvas fallback (renders 800x800 high-res JPG with pure white background)
  try {
    const qrImg = document.getElementById('passportQrImg');
    if (!qrImg || !qrImg.src) {
      throw new Error('QR image not available on screen.');
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 800;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Crisp pure white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);

      // Centered QR with generous 60px whitespace margin
      const margin = 60;
      ctx.drawImage(img, margin, margin, size - margin * 2, size - margin * 2);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            showToast('Failed to create JPG file.', 'error');
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `${publicCode}_qr.jpg`;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
          }, 100);
          showToast(`QR Code JPG downloaded for ${publicCode}`, 'success');
        },
        'image/jpeg',
        0.95
      );
    };
    img.onerror = () => {
      showToast('Could not load QR code image for conversion.', 'error');
    };
    img.src = qrImg.src;
  } catch (canvasErr) {
    console.error('[Canvas JPG generation error]:', canvasErr);
    showToast(`Download failed: ${canvasErr.message}`, 'error');
  }
}

/**
 * Print Pet Passport - cleanly opens native print dialog, printing only the passport
 */
async function printCurrentPassport() {
  const modal = document.getElementById('modalPassport');
  if (!modal || !modal.classList.contains('open')) {
    showToast('Please open a digital passport before printing.', 'warning');
    return;
  }

  const sheet = document.getElementById('activePassportSheet');
  if (!sheet) {
    showToast('Passport content is not yet ready for printing.', 'warning');
    return;
  }

  // Wait for images to load before opening print dialog
  const images = Array.from(modal.querySelectorAll('img'));
  const waitPromises = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 1500); // 1.5s timeout safety
    });
  });

  await Promise.all(waitPromises);

  // Apply print isolation class to body
  document.body.classList.add('printing-passport');

  // Trigger native print dialog
  window.print();

  // Remove print isolation class
  setTimeout(() => {
    document.body.classList.remove('printing-passport');
  }, 1000);
}

function copyPublicLink(url) {
  if (!url) {
    showToast('No emergency link available to copy.', 'warning');
    return;
  }
  navigator.clipboard.writeText(url).then(
    () => {
      showToast('Emergency passport URL copied to clipboard!', 'success');
    },
    () => {
      showToast('Could not copy link automatically.', 'warning');
    }
  );
}

// ==========================================================================
// PET CRUD & PRIVACY ACTIONS
// ==========================================================================

function openAddPetModal() {
  document.getElementById('petEditId').value = '';
  document.getElementById('petForm').reset();
  document.getElementById('petModalTitle').innerText = 'Register New Companion';
  openModal('modalPet');
}

async function editPet(petId) {
  try {
    const data = await api(`/api/pets/${petId}`);
    const pet = data.pet;

    document.getElementById('petEditId').value = pet._id;
    document.getElementById('petModalTitle').innerText = `Edit ${pet.name}'s Profile`;
    document.getElementById('petName').value = pet.name || '';
    document.getElementById('petSpecies').value = pet.species || 'Dog';
    document.getElementById('petBreed').value = pet.breed || '';
    document.getElementById('petDob').value = pet.dob ? pet.dob.split('T')[0] : '';
    document.getElementById('petGender').value = pet.gender || 'Unknown';
    document.getElementById('petWeight').value = pet.weight || '';
    document.getElementById('petMicrochip').value = pet.microchip || '';
    document.getElementById('petBloodGroup').value = pet.bloodGroup || '';
    document.getElementById('petPhotoUrl').value = pet.photoUrl || '';
    document.getElementById('petNeutered').checked = Boolean(pet.neutered);
    document.getElementById('petAllergies').value = pet.allergies || '';
    document.getElementById('petConditions').value = pet.conditions || '';
    document.getElementById('petSpecialCare').value = pet.specialCare || '';
    document.getElementById('petEmergencyPhone').value = pet.emergencyPhone || '';
    document.getElementById('petEmergencyEmail').value = pet.emergencyEmail || '';

    openModal('modalPet');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handlePetSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSavePet');
  btn.disabled = true;

  const petId = document.getElementById('petEditId').value;
  const isEdit = Boolean(petId);

  const fileInput = document.getElementById('petPhotoFile');
  const hasFile = fileInput.files && fileInput.files.length > 0;

  const payload = {
    name: document.getElementById('petName').value.trim(),
    species: document.getElementById('petSpecies').value,
    breed: document.getElementById('petBreed').value.trim(),
    dob: document.getElementById('petDob').value || undefined,
    gender: document.getElementById('petGender').value,
    weight: document.getElementById('petWeight').value || undefined,
    microchip: document.getElementById('petMicrochip').value.trim(),
    bloodGroup: document.getElementById('petBloodGroup').value.trim(),
    photoUrl: document.getElementById('petPhotoUrl').value.trim(),
    neutered: document.getElementById('petNeutered').checked,
    allergies: document.getElementById('petAllergies').value.trim(),
    conditions: document.getElementById('petConditions').value.trim(),
    specialCare: document.getElementById('petSpecialCare').value.trim(),
    emergencyPhone: document.getElementById('petEmergencyPhone').value.trim(),
    emergencyEmail: document.getElementById('petEmergencyEmail').value.trim(),
  };

  try {
    let body;
    if (hasFile) {
      body = new FormData();
      Object.keys(payload).forEach((k) => {
        if (payload[k] !== undefined) body.append(k, payload[k]);
      });
      body.append('photo', fileInput.files[0]);
    } else {
      body = JSON.stringify(payload);
    }

    const endpoint = isEdit ? `/api/pets/${petId}` : '/api/pets';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await api(endpoint, { method, body });
    closeModal('modalPet');
    showToast(res.message || 'Pet profile saved!', 'success');

    if (state.currentRoute === '#pets') await renderPets();
    else await renderDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function openPrivacyModal(petId) {
  try {
    const data = await api(`/api/pets/${petId}`);
    const pet = data.pet;
    const priv = pet.privacySettings || {};

    document.getElementById('privacyPetId').value = petId;
    document.getElementById('privShowPhoto').checked = priv.showPhoto !== false;
    document.getElementById('privShowNameBreed').checked = priv.showNameBreed !== false;
    document.getElementById('privShowMedical').checked = Boolean(priv.showMedical);
    document.getElementById('privShowAllergies').checked = priv.showAllergies !== false;
    document.getElementById('privShowSpecialCare').checked = priv.showSpecialCare !== false;
    document.getElementById('privShowPhone').checked = priv.showPhone !== false;
    document.getElementById('privShowEmail').checked = Boolean(priv.showEmail);

    openModal('modalPrivacy');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function savePrivacyPreferences() {
  const petId = document.getElementById('privacyPetId').value;
  const preferences = {
    showPhoto: document.getElementById('privShowPhoto').checked,
    showNameBreed: document.getElementById('privShowNameBreed').checked,
    showMedical: document.getElementById('privShowMedical').checked,
    showAllergies: document.getElementById('privShowAllergies').checked,
    showSpecialCare: document.getElementById('privShowSpecialCare').checked,
    showPhone: document.getElementById('privShowPhone').checked,
    showEmail: document.getElementById('privShowEmail').checked,
  };

  try {
    const res = await api(`/api/pets/${petId}/privacy`, {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
    closeModal('modalPrivacy');
    showToast(res.message || 'Emergency privacy preferences updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Lost Mode activation modal
function togglePetLostMode(petId, currentStatus) {
  if (currentStatus === 'LOST') {
    // Mark recovered directly with confirmation
    if (!confirm('Mark companion as RECOVERED? This removes the emergency alert and returns status to SAFE.')) return;
    api(`/api/pets/${petId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'SAFE' }),
    }).then((res) => {
      showToast(res.message || 'Pet marked as SAFE!', 'success');
      router.navigate(state.currentRoute);
    });
    return;
  }

  // Open activation modal
  document.getElementById('lostPetId').value = petId;
  document.getElementById('lostLocation').value = '';
  document.getElementById('lostCircumstances').value = '';
  openModal('modalLostMode');
}

async function confirmActivateLostMode() {
  const petId = document.getElementById('lostPetId').value;
  const lastSeenLocation = document.getElementById('lostLocation').value.trim();
  const lastSeenDate = document.getElementById('lostDateTime').value || new Date().toISOString();
  const circumstances = document.getElementById('lostCircumstances').value.trim();

  if (!lastSeenLocation) {
    showToast('Please specify the location last seen.', 'warning');
    return;
  }

  try {
    const res = await api(`/api/pets/${petId}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'LOST',
        lastSeenLocation,
        lastSeenDate,
        circumstances,
      }),
    });
    closeModal('modalLostMode');
    showToast(res.message || 'Lost Pet Alert activated!', 'success');
    router.navigate(state.currentRoute);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// HEALTH RECORD ACTIONS & MODAL
// ==========================================================================

function openAddHealthModal() {
  populateHealthPetSelect();
  document.getElementById('healthEditId').value = '';
  document.getElementById('healthForm').reset();
  document.getElementById('healthCategory').value = 'VACCINATION';
  document.getElementById('healthDate').value = new Date().toISOString().split('T')[0];
  adjustHealthFormCategory();
  openModal('modalHealth');
}

function openAddVaccineModal() {
  openAddHealthModal();
  document.getElementById('healthCategory').value = 'VACCINATION';
  adjustHealthFormCategory();
}

function populateHealthPetSelect() {
  const select = document.getElementById('healthPetSelect');
  if (!select) return;
  select.innerHTML = state.pets.map((p) => `<option value="${p._id}">${escapeHtml(p.name)} (${p.species})</option>`).join('');
}

function adjustHealthFormCategory() {
  const cat = document.getElementById('healthCategory').value;
  const grpDueDate = document.getElementById('grpDueDate');
  const grpVetClinic = document.getElementById('grpVetClinic');
  const grpDosage = document.getElementById('grpDosage');
  const grpWeightVal = document.getElementById('grpWeightVal');
  const grpCompletedCheck = document.getElementById('grpCompletedCheck');

  grpDueDate.style.display = cat === 'VACCINATION' || cat === 'VET_VISIT' ? 'block' : 'none';
  grpVetClinic.style.display = cat !== 'WEIGHT' ? 'block' : 'none';
  grpDosage.style.display = cat === 'MEDICATION' ? 'block' : 'none';
  grpWeightVal.style.display = cat === 'WEIGHT' ? 'block' : 'none';
  grpCompletedCheck.style.display = cat === 'VACCINATION' ? 'block' : 'none';
}

async function handleHealthSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveHealth');
  btn.disabled = true;

  const petId = document.getElementById('healthPetSelect').value;
  const category = document.getElementById('healthCategory').value;
  const title = document.getElementById('healthTitle').value.trim();
  const date = document.getElementById('healthDate').value;
  const dueDate = document.getElementById('healthDueDate').value || undefined;
  const vetClinic = document.getElementById('healthClinic').value.trim();
  const dosageInstructions = document.getElementById('healthDosage').value.trim();
  const weightValue = document.getElementById('healthWeightVal').value || undefined;
  const isCompleted = document.getElementById('healthIsCompleted').checked;
  const notes = document.getElementById('healthNotes').value.trim();

  try {
    const res = await api('/api/health', {
      method: 'POST',
      body: JSON.stringify({
        petId,
        category,
        title,
        date,
        dueDate,
        vetClinic,
        dosageInstructions,
        weightValue,
        isCompleted,
        notes,
      }),
    });

    closeModal('modalHealth');
    showToast(res.message || 'Health record saved!', 'success');
    if (state.currentRoute === '#health') await renderHealth();
    else await renderDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ==========================================================================
// REAL-TIME NOTIFICATIONS CONTROLLER (POLLING + CHIME + DESKTOP ALERTS)
// ==========================================================================

let notificationPollInterval = null;
const announcedNotificationIds = new Set();
let isInitialNotificationLoad = true;

// Web Audio API chime generator (plays instantly on any modern browser)
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Arpeggiated soft chime: D5 -> A5
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // Non-blocking if audio blocked by autoplay policies
  }
}

async function loadNotifications(isBackgroundPoll = false) {
  if (!state.currentUser) return;
  try {
    const data = await api('/api/notifications');
    const newNotifications = data.notifications || [];
    const unread = data.unreadCount || 0;

    // Detect newly arrived notifications
    if (isBackgroundPoll && !isInitialNotificationLoad) {
      for (const n of newNotifications) {
        const notifId = String(n._id || n.id);
        if (!n.isRead && !announcedNotificationIds.has(notifId)) {
          // Play audible chime
          playNotificationChime();

          // Show prominent Toast alert
          showToast(`🔔 ${n.title}: ${n.message}`, 'info');

          // Browser native desktop notification if permitted
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`PetCare Passport: ${n.title}`, {
                body: n.message,
              });
            } catch (err) {}
          }
        }
      }
    }

    // Record all fetched IDs
    for (const n of newNotifications) {
      announcedNotificationIds.add(String(n._id || n.id));
    }
    isInitialNotificationLoad = false;

    state.notifications = newNotifications;

    // Update navbar bell badge
    const badge = document.getElementById('unreadNotifBadge');
    if (badge) {
      if (unread > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = unread;
      } else {
        badge.style.display = 'none';
      }
    }

    // Update flyout badge if present
    const flyoutBadge = document.getElementById('flyoutUnreadBadge');
    if (flyoutBadge) {
      if (unread > 0) {
        flyoutBadge.style.display = 'inline-block';
        flyoutBadge.innerText = unread;
      } else {
        flyoutBadge.style.display = 'none';
      }
    }

    // If flyout is currently open, dynamically update items
    const flyout = document.getElementById('notificationsFlyout');
    if (flyout && flyout.style.display === 'block') {
      renderNotificationsList();
    }
  } catch (err) {
    if (!isBackgroundPoll) console.error('Failed to load notifications:', err);
  }
}

function startNotificationPolling() {
  if (notificationPollInterval) clearInterval(notificationPollInterval);
  notificationPollInterval = setInterval(() => {
    if (state.currentUser) {
      loadNotifications(true);
    }
  }, 3500);
}

function stopNotificationPolling() {
  if (notificationPollInterval) {
    clearInterval(notificationPollInterval);
    notificationPollInterval = null;
  }
}

async function triggerTestNotification() {
  try {
    await api('/api/notifications/test', {
      method: 'POST',
      body: JSON.stringify({
        title: '🔔 Live Notification Verified',
        message: `Real-time alerts active and received at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}!`,
      }),
    });
    playNotificationChime();
    showToast('Test notification dispatched and received!', 'success');
    await loadNotifications(false);
    renderNotificationsList();
  } catch (err) {
    showToast('Failed to trigger test notification: ' + err.message, 'error');
  }
}

function requestDesktopNotifications() {
  if (!('Notification' in window)) {
    showToast('Desktop notifications are not supported in your browser.', 'warning');
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === 'granted') {
      showToast('Desktop notification alerts enabled!', 'success');
      try {
        new Notification('PetCare Passport Alerts Enabled', {
          body: 'You will receive desktop alerts when emergency scans or reports occur.',
        });
      } catch (e) {}
    } else {
      showToast('Notification permission: ' + perm, 'info');
    }
  });
}

function toggleNotifications(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  const flyout = document.getElementById('notificationsFlyout');
  if (!flyout) return;

  const isVisible = flyout.style.display === 'block';
  if (isVisible) {
    flyout.style.display = 'none';
    return;
  }

  flyout.style.display = 'block';

  const btn = document.getElementById('btnNotification');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    flyout.style.top = `${Math.round(rect.bottom + 8)}px`;
    const rightOffset = Math.max(16, window.innerWidth - rect.right);
    flyout.style.right = `${rightOffset}px`;
  }

  if (!state.currentUser) {
    const container = document.getElementById('notificationsList');
    if (container) {
      container.innerHTML = `
        <div style="text-align:center; padding:28px 16px;">
          <div style="font-size:2rem; margin-bottom:10px;">🔔</div>
          <div style="font-weight:700; color:var(--text-main); margin-bottom:6px; font-size:0.95rem;">Sign in to view notifications</div>
          <div style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:16px; line-height:1.45;">
            Real-time passport scan alerts and community sighting reports will appear here when you sign in.
          </div>
          <button class="btn btn-primary btn-sm" onclick="openAuthModal(); document.getElementById('notificationsFlyout').style.display='none';">Sign In Now</button>
        </div>
      `;
    }
    return;
  }

  renderNotificationsList();
  loadNotifications(false).then(() => {
    renderNotificationsList();
  });
}

function renderNotificationsList() {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  if (state.notifications.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:28px 16px; color:var(--text-secondary);">
        <i data-lucide="bell-off" style="width:28px;height:28px;margin-bottom:8px;opacity:0.5;display:inline-block;"></i>
        <div style="font-size:0.88rem; font-weight:600; color:var(--text-main); margin-bottom:4px;">All caught up!</div>
        <div style="font-size:0.8rem;">No unread notifications at this time.</div>
      </div>
    `;
    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons({ root: container });
    }
    return;
  }

  container.innerHTML = state.notifications
    .map(
      (n) => `
    <div style="padding:10px 12px; border-radius:var(--radius-md); background:${n.isRead ? 'transparent' : 'var(--bg-surface-soft)'}; border:1px solid ${n.isRead ? 'var(--border-subtle)' : 'var(--border-color)'}; margin-bottom:8px; cursor:pointer; transition:background 0.15s ease;" onclick="clickNotification('${n._id || n.id}', '${n.link || ''}')">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          ${!n.isRead ? '<span style="width:8px; height:8px; border-radius:50%; background:var(--gold-primary); display:inline-block; flex-shrink:0;"></span>' : ''}
          <strong style="font-size:0.86rem; color:var(--text-main);">${escapeHtml(n.title)}</strong>
        </div>
        <span style="font-size:0.7rem; color:var(--text-muted); flex-shrink:0;">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px; line-height:1.4; margin-bottom:0;">${escapeHtml(n.message)}</p>
    </div>
  `
    )
    .join('');

  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons({ root: container });
  }
}

async function clickNotification(id, link) {
  try {
    await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
    await loadNotifications(false);
    document.getElementById('notificationsFlyout').style.display = 'none';
    if (link) router.navigate(link);
  } catch (err) {
    console.error(err);
  }
}

async function markAllNotificationsRead() {
  try {
    await api('/api/notifications/read-all', { method: 'PATCH' });
    showToast('All notifications marked as read.', 'info');
    await loadNotifications(false);
    renderNotificationsList();
  } catch (err) {
    console.error(err);
  }
}

// Demo data seeding
async function seedDemoData() {
  try {
    const res = await api('/api/auth/seed-demo', { method: 'POST' });
    showToast('Sample demo pets (Bruno, Luna, Milo) loaded successfully!', 'success');
    await renderDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Modal helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    refreshIcons();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
  if (modalId === 'modalOtpVerify') {
    if (otpState.expiryTimer) {
      clearInterval(otpState.expiryTimer);
      otpState.expiryTimer = null;
    }
    if (otpState.cooldownTimer) {
      clearInterval(otpState.cooldownTimer);
      otpState.cooldownTimer = null;
    }
  }
}

// Close notifications flyout on click outside
window.addEventListener('click', (e) => {
  const flyout = document.getElementById('notificationsFlyout');
  const btn = document.getElementById('btnNotification');
  if (flyout && flyout.style.display === 'block') {
    if (btn && (btn === e.target || btn.contains(e.target) || (e.target.closest && e.target.closest('#btnNotification')))) {
      return;
    }
    if (flyout && (flyout === e.target || flyout.contains(e.target) || (e.target.closest && e.target.closest('#notificationsFlyout')))) {
      return;
    }
    flyout.style.display = 'none';
  }
});

// App Initialization
window.addEventListener('DOMContentLoaded', async () => {
  setupOtpDigitInputs();
  await checkCurrentUser();

  // Support direct URL path e.g. /emergency/PET-XXXX as well as hash #emergency/PET-XXXX
  let initialRoute = window.location.hash;
  if (!initialRoute && window.location.pathname.startsWith('/emergency/')) {
    const code = window.location.pathname.replace(/^\/emergency\//, '').split('/')[0];
    if (code) {
      initialRoute = `#emergency/${code}`;
    }
  }

  const destination = initialRoute || '#dashboard';
  await router.navigate(destination);

  window.addEventListener('hashchange', () => {
    router.navigate(window.location.hash);
  });
});
