// app.js - ИСПРАВЛЕННАЯ ВЕРСИЯ с компактным Telegram header

(() => {
  // ====== TELEGRAM WEBAPP INITIALIZATION ======
  const tg = window.Telegram?.WebApp;
  
  if (tg) {
    console.log('[App] 🚀 Initializing Telegram WebApp');
    
    // ✅ КОМПАКТНЫЙ HEADER - убираем большую панель
    tg.ready();
    tg.expand();
    
    // Устанавливаем цвет header (важно!)
    tg.setHeaderColor('#0d0e0f');
    tg.setBackgroundColor('#0d0e0f');
    
    // Скрываем кнопку "Назад"
    tg.BackButton.hide();
    
    // Включаем подтверждение закрытия
    tg.enableClosingConfirmation();
    
    console.log('[App] ✅ Telegram WebApp ready');
    console.log('[App] Version:', tg.version);
    console.log('[App] Platform:', tg.platform);
  } else {
    console.log('[App] ⚠️ Running outside Telegram');
  }

  // ====== UTILITIES ======
  function crc16Xmodem(bytes){
    let crc=0xffff; 
    for (const b of bytes){ 
      crc^=(b<<8); 
      for(let i=0;i<8;i++){ 
        crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1); 
        crc&=0xffff; 
      } 
    } 
    return crc;
  }
  
  function rawToFriendly(raw,{bounceable=true,testOnly=false}={}) {
    const m = raw?.match?.(/^(-?\d+):([a-fA-F0-9]{64})$/);
    if(!m) return raw||"";
    const wc = parseInt(m[1],10);
    const hash = Uint8Array.from(m[2].match(/.{2}/g).map(h=>parseInt(h,16)));
    const tag = (bounceable?0x11:0x51) | (testOnly?0x80:0);
    const body=new Uint8Array(34); 
    body[0]=tag; 
    body[1]=(wc&0xff); 
    body.set(hash,2);
    const crc=crc16Xmodem(body); 
    const out=new Uint8Array(36);
    out.set(body,0); 
    out[34]=(crc>>8)&0xff; 
    out[35]=crc&0xff;
    let s=btoa(String.fromCharCode(...out));
    return s.replace(/\+/g,"-").replace(/\//g,"_");
  }
  
  const ensureFriendly = (addr,opts) => !addr ? "" : (/^[UE]Q/.test(addr) ? addr : rawToFriendly(addr,opts));
  const shortAddr = (addr) => addr ? `${addr.slice(0,4)}…${addr.slice(-4)}` : "Not connected";

  // ====== GLOBAL API ======
  window.WT = window.WT || {};
  WT.utils = { crc16Xmodem, rawToFriendly, ensureFriendly, shortAddr };
  WT.bus   = new EventTarget();

  // ====== NAVIGATION ======
  function activatePage(id){
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("page-active"));
    const pg = document.getElementById(id);
    if(pg) pg.classList.add("page-active");

    document.querySelectorAll(".bottom-nav .nav-item").forEach(i=>i.classList.remove("active"));
    document.querySelector(`.bottom-nav .nav-item[data-target="${id}"]`)?.classList.add("active");

    WT.bus.dispatchEvent(new CustomEvent("page:change", { detail:{ id } }));
  }

  document.querySelectorAll(".bottom-nav .nav-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const target = btn.getAttribute("data-target");
      if(target) activatePage(target);
    });
  });

  // Activate first page if none active
  if(!document.querySelector(".page.page-active")){
    const first = document.querySelector(".page");
    if(first) activatePage(first.id);
  }
  
  console.log('[App] ✅ Navigation initialized');
})();


