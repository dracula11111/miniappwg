// bonus-5050.js — NEW VISUAL FLOW (ticket → drums → speedup → stop → highlight → collide → boom.webp → result → fade out)
// Всё на чистом JS/CSS, без сторонних библиотек.

class Bonus5050 {
    constructor(container, options = {}) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('[Bonus5050] Container element not found');
  
      // Родитель-оверлей (чтоб уметь затемнять/прятать его правильно)
      this.overlay = this.container.closest('#bonus5050Overlay') || this.container.parentElement || document.body;
  
      this.options = {
        introPngUrl: options.introPngUrl || '/images/bets/50-50.png', // ← твоя картинка билета
        boomSvgUrl:  options.boomSvgUrl  || '/images/boom.webp',       // ← анимация взрыва
        onComplete:  options.onComplete  || (() => {}),
        duration: {
          intro:        900,  // появление билета
          fadeOutIntro: 300,  // исчезновение билета
          drumsIn:     800,   // выезд барабанов
          spinSlow:    800,   // медленное кручение (после появления)
          spinFast:    900,   // быстрое кручение
          slowdown:    900,   // замедление в точное значение
          highlight:   500,   // подсветка good/bad
          collide:     600,   // слёт навстречу
          boom:        700,   // взрыв
          resultHold:  900,   // показ результата
          overlayFade: 400    // исчезновение затемнения
        },
        // пул значений для слотов, как просил — «всё перемешано», включая 15
        valuesPool: options.valuesPool || ['1x','1.5x','2x','3x','5x','10x','15x','20x','30x']
      };
  
      // цвета
      this.colors = {
        good: '#10b981', // зелёный
        bad:  '#ef4444', // красный
        ui:   '#d9197a'  // фирменный розовый-свечения
      };
  
