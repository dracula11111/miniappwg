// bonus-5050.js - FIXED VERSION with Telegram Style

class Bonus5050 {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        
        if (!this.container) {
            console.error('[Bonus5050] Container not found!');
            throw new Error('Container element not found');
        }
        
        // Настройки
        this.options = {
            introPngUrl: options.introPngUrl || '/images/bets/50-50.png',
            boomSvgUrl: options.boomSvgUrl || '/images/boom.webp',
            onComplete: options.onComplete || (() => {}),
            duration: options.duration || {
                intro: 1500,
                fadeOut: 600,
                drumAppear: 800,
                drumSpin: 2500,
                collision: 1200,
                result: 2500
            }
        };
        
        // Значения для барабанов
        this.redValues = ['1x', '1.5x', '2x', '3x', '4x'];
        this.greenValues = ['5x', '10x', '15x', '20x'];
        
        this.init();
    }
    
    init() {
        this.container.innerHTML = '';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            background: rgba(0, 0, 0, 0.95);
        `;
        
        // Добавляем стили анимации один раз
        if (!document.getElementById('bonus5050-styles')) {
            this.addStyles();
        }
    }
    
    addStyles() {
        const style = document.createElement('style');
        style.id = 'bonus5050-styles';
        style.textContent = `
            @keyframes introScale {
                0% {
                    transform: scale(0.5);
                    opacity: 0;
                }
                60% {
                    transform: scale(1.1);
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
            
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: scale(0.9);
                }
            }
            
            @keyframes drumSlideLeft {
                from {
                    transform: translateX(-200%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes drumSlideRight {
                from {
                    transform: translateX(200%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes boomExpand {
                0% {
                    transform: translate(-50%, -50%) scale(0);
                    opacity: 0;
                }
                50% {
                    transform: translate(-50%, -50%) scale(1.2);
                    opacity: 1;
                }
                100% {
                    transform: translate(-50%, -50%) scale(2);
                    opacity: 0;
                }
            }
            
            @keyframes resultPop {
                0% {
                    transform: scale(0);
                    opacity: 0;
                }
                70% {
                    transform: scale(1.15);
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
            
            @keyframes glow {
                0%, 100% {
                    filter: drop-shadow(0 0 20px currentColor);
                }
                50% {
                    filter: drop-shadow(0 0 40px currentColor);
                }
            }
            
            @keyframes confettiFall {
                to {
                    transform: translateY(100vh) rotate(720deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    async start() {
        try {
            await this.showIntro();
            await this.fadeOutIntro();
            const [redResult, greenResult] = await this.showDrums();
            await this.spinDrums();
            const finalResult = await this.collision(redResult, greenResult);
            await this.showResult(finalResult);
            this.options.onComplete(finalResult);
        } catch (error) {
            console.error('[Bonus5050] Error:', error);
            this.options.onComplete(null);
        }
    }
    
    showIntro() {
        return new Promise((resolve) => {
            const intro = document.createElement('div');
            intro.className = 'bonus-intro';
            intro.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                animation: introScale ${this.options.duration.intro}ms cubic-bezier(0.34, 1.56, 0.64, 1);
            `;
            
            const img = new Image();
            
            img.onload = () => {
                const imgElement = document.createElement('img');
                imgElement.src = this.options.introPngUrl;
                imgElement.alt = "50/50 Bonus";
                imgElement.style.cssText = `
                    max-width: 300px;
                    max-height: 300px;
                    filter: drop-shadow(0 10px 40px rgba(217, 25, 122, 0.6));
                `;
                intro.appendChild(imgElement);
            };
            
            img.onerror = () => {
                const fallback = document.createElement('div');
                fallback.style.cssText = `
                    font-size: 64px;
                    font-weight: 900;
                    color: #d9197a;
                    text-shadow: 0 0 30px rgba(217, 25, 122, 0.8);
                `;
                fallback.textContent = '50/50';
                intro.appendChild(fallback);
            };
            
            img.src = this.options.introPngUrl;
            
            this.container.appendChild(intro);
            setTimeout(resolve, this.options.duration.intro);
        });
    }
    
    fadeOutIntro() {
        return new Promise((resolve) => {
            const intro = this.container.querySelector('.bonus-intro');
            if (intro) {
                intro.style.animation = `fadeOut ${this.options.duration.fadeOut}ms ease forwards`;
                setTimeout(() => {
                    intro.remove();
                    resolve();
                }, this.options.duration.fadeOut);
            } else {
                resolve();
            }
        });
    }
    
    showDrums() {
        return new Promise((resolve) => {
            const isRedLeft = Math.random() < 0.5;
            
            const drumsContainer = document.createElement('div');
            drumsContainer.className = 'drums-container';
            drumsContainer.style.cssText = `
                display: flex;
                gap: 60px;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
            `;
            
            const redDrum = this.createDrum('red', this.redValues, isRedLeft ? 'left' : 'right');
            const greenDrum = this.createDrum('green', this.greenValues, isRedLeft ? 'right' : 'left');
            
            if (isRedLeft) {
                drumsContainer.appendChild(redDrum.element);
                drumsContainer.appendChild(greenDrum.element);
            } else {
                drumsContainer.appendChild(greenDrum.element);
                drumsContainer.appendChild(redDrum.element);
            }
            
            this.container.appendChild(drumsContainer);
            this.drumsContainer = drumsContainer;
            this.redDrum = redDrum;
            this.greenDrum = greenDrum;
            
            setTimeout(() => {
                resolve([redDrum.result, greenDrum.result]);
            }, this.options.duration.drumAppear);
        });
    }
    
    createDrum(color, values, side) {
        const drum = document.createElement('div');
        drum.className = `drum drum-${color}`;
        drum.style.cssText = `
            width: 140px;
            height: 220px;
            background: ${color === 'red' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)'};
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            position: relative;
            overflow: hidden;
            animation: drumSlide${side === 'left' ? 'Left' : 'Right'} ${this.options.duration.drumAppear}ms cubic-bezier(0.34, 1.56, 0.64, 1);
        `;
        
        const window = document.createElement('div');
        window.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 110px;
            height: 70px;
            background: rgba(255,255,255,0.15);
            border-radius: 8px;
            border: 2px solid rgba(255,255,255,0.3);
            overflow: hidden;
            backdrop-filter: blur(10px);
        `;
        
        const tape = document.createElement('div');
        tape.className = 'drum-tape';
        tape.style.cssText = `
            position: absolute;
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
        `;
        
        const multipliedValues = [];
        for (let i = 0; i < 15; i++) {
            multipliedValues.push(...values);
        }
        
        const result = values[Math.floor(Math.random() * values.length)];
        
        multipliedValues.forEach((value) => {
            const item = document.createElement('div');
            item.textContent = value;
            item.style.cssText = `
                font-size: 32px;
                font-weight: 900;
                color: white;
                padding: 15px 0;
                text-shadow: 0 2px 8px rgba(0,0,0,0.5);
            `;
            tape.appendChild(item);
        });
        
        window.appendChild(tape);
        drum.appendChild(window);
        
        return {
            element: drum,
            tape: tape,
            result: result,
            color: color
        };
    }
    
    spinDrums() {
        return new Promise((resolve) => {
            const redTape = this.redDrum.tape;
            const greenTape = this.greenDrum.tape;
            
            setTimeout(() => {
                redTape.style.transition = `transform ${this.options.duration.drumSpin}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
                greenTape.style.transition = `transform ${this.options.duration.drumSpin}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
                
                const redIndex = this.redValues.indexOf(this.redDrum.result);
                const greenIndex = this.greenValues.indexOf(this.greenDrum.result);
                
                redTape.style.transform = `translateY(-${2000 + redIndex * 62}px)`;
                greenTape.style.transform = `translateY(-${2000 + greenIndex * 62}px)`;
                
                setTimeout(resolve, this.options.duration.drumSpin);
            }, 300);
        });
    }
    
    collision(redResult, greenResult) {
        return new Promise((resolve) => {
            const drums = this.container.querySelectorAll('.drum');
            
            const isRedWinner = Math.random() < 0.5;
            const finalResult = isRedWinner ? redResult : greenResult;
            
            console.log('[Bonus5050] Winner:', finalResult);
            
            drums[0].style.transition = `all ${this.options.duration.collision}ms ease`;
            drums[1].style.transition = `all ${this.options.duration.collision}ms ease`;
            drums[0].style.transform = 'translateX(80px) scale(0.8)';
            drums[1].style.transform = 'translateX(-80px) scale(0.8)';
            drums[0].style.opacity = '0';
            drums[1].style.opacity = '0';
            
            setTimeout(() => {
                this.showBoom();
            }, this.options.duration.collision / 2);
            
            setTimeout(() => {
                if (this.drumsContainer) {
                    this.drumsContainer.remove();
                    resolve(finalResult);
                } else {
                    resolve(finalResult);
                }
            }, this.options.duration.collision);
        });
    }
    
    showBoom() {
        const boom = new Image();
        
        boom.onload = () => {
            const boomElement = document.createElement('img');
            boomElement.src = this.options.boomSvgUrl;
            boomElement.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                width: 300px;
                height: 300px;
                animation: boomExpand 700ms ease-out forwards;
                z-index: 100;
                pointer-events: none;
            `;
            this.container.appendChild(boomElement);
            setTimeout(() => boomElement.remove(), 700);
        };
        
        boom.onerror = () => {
            const boomText = document.createElement('div');
            boomText.textContent = '💥';
            boomText.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                font-size: 150px;
                animation: boomExpand 700ms ease-out forwards;
                z-index: 100;
            `;
            this.container.appendChild(boomText);
            setTimeout(() => boomText.remove(), 700);
        };
        
        boom.src = this.options.boomSvgUrl;
    }
    
    showResult(result) {
        return new Promise((resolve) => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'bonus-result';
            resultDiv.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                animation: resultPop 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
            `;
            
            const isGood = this.greenValues.includes(result);
            const color = isGood ? '#10b981' : '#ef4444';
            
            resultDiv.innerHTML = `
                <div style="
                    font-size: 96px;
                    font-weight: 900;
                    color: ${color};
                    text-shadow: 0 0 30px ${color}80;
                    animation: glow 2s ease-in-out infinite;
                    margin-bottom: 16px;
                ">
                    ${result}
                </div>
            `;
            
            this.container.appendChild(resultDiv);
            
            if (isGood) {
                this.createConfetti();
            }
            
            setTimeout(resolve, this.options.duration.result);
        });
    }
    
    createConfetti() {
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.style.cssText = `
                    position: absolute;
                    width: 8px;
                    height: 8px;
                    background: ${['#fbbf24', '#f59e0b', '#ef4444', '#10b981'][Math.floor(Math.random() * 4)]};
                    top: -10px;
                    left: ${Math.random() * 100}%;
                    animation: confettiFall ${2 + Math.random() * 2}s linear forwards;
                    border-radius: 50%;
                `;
                
                this.container.appendChild(confetti);
                setTimeout(() => confetti.remove(), 4000);
            }, i * 20);
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.Bonus5050 = Bonus5050;
    console.log('[Bonus5050] ✅ Class loaded');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Bonus5050;
}