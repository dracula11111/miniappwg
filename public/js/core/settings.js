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
    const policySheet = document.getElementById('settingsPolicySheet');
    const policyPanel = policySheet?.querySelector('.wt-terms-sheet__panel');
    const policyBackdrop = document.getElementById('settingsPolicyBackdrop');
    const policyCloseBtn = document.getElementById('settingsPolicyCloseBtn');
    const policyTitleEl = document.getElementById('settingsPolicyTitle');
    const policyBodyEl = document.getElementById('settingsPolicyBody');
    const SUPPORT_URL = 'https://t.me/wildgift_support';
  
    // ====== STATE ======
    let isOpen = false;
    let swipeStartY = 0;
    let swipeCurrentY = 0;
    let isSwiping = false;
    let currentLang = String(
      window.WT?.i18n?.getLanguage?.() || localStorage.getItem('wt-language') || 'en'
    ).toLowerCase().startsWith('ru') ? 'ru' : 'en';
    let isPolicyOpen = false;
    let policyHideTimer = 0;
    let flagSwitchSwapTimer = 0;
    let flagSwitchCleanupTimer = 0;
    let flagSwitchToken = 0;
    const prefersReducedMotion = (() => {
      try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
    })();
    const isIOSLike = (() => {
      try {
        const ua = String(navigator?.userAgent || '');
        const byDevice = /iPad|iPhone|iPod/i.test(ua);
        const byDesktopMode = navigator?.platform === 'MacIntel' && Number(navigator?.maxTouchPoints || 0) > 1;
        return byDevice || byDesktopMode;
      } catch {
        return false;
      }
    })();
  
    // ====== FLAG FORMAT DETECTION ======
    // Определяем лучший формат для браузера
    const FLAG_FORMAT = (() => {
      // Проверяем поддержку WebP
      const canvas = document.createElement('canvas');
      if (canvas.getContext && canvas.getContext('2d')) {
        const supportsWebP = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        if (supportsWebP) return 'webp';
      }
      
      // Fallback: SVG files exist in /icons and are always supported.
      return 'svg';
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

    function t(key, fallback = '') {
      return window.WT?.i18n?.t?.(key, fallback) || fallback;
    }

    function syncCurrentLangFromState() {
      const fromI18n = window.WT?.i18n?.getLanguage?.();
      currentLang = String(fromI18n || currentLang || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
    }

    const POLICY_DOCS = {
      en: {
        title: 'WildGift Privacy Policy & Terms',
        closeLabel: 'Close',
        closeAriaLabel: 'Close privacy policy',
        backdropAriaLabel: 'Close privacy policy',
        html: `
          <section class="wt-terms-sheet__section">
            <h3>Legal Notice</h3>
            <p>Last updated: April 11, 2026.</p>
            <p>This document combines the Terms of Use and Privacy Policy for WildGift.</p>
            <p>By accessing or using WildGift, you confirm that you have read and accepted this document. If you do not agree, please stop using the service.</p>
            <p>Telegram is used as a platform and sign-in method. Telegram operates under separate legal terms and privacy rules.</p>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>1. Eligibility and User Responsibility</h3>
            <ul>
              <li>You must be at least 18 years old, or the age of majority in your jurisdiction.</li>
              <li>You are responsible for ensuring your use of WildGift is lawful where you are located.</li>
              <li>You are responsible for your own account actions, device security, and compliance obligations.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>2. Service Scope</h3>
            <ul>
              <li>WildGift provides digital goods and entertainment functionality inside its app ecosystem.</li>
              <li>WildGift is not a bank, payment institution, exchange, broker, or investment advisor.</li>
              <li>Any in-app mechanics are entertainment features and do not guarantee financial outcomes.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>3. Account, Access, and Security</h3>
            <ul>
              <li>Authentication may rely on Telegram account data.</li>
              <li>You must keep your device and account access secure.</li>
              <li>If you suspect unauthorized access, contact support without delay.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>4. Pricing, Payments, and Delivery</h3>
            <ul>
              <li>Prices and availability may change before payment confirmation.</li>
              <li>Payments may be processed by third-party providers that apply their own billing rules.</li>
              <li>Delivery is typically automatic after successful payment but may be delayed by technical or provider-related issues.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>5. Refunds and Cancellations</h3>
            <ul>
              <li>Unless mandatory law requires otherwise, delivered digital goods are non-refundable.</li>
              <li>If delivery fails due to a verified technical issue on our side, we may offer redelivery, account credit, or refund where appropriate.</li>
              <li>Chargeback abuse, fraud attempts, or policy violations may result in account restrictions.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>6. Prohibited Conduct</h3>
            <ul>
              <li>Fraud, abuse, money laundering, sanctions evasion, and other unlawful conduct are prohibited.</li>
              <li>Reverse engineering, unauthorized automation, and attempts to bypass safeguards are prohibited.</li>
              <li>We may suspend or terminate access for security, legal, or policy reasons.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>7. Disclaimer and Limitation of Liability</h3>
            <ul>
              <li>The service is provided on an "as is" and "as available" basis, without warranties of uninterrupted operation or error-free performance.</li>
              <li>To the maximum extent permitted by applicable law, WildGift is not liable for indirect, incidental, special, consequential, punitive, or lost-profit damages.</li>
              <li>To the maximum extent permitted by law, WildGift's aggregate liability is limited to the amounts you paid to WildGift in the 3 months before the relevant claim, or the minimum amount required by applicable law.</li>
              <li>Information in the app is provided for general informational purposes only and does not constitute legal, tax, investment, or financial advice.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>8. Third-Party Services</h3>
            <p>WildGift may integrate third-party services (including Telegram and payment processors). Those services are governed by their own terms and privacy documents, and WildGift is not responsible for third-party operations, downtime, or policy decisions.</p>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>9. Data We Collect</h3>
            <ul>
              <li>Profile and account identifiers used for authentication and account operations.</li>
              <li>Transaction metadata, order states, delivery records, and support interactions.</li>
              <li>Technical logs, device details, connection metadata, and anti-abuse signals.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>10. Why We Process Data</h3>
            <ul>
              <li>To provide core product functionality and maintain your account.</li>
              <li>To process purchases, delivery operations, and support requests.</li>
              <li>To protect users, detect abuse, and preserve platform integrity.</li>
              <li>To satisfy accounting, legal, and compliance obligations.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>11. Data Sharing and International Transfers</h3>
            <ul>
              <li>Data may be shared with infrastructure, payment, and support providers on a need-to-know basis.</li>
              <li>Data may be disclosed when required by law, court order, or lawful authority request.</li>
              <li>In case of merger, acquisition, or restructuring, data may be transferred subject to appropriate safeguards.</li>
              <li>Cross-border data processing may occur with contractual, technical, and organizational protections.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>12. Retention and Security</h3>
            <ul>
              <li>Data is retained only for as long as necessary for business, legal, and security purposes.</li>
              <li>We apply technical and organizational safeguards proportionate to risk.</li>
              <li>No digital system can be guaranteed as 100% secure.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>13. Your Privacy Rights</h3>
            <p>Where required by applicable law, you may request access, correction, deletion, restriction, or portability of your personal data. To submit a request, contact support.</p>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>14. Policy Updates and Contact</h3>
            <p>We may update this document from time to time to reflect product, legal, or compliance changes. The latest version is published in the app. Continued use of WildGift after updates means acceptance of the updated version.</p>
            <p>Support contact: <a href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer">WildGift Support</a>.</p>
          </section>
        `
      },
      ru: {
        title: 'Политика конфиденциальности и условия WildGift',
        closeLabel: 'Закрыть',
        closeAriaLabel: 'Закрыть политику конфиденциальности',
        backdropAriaLabel: 'Закрыть политику конфиденциальности',
        html: `
          <section class="wt-terms-sheet__section">
            <h3>Юридическое уведомление</h3>
            <p>Дата последнего обновления: 11 апреля 2026 г.</p>
            <p>Настоящий документ объединяет Условия использования и Политику конфиденциальности сервиса WildGift.</p>
            <p>Используя WildGift, вы подтверждаете, что ознакомились с документом и принимаете его условия. Если вы не согласны, прекратите использование сервиса.</p>
            <p>Telegram используется как платформа и способ авторизации. У Telegram действуют отдельные правила и политика конфиденциальности.</p>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>1. Допуск к сервису и ответственность пользователя</h3>
            <ul>
              <li>Вы должны быть не моложе 18 лет либо возраста совершеннолетия в вашей юрисдикции.</li>
              <li>Вы самостоятельно отвечаете за законность использования WildGift в вашем регионе.</li>
              <li>Вы несете ответственность за действия в аккаунте, безопасность устройства и соблюдение применимых требований.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>2. Характер сервиса</h3>
            <ul>
              <li>WildGift предоставляет цифровые товары и развлекательный функционал в экосистеме приложения.</li>
              <li>WildGift не является банком, платежной организацией, биржей, брокером или инвестиционным консультантом.</li>
              <li>Игровые механики и визуальные эффекты являются элементами развлечения и не гарантируют финансовый результат.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>3. Аккаунт, доступ и безопасность</h3>
            <ul>
              <li>Авторизация может выполняться через учетную запись Telegram.</li>
              <li>Вы обязаны обеспечивать безопасность устройства и доступа к аккаунту.</li>
              <li>При подозрении на несанкционированный доступ незамедлительно обратитесь в поддержку.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>4. Цены, платежи и доставка</h3>
            <ul>
              <li>Цены и доступность могут изменяться до подтверждения платежа.</li>
              <li>Платежи могут обрабатываться сторонними провайдерами, применяющими собственные правила биллинга.</li>
              <li>Доставка обычно выполняется автоматически после успешной оплаты, но может задерживаться по техническим причинам или из-за внешних провайдеров.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>5. Возвраты и отмены</h3>
            <ul>
              <li>Если иное не требуется императивными нормами права, доставленные цифровые товары не подлежат возврату.</li>
              <li>Если доставка не состоялась по подтвержденной технической причине на нашей стороне, мы можем предложить повторную доставку, зачисление на баланс или возврат, когда это применимо.</li>
              <li>Злоупотребление чарджбэками, попытки мошенничества и нарушения правил могут привести к ограничениям доступа.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>6. Запрещенное поведение</h3>
            <ul>
              <li>Запрещены мошенничество, злоупотребления, отмывание средств, обход санкций и иная противоправная деятельность.</li>
              <li>Запрещены реверс-инжиниринг, несанкционированная автоматизация и попытки обхода защитных механизмов.</li>
              <li>Мы вправе ограничить или прекратить доступ по причинам безопасности, правового риска или нарушения правил.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>7. Отказ от гарантий и ограничение ответственности</h3>
            <ul>
              <li>Сервис предоставляется по принципу "как есть" и "по мере доступности", без гарантий бесперебойной работы и отсутствия ошибок.</li>
              <li>В максимально допустимой применимым законодательством степени WildGift не несет ответственности за косвенные, случайные, специальные, штрафные, последующие убытки или упущенную выгоду.</li>
              <li>В максимально допустимой законом степени совокупная ответственность WildGift ограничивается суммой платежей пользователя в адрес WildGift за 3 месяца, предшествующие событию, либо минимальным объемом ответственности, который нельзя исключить по закону.</li>
              <li>Информация в приложении носит общий информационный характер и не является юридической, налоговой, инвестиционной или финансовой консультацией.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>8. Сторонние сервисы</h3>
            <p>WildGift может использовать сторонние сервисы (включая Telegram и платежных провайдеров). Такие сервисы регулируются их собственными документами, и WildGift не отвечает за их политику, работоспособность и решения.</p>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>9. Какие данные мы собираем</h3>
            <ul>
              <li>Идентификаторы профиля и аккаунта, необходимые для авторизации и работы сервиса.</li>
              <li>Метаданные транзакций, статусы заказов, сведения о доставке и обращения в поддержку.</li>
              <li>Технические логи, данные устройства, параметры соединения и антифрод-сигналы.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>10. Цели обработки данных</h3>
            <ul>
              <li>Предоставление основного функционала и обслуживание аккаунта.</li>
              <li>Обработка покупок, доставка цифровых товаров и поддержка пользователей.</li>
              <li>Защита пользователей, предотвращение злоупотреблений и обеспечение стабильности платформы.</li>
              <li>Выполнение бухгалтерских, правовых и комплаенс-обязательств.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>11. Передача данных и трансграничная обработка</h3>
            <ul>
              <li>Данные могут передаваться инфраструктурным, платежным и сервисным подрядчикам в объеме, необходимом для выполнения задач.</li>
              <li>Данные могут раскрываться при наличии требований закона, судебного акта или запроса уполномоченного органа.</li>
              <li>В случае слияния, приобретения или иной реорганизации данные могут быть переданы с применением разумных мер защиты.</li>
              <li>Трансграничная обработка данных может осуществляться с договорными, техническими и организационными гарантиями.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>12. Срок хранения и безопасность</h3>
            <ul>
              <li>Данные хранятся только в течение срока, необходимого для операционных, правовых и защитных целей.</li>
              <li>Мы применяем технические и организационные меры безопасности, соразмерные рискам.</li>
              <li>Ни одна цифровая система не может гарантировать абсолютную (100%) защищенность.</li>
            </ul>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>13. Ваши права в отношении персональных данных</h3>
            <p>Если это предусмотрено применимым законодательством, вы можете запросить доступ, исправление, удаление, ограничение обработки или перенос данных. Для запроса свяжитесь с поддержкой.</p>
          </section>
          <section class="wt-terms-sheet__section">
            <h3>14. Изменения документа и контакты</h3>
            <p>Мы можем обновлять документ при изменении продукта, правовых требований или комплаенс-процессов. Актуальная версия всегда публикуется в приложении. Продолжение использования WildGift после обновления означает принятие новой редакции.</p>
            <p>Контакт поддержки: <a href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer">Поддержка WildGift</a>.</p>
          </section>
        `
      }
    };

    function getPolicyDoc() {
      return currentLang === 'ru' ? POLICY_DOCS.ru : POLICY_DOCS.en;
    }

    function renderPolicyContent() {
      if (!policySheet) return;
      const policy = getPolicyDoc();

      if (policyTitleEl) {
        policyTitleEl.textContent = policy.title;
      }
      if (policyCloseBtn) {
        policyCloseBtn.textContent = policy.closeLabel;
        policyCloseBtn.setAttribute('aria-label', policy.closeAriaLabel);
      }
      if (policyBackdrop) {
        policyBackdrop.setAttribute('aria-label', policy.backdropAriaLabel);
      }
      if (policyBodyEl) {
        policyBodyEl.innerHTML = policy.html;
      }
    }

    function openPolicySheet() {
      if (!policySheet) return;
      if (policyHideTimer) {
        clearTimeout(policyHideTimer);
        policyHideTimer = 0;
      }

      renderPolicyContent();
      closeSheet();

      isPolicyOpen = true;
      policySheet.hidden = false;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('wt-terms-open');
      window.requestAnimationFrame(() => {
        policySheet.classList.add('is-open');
        policyPanel?.focus();
      });
    }

    function closePolicySheet() {
      if (!policySheet || !isPolicyOpen) return;

      isPolicyOpen = false;
      policySheet.classList.remove('is-open');
      document.body.classList.remove('wt-terms-open');
      if (!isOpen) {
        document.body.style.overflow = '';
      }
      policyHideTimer = window.setTimeout(() => {
        if (!isPolicyOpen) {
          policySheet.hidden = true;
        }
      }, 260);
    }

    function openSupportLink() {
      const url = SUPPORT_URL;
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

    if (policyCloseBtn) {
      policyCloseBtn.addEventListener('click', closePolicySheet);
    }

    if (policyBackdrop) {
      policyBackdrop.addEventListener('click', closePolicySheet);
    }

    if (policySheet) {
      policySheet.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePolicySheet();
        }
      });
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
      return `/icons/flags/${flagName}.${FLAG_FORMAT}`;
    }

    function clearFlagSwitchTimers() {
      if (flagSwitchSwapTimer) {
        clearTimeout(flagSwitchSwapTimer);
        flagSwitchSwapTimer = 0;
      }
      if (flagSwitchCleanupTimer) {
        clearTimeout(flagSwitchCleanupTimer);
        flagSwitchCleanupTimer = 0;
      }
    }
  
    function updateLanguageDisplay() {
      if (!languageSwitcher) return;
      
      const valueEl = languageSwitcher.querySelector('.settings-item__value');
      const flagImg = languageSwitcher.querySelector('.settings-flag-img');
      
      if (valueEl) {
        valueEl.textContent = currentLang === 'en'
          ? t('language_english', 'English')
          : t('language_russian', 'Русский');
      }
      
      // Update flag with swap animation
      if (flagImg) {
        const flagSrc = getFlagPath(currentLang);
        const altText = currentLang === 'en' ? 'English Flag' : 'Russian Flag';
        const translatedAlt = window.WT?.i18n?.translate?.(altText) || altText;
        const immediateSwap = prefersReducedMotion || isIOSLike;

        clearFlagSwitchTimers();
        flagSwitchToken += 1;

        if (immediateSwap) {
          flagImg.classList.remove('flag-switching');
          if (flagImg.src !== flagSrc) flagImg.src = flagSrc;
          flagImg.alt = translatedAlt;
          return;
        }

        const token = flagSwitchToken;
        flagImg.classList.remove('flag-switching');
        // Restart CSS animation reliably.
        void flagImg.offsetWidth;
        flagImg.classList.add('flag-switching');

        flagSwitchSwapTimer = setTimeout(() => {
          if (token !== flagSwitchToken) return;
          if (flagImg.src !== flagSrc) flagImg.src = flagSrc;
          flagImg.alt = translatedAlt;
        }, 120);

        flagSwitchCleanupTimer = setTimeout(() => {
          if (token !== flagSwitchToken) return;
          flagImg.classList.remove('flag-switching');
        }, 320);
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
        const nextLang = currentLang === 'ru' ? 'en' : 'ru';
        if (window.WT?.changeLanguage) {
          currentLang = window.WT.changeLanguage(nextLang);
        } else {
          currentLang = nextLang;
          try { localStorage.setItem('wt-language', currentLang); } catch {}
        }

        updateLanguageDisplay();
        
        haptic('light');
        
        console.log('[Settings] Language changed to:', currentLang);
      });
    }

    window.addEventListener('language:changed', (event) => {
      const lang = String(event?.detail?.language || '').toLowerCase();
      if (!lang) return;
      const nextLang = lang.startsWith('ru') ? 'ru' : 'en';
      if (nextLang === currentLang) {
        if (isPolicyOpen) renderPolicyContent();
        return;
      }
      currentLang = nextLang;
      updateLanguageDisplay();
      if (isPolicyOpen) renderPolicyContent();
    });
  
    // ====== CLICKABLE ITEMS ======
  
    document.querySelectorAll('.settings-item--clickable').forEach(item => {
      if (item.id === 'languageSwitcher') return;
      
      item.addEventListener('click', () => {
        haptic('light');
        
        if (item.id === 'supportItem') {
          console.log('[Settings] Support clicked');
          openSupportLink();
        } else if (item.id === 'aboutItem') {
          console.log('[Settings] Privacy policy clicked');
          openPolicySheet();
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
      if (e.key !== 'Escape') return;

      if (isPolicyOpen) {
        closePolicySheet();
        return;
      }

      if (isOpen) {
        closeSheet();
      }
    });
  
    // ====== INIT ======
  
    function init() {
      console.log('[Settings] Initializing settings module');
      
      updateUserAvatar();
      syncCurrentLangFromState();
      updateLanguageDisplay();
      renderPolicyContent();
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
      openPolicy: openPolicySheet,
      closePolicy: closePolicySheet,
      isOpen: () => isOpen,
      isPolicyOpen: () => isPolicyOpen,
      currentLanguage: () => currentLang,
      flagFormat: () => FLAG_FORMAT
    };
  
    console.log('[Settings] Settings module loaded');
  })();