      // подготовка
      this._injectBaseStyles();
      this._setupStage();
    }
  
    // ==== public ====
    async start() {
      try {
        await this._showTicketIntro();
        await this._fadeOutTicket();
  
        // выбираем два результата + сторону победителя заранее
        const [leftResult, rightResult] = this._pickTwoResults();
        const winnerSide = Math.random() < 0.5 ? 'left' : 'right';
        const winnerValue = winnerSide === 'left' ? leftResult : rightResult;
        const loserValue  = winnerSide === 'left' ? rightResult : leftResult;
        const isGood = this._num(winnerValue) >= this._num(loserValue);
  
        await this._showDrums({ leftResult, rightResult });
        await this._spinSequence();             // медленно → быстро
        await this._slowdownToResults({ leftResult, rightResult });
        await this._highlight(winnerSide, isGood);
        await this._collideToCenter();
        await this._boom();
        await this._showResultBadge(winnerValue, isGood);
  
        // ВАЖНО: сначала плавно скрываем затемнение, только потом onComplete (чтобы уведомление пришло ПОСЛЕ исчезновения оверлея)
        await this._fadeOutOverlay();
        this.options.onComplete(String(winnerValue)); // строка вида "10x"
      } catch (e) {
        console.error('[Bonus5050] Error:', e);
        // на всякий случай скрыть оверлей и завершить
        try { await this._fadeOutOverlay(); } catch {}
        this.options.onComplete(null);
      }
    }
  
    // ==== internals ====
    _setupStage() {
      // оверлей — фуллскрин затемнение
      Object.assign(this.overlay.style, {
        position: 'fixed',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.95)',
        backdropFilter: 'blur(14px)',
        zIndex: 10000,
        opacity: '1',
        transition: `opacity ${this.options.duration.overlayFade}ms ease`
      });
  
      // контейнер сцены
      this.container.innerHTML = '';
      Object.assign(this.container.style, {
        position: 'relative',
        width: 'min(100vw, 900px)',
        height: 'min(100vh, 620px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      });
    }
  
    _injectBaseStyles() {
      if (document.getElementById('bonus5050-new-styles')) return;
      const s = document.createElement('style');
      s.id = 'bonus5050-new-styles';
      s.textContent = `
        @keyframes jellyIn { 0%{transform:scale(.6);opacity:0;filter:blur(12px)} 55%{transform:scale(1.08);opacity:1;filter:blur(0)} 75%{transform:scale(.96)} 100%{transform:scale(1)} }
        @keyframes fadeAway { to {opacity:0; transform:scale(.9); filter:blur(8px);} }
        @keyframes slideFromLeft { from{transform:translateX(-120%) scale(.9); opacity:0; filter:blur(8px)} to{transform:translateX(0) scale(1); opacity:1; filter:blur(0)} }
        @keyframes slideFromRight { from{transform:translateX(120%) scale(.9); opacity:0; filter:blur(8px)} to{transform:translateX(0) scale(1); opacity:1; filter:blur(0)} }
        @keyframes drumSpinSlow { from{transform:translateY(0)} to{transform:translateY(-320px)} }
        @keyframes drumSpinFast { from{transform:translateY(0)} to{transform:translateY(-960px)} }
        @keyframes collideToCenter { to { transform:translateX(var(--to,0)) scale(.8); opacity:0; filter:blur(6px) } }
        @keyframes popResult { 0%{transform:scale(0) rotate(-8deg);opacity:0;filter:blur(10px)} 55%{transform:scale(1.1) rotate(3deg);filter:blur(0)} 75%{transform:scale(.95) rotate(-1deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        .b5050-ticket img{max-width:360px; max-height:360px; filter:drop-shadow(0 18px 70px rgba(217,25,122,.8))}
        .b5050-drum{width:220px; height:300px; background:linear-gradient(145deg,#2a2a2a,#171717); border-radius:22px; position:relative; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.5)}
        .b5050-strip{position:absolute; left:0; top:0; width:100%;}
        .b5050-item{height:80px; display:flex; align-items:center; justify-content:center; font:900 50px/1.1 system-ui,sans-serif; color:#fff; text-shadow:0 0 24px rgba(255,255,255,.45)}
        .b5050-window{position:absolute; left:10px; right:10px; top:50%; height:80px; transform:translateY(-50%); border-radius:12px; border:2px solid rgba(255,255,255,.15); box-shadow: inset 0 0 0 2px rgba(0,0,0,.25), 0 0 0 0 rgba(0,0,0,0); pointer-events:none}
        .b5050-window.good{border-color:#10b981; box-shadow: inset 0 0 0 2px rgba(0,0,0,.25), 0 0 24px 4px rgba(16,185,129,.5)}
        .b5050-window.bad {border-color:#ef4444; box-shadow: inset 0 0 0 2px rgba(0,0,0,.25), 0 0 24px 4px rgba(239,68,68,.5)}
        .b5050-center{position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); pointer-events:none}
        .b5050-boom{width:420px; height:420px; display:flex; align-items:center; justify-content:center; opacity:0; transform:translate(-50%,-50%) scale(.2); transition:transform .4s ease, opacity .3s ease}
        .b5050-result{position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font:900 140px/1 system-ui,sans-serif; text-shadow:0 0 60px currentColor; opacity:0}
        .b5050-dim{position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(217,25,122,.15), rgba(0,0,0,0)); pointer-events:none}
      `;
      document.head.appendChild(s);
    }
  
    _el(tag, css = {}, className) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      Object.assign(el.style, css);
      return el;
    }
  
    _num(xStr) { return parseFloat(String(xStr).toLowerCase().replace('x','')); }
    _shuffle(arr){ return arr.map(v=>[v,Math.random()]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]); }
  
    _showTicketIntro() {
      return new Promise(res => {
        this.container.innerHTML = '';
        const wrap = this._el('div', { display:'flex', flexDirection:'column', alignItems:'center', gap:'20px', animation:`jellyIn ${this.options.duration.intro}ms cubic-bezier(.34,1.56,.64,1) forwards` }, 'b5050-ticket');
        const img  = new Image();
        img.src = this.options.introPngUrl;
        img.alt = 'Bonus Ticket';
        wrap.appendChild(img);
        this.container.appendChild(wrap);
        setTimeout(res, this.options.duration.intro);
      });
    }
  
    _fadeOutTicket() {
      return new Promise(res => {
        const ticket = this.container.querySelector('.b5050-ticket');
        if (!ticket) return res();
        ticket.style.animation = `fadeAway ${this.options.duration.fadeOutIntro}ms ease forwards`;
        setTimeout(() => { ticket.remove(); res(); }, this.options.duration.fadeOutIntro);
      });
    }
  
    _pickTwoResults() {
      const pool = this._shuffle([...this.options.valuesPool]);
      let a = pool[0], b = pool[1];
      if (!a) a = '2x'; if (!b) b = '10x';
      return [a, b];
    }
  
    _buildDrum(values, appearAnim) {
      const drum  = this._el('div', {}, 'b5050-drum');
      drum.style.animation = appearAnim;
  
      const strip = this._el('div', {}, 'b5050-strip');
      const items = [];
      // делаем 3 повтора для бесшовной прокрутки
      for (let r=0; r<3; r++){
        this._shuffle(values).forEach(v=>{
          const item = this._el('div', {}, 'b5050-item');
          item.textContent = v;
          items.push(item);
          strip.appendChild(item);
        });
      }
      drum.appendChild(strip);
  
      const windowLine = this._el('div', {}, 'b5050-window');
      drum.appendChild(windowLine);
  
      return { drum, strip, windowLine, items };
    }
  
    _showDrums({ leftResult, rightResult }) {
      return new Promise(res => {
        const mixed = this._shuffle(this.options.valuesPool);
        // контейнер барабанов
        const row = this._el('div', { display:'flex', alignItems:'center', justifyContent:'center', gap:'140px', width:'100%', height:'100%' });
  
        // левый
        const left = this._buildDrum(mixed, `slideFromLeft ${this.options.duration.drumsIn}ms cubic-bezier(.34,1.56,.64,1) forwards`);
        left.drum.dataset.result = leftResult;
  
        // правый
        const right = this._buildDrum(mixed, `slideFromRight ${this.options.duration.drumsIn}ms cubic-bezier(.34,1.56,.64,1) forwards`);
        right.drum.dataset.result = rightResult;
  
        row.appendChild(left.drum);
        row.appendChild(right.drum);
        this.container.appendChild(row);
  
        // сохраним ссылки
        this.left = left;
        this.right = right;
  
        setTimeout(res, this.options.duration.drumsIn);
      });
    }
  
    async _spinSequence() {
      // 1) медленно
      this.left.strip.style.animation  = `drumSpinSlow ${this.options.duration.spinSlow}ms linear infinite`;
      this.right.strip.style.animation = `drumSpinSlow ${this.options.duration.spinSlow}ms linear infinite`;
      await this._wait(this.options.duration.spinSlow);
  
      // 2) быстро
      this.left.strip.style.animation  = `drumSpinFast ${this.options.duration.spinFast}ms linear infinite`;
      this.right.strip.style.animation = `drumSpinFast ${this.options.duration.spinFast}ms linear infinite`;
      await this._wait(this.options.duration.spinFast);
    }
  
    _slowdownToResults({ leftResult, rightResult }) {
      // останавливаем анимацию и аккуратно доводим до нужного айтема по центру (второй блок повтора)
      const itemH = 80;
      const count = this.options.valuesPool.length;
  
      const stopOne = (side, target) => {
        const { strip, items, drum } = side;
        strip.style.animation = 'none';
        // найдём индекс целевого значения в среднем повторе
        let idx = -1;
        for (let i = 0; i < items.length; i++) {
          if (items[i].textContent === target) {
            // берём тот, что из средней трети (чтобы красиво центроваться)
            const third = Math.floor(items.length / 3);
            if (i >= third && i < 2*third) { idx = i; break; }
            if (idx === -1) idx = i; // fallback
          }
        }
        const offset = -(idx * itemH) + ((strip.parentElement.clientHeight - itemH)/2);
        strip.style.transition = `transform ${this.options.duration.slowdown}ms cubic-bezier(.25,.46,.45,.94)`;
        requestAnimationFrame(()=> strip.style.transform = `translateY(${offset}px)`);
      };
  
      stopOne(this.left,  leftResult);
      stopOne(this.right, rightResult);
  
      return this._wait(this.options.duration.slowdown);
    }
  
    _highlight(winnerSide, isGood) {
      // подсветка рамки у победителя зелёным/красным и противоположному — обратным цветом
      const good = this.colors.good, bad = this.colors.bad;
  
      const win = winnerSide === 'left' ? this.left  : this.right;
      const lose= winnerSide === 'left' ? this.right : this.left;
  
      win.windowLine.classList.add(isGood ? 'good' : 'bad');
      lose.windowLine.classList.add(isGood ? 'bad'  : 'good');
  
      return this._wait(this.options.duration.highlight);
    }
  
    _collideToCenter() {
      // оба летят навстречу (в центр) и исчезают
      const gap = 90; // px к центру
      this.left.drum.style.animation  = `collideToCenter ${this.options.duration.collide}ms cubic-bezier(.68,-.55,.265,1.55) forwards`;
      this.left.drum.style.setProperty('--to', `${gap}px`);
      this.right.drum.style.animation = `collideToCenter ${this.options.duration.collide}ms cubic-bezier(.68,-.55,.265,1.55) forwards`;
      this.right.drum.style.setProperty('--to', `-${gap}px`);
  
      return this._wait(this.options.duration.collide);
    }
  
    _boom() {
      // показываем boom.webp в центре
      let center = this.container.querySelector('.b5050-center');
      if (!center) {
        center = this._el('div', {}, 'b5050-center');
        this.container.appendChild(center);
      }
      const boom = this._el('div', {}, 'b5050-boom');
      boom.style.position = 'absolute';
      boom.style.left = '50%';
      boom.style.top  = '50%';
  
      const img = new Image();
      img.src = this.options.boomSvgUrl;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
  
      boom.appendChild(img);
      center.appendChild(boom);
  
      // плавно «вспыхнуть»
      requestAnimationFrame(()=>{
        boom.style.opacity = '1';
        boom.style.transform = 'translate(-50%,-50%) scale(1)';
      });
  
      return this._wait(this.options.duration.boom);
    }
  
    _showResultBadge(resultStr, isGood) {
      // из взрыва вылезает итоговый X
      let center = this.container.querySelector('.b5050-center');
      if (!center) {
        center = this._el('div', {}, 'b5050-center');
        this.container.appendChild(center);
      }
  
      const res = this._el('div', {}, 'b5050-result');
      res.textContent = resultStr;
      res.style.color = isGood ? this.colors.good : this.colors.bad;
      center.appendChild(res);
  
      res.style.animation = `popResult 700ms cubic-bezier(.68,-.55,.265,1.55) forwards`;
  
      return this._wait(this.options.duration.resultHold);
    }
  
    _fadeOutOverlay() {
      return new Promise(res=>{
        this.overlay.style.opacity = '0';
        setTimeout(()=>{
          this.container.innerHTML = '';
          this.overlay.style.display = 'none';
          // вернём прозрачность для следующего показа
          requestAnimationFrame(()=>{ this.overlay.style.opacity = '1'; });
          res();
        }, this.options.duration.overlayFade);
      });
    }
  
    _wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
  }
  
  // export
  if (typeof window !== 'undefined') window.Bonus5050 = Bonus5050;
  if (typeof module !== 'undefined' && module.exports) module.exports = Bonus5050;
  