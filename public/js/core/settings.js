// /public/js/settings.js - ANIMATED FLAGS SUPPORT

(() => {
    const tg = window.Telegram?.WebApp;
  
    // ====== DOM ELEMENTS ======
    const burgerBtn = document.getElementById('burgerBtn');
    const userAvatarBtn = document.getElementById('userAvatarBtn');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const settingsSheet = document.getElementById('settingsSheet');
    const settingsCloseBtn = document.getElementById('settingsCloseBtn');
    const settingsBackdrop = settingsSheet?.querySelector('.settings-sheet__backdrop');
    const settingsPanel = settingsSheet?.querySelector('.settings-sheet__panel');
    const settingsHandle = settingsSheet?.querySelector('.settings-sheet__handle');
    const languageSwitcher = document.getElementById('languageSwitcher');
  
    // ====== STATE ======
    let isOpen = false;
    let swipeStartY = 0;
    let swipeCurrentY = 0;
    let isSwiping = false;
    let currentLang = localStorage.getItem('wt-language') || 'en';
  
    // ====== FLAG FORMAT DETECTION ======
    // Определяем лучший формат для браузера
    const FLAG_FORMAT = (() => {
      // Проверяем поддержку WebP
      const canvas = document.createElement('canvas');
      if (canvas.getContext && canvas.getContext('2d')) {
        const supportsWebP = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        if (supportsWebP) return 'webp';
      }
      
      // Используем APNG (поддерживается почти везде)
      return 'apng';
    })();
  
    console.log('[Settings] Using flag format:', FLAG_FORMAT);
  
    // ====== UTILITIES ======
  
    function getTelegramUser() {
      if (!tg?.initDataUnsafe?.user) {
        return {
          id: null,
          firstName: 'Guest',
          photoUrl: null
        };
      }
  
      const user = tg.initDataUnsafe.user;
      return {
        id: user.id,
        firstName: user.first_name || 'User',
        photoUrl: user.photo_url || null
      };
    }
  
    function haptic(type = 'light') {
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(type);
      }
    }

    function openSupportLink() {
      const url = 'https://t.me/wildgift_support';
      closeSheet();

      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
        return;
      }

      if (tg?.openLink) {
        tg.openLink(url);
        return;
      }

      window.open(url, '_blank', 'noopener');
    }
  
    // ====== OPEN/CLOSE ======
  
    function openSheet() {
      if (isOpen || !settingsSheet) return;
      
      isOpen = true;
      settingsSheet.classList.add('settings-sheet--open');
      burgerBtn?.classList.add('active');
      document.body.style.overflow = 'hidden';
      
      haptic('light');
      
      console.log('[Settings] Sheet opened');
    }
  
    function closeSheet() {
      if (!isOpen || !settingsSheet) return;
      
      isOpen = false;
      settingsSheet.classList.remove('settings-sheet--open');
      burgerBtn?.classList.remove('active');
      document.body.style.overflow = '';
      
      haptic('light');
      
      console.log('[Settings] Sheet closed');
    }
  
    // ====== SWIPE TO CLOSE ======
  
    function handleTouchStart(e) {
      if (!isOpen) return;
      swipeStartY = e.touches[0].clientY;
      isSwiping = false;
    }
  
    function handleTouchMove(e) {
      if (!isOpen || !settingsPanel) return;
      
      swipeCurrentY = e.touches[0].clientY;
      const delta = swipeCurrentY - swipeStartY;
      
      if (delta > 0) {
        isSwiping = true;
        settingsPanel.classList.add('swiping');
        
        const resistance = 0.8;
        settingsPanel.style.transform = `translateY(${delta * resistance}px)`;
        
        if (settingsBackdrop) {
          const opacity = Math.max(0, 1 - (delta / 300));
          settingsBackdrop.style.opacity = opacity;
        }
      }
    }
  
    function handleTouchEnd() {
      if (!isOpen || !isSwiping || !settingsPanel) return;
      
      const delta = swipeCurrentY - swipeStartY;
      settingsPanel.classList.remove('swiping');
      
      if (delta > 100) {
        closeSheet();
      } else {
        settingsPanel.style.transform = '';
        if (settingsBackdrop) {
          settingsBackdrop.style.opacity = '';
        }
      }
      
      isSwiping = false;
      swipeStartY = 0;
      swipeCurrentY = 0;
    }
  
    // ====== EVENT LISTENERS ======
  
    if (burgerBtn) {
      burgerBtn.addEventListener('click', () => {
        if (isOpen) {
          closeSheet();
        } else {
          openSheet();
        }
      });
    }
  
    if (settingsCloseBtn) {
      settingsCloseBtn.addEventListener('click', closeSheet);
    }
  
    if (settingsBackdrop) {
      settingsBackdrop.addEventListener('click', closeSheet);
    }
  
    if (settingsPanel) {
      settingsPanel.addEventListener('touchstart', handleTouchStart, { passive: true });
      settingsPanel.addEventListener('touchmove', handleTouchMove, { passive: true });
      settingsPanel.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  
    if (settingsHandle) {
      settingsHandle.addEventListener('touchstart', handleTouchStart, { passive: true });
    }
  
    if (userAvatarBtn) {
      userAvatarBtn.addEventListener('click', () => {
        console.log('[Settings] Avatar clicked, navigating to profile');

        if (window.WT?.activatePage) {
          window.WT.activatePage('profilePage');
          haptic('light');
          return;
        }
        
        const profilePage = document.getElementById('profilePage');
        if (profilePage) {
          document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
          profilePage.classList.add('page-active');
          
          document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
          const profileNavBtn = document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]');
          if (profileNavBtn) {
            profileNavBtn.classList.add('active');
          }
  
          if (window.WT?.bus) {
            window.WT.bus.dispatchEvent(new CustomEvent('page:change', { 
              detail: { id: 'profilePage' } 
            }));
          }
  
          haptic('light');
        }
      });
    }
  
    // ====== ANIMATED FLAGS LANGUAGE SWITCHER ======
  
    function getFlagPath(lang) {
      const flagName = lang === 'en' ? 'english' : 'russian';
      return `/icons/${flagName}.${FLAG_FORMAT}`;
    }
  
    function updateLanguageDisplay() {
      if (!languageSwitcher) return;
      
      const valueEl = languageSwitcher.querySelector('.settings-item__value');
      const flagImg = languageSwitcher.querySelector('.settings-flag-img');
      
      if (valueEl) {
        valueEl.textContent = currentLang === 'en' ? 'English' : 'Русский';
      }
      
      // Update flag with swap animation
      if (flagImg) {
        // Add switching class for animation
        flagImg.classList.add('flag-switching');
        
        // Change flag image in the middle of animation
        setTimeout(() => {
          const flagSrc = getFlagPath(currentLang);
          flagImg.src = flagSrc;
          flagImg.alt = currentLang === 'en' ? 'English Flag' : 'Russian Flag';
          
          // Remove switching class after animation
          setTimeout(() => {
            flagImg.classList.remove('flag-switching');
          }, 150);
        }, 150);
      }
    }
  
    // Preload flags for smooth switching
    function preloadFlags() {
      const languages = ['en', 'ru'];
      languages.forEach(lang => {
        const img = new Image();
        img.src = getFlagPath(lang);
        console.log('[Settings] Preloaded flag:', img.src);
      });
    }
  
    if (languageSwitcher) {
      languageSwitcher.addEventListener('click', () => {
        // Toggle language
        currentLang = currentLang === 'ru' ? 'en' : 'ru';
        
        // Save to localStorage
        localStorage.setItem('wt-language', currentLang);
        
        // Update display with animation
        updateLanguageDisplay();
        
        // Apply language change
        if (window.WT?.changeLanguage) {
          window.WT.changeLanguage(currentLang);
        }
        
        haptic('light');
        
        console.log('[Settings] Language changed to:', currentLang);
      });
    }
  
    // ====== CLICKABLE ITEMS ======
  
    document.querySelectorAll('.settings-item--clickable').forEach(item => {
      if (item.id === 'languageSwitcher') return;
      
      item.addEventListener('click', () => {
        haptic('light');
        
        if (item.id === 'supportItem') {
          console.log('[Settings] Support clicked');
          openSupportLink();
        } else if (item.id === 'aboutItem') {
          console.log('[Settings] About clicked');
          if (tg?.showAlert) {
            tg.showAlert('WildGift v1.0.0\n\nA Telegram mini app for fun gaming!');
          } else {
            alert('WildGift v1.0.0\n\nA Telegram mini app for fun gaming!');
          }
        }
      });
    });
  
    // ====== UPDATE USER AVATAR ======
  
    function updateUserAvatar() {
      if (!userAvatarImg) return;
      
      const user = getTelegramUser();
      const avatarUrl = user.photoUrl || '/images/avatar-default.png';
      
      userAvatarImg.src = avatarUrl;
      userAvatarImg.onerror = () => {
        userAvatarImg.src = '/images/avatar-default.png';
      };
      
      console.log('[Settings] User avatar updated');
    }
  
    // ====== KEYBOARD SHORTCUTS ======
  
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeSheet();
      }
    });
  
    // ====== INIT ======
  
    function init() {
      console.log('[Settings] Initializing settings module');
      
      updateUserAvatar();
      updateLanguageDisplay();
      preloadFlags(); // Preload flags for smooth animation
      
      console.log('[Settings] ✅ Settings module ready');
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  
    // ====== EXPORT ======
  
    window.WTSettings = {
      open: openSheet,
      close: closeSheet,
      isOpen: () => isOpen,
      currentLanguage: () => currentLang,
      flagFormat: () => FLAG_FORMAT
    };
  
    console.log('[Settings] Settings module loaded');
  })();
