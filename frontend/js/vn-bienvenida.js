/* Bienvenida · Vitrina Digital Los Naranjos
   Se inyecta sola: solo hay que cargar este archivo con defer. No toca ids ni clases existentes.
   Se muestra la primera vez que se entra (localStorage). Para probarla siempre: añade ?bienvenida=1 a la URL.
   Pantalla estática (sin scroll ni gestos) y con carga liviana: no usa WebGL. */
(function(){
  'use strict';
  var KEY='vn_bienvenida_vista';
  var script=document.currentScript;
  var TREE=(script&&script.getAttribute('data-tree'))||'images/arbol-naranjos-hd.webp';
  var force=/[?&]bienvenida=1/.test(location.search);
  try{if(!force&&localStorage.getItem(KEY))return}catch(e){}

  var CATS=[['🍲','Comidas','Almuerzos caseros'],['💅','Belleza y uñas','Con cita'],['🧁','Postres','Por encargo'],
            ['🛠️','Técnicos','Arreglos en casa'],['🐶','Mascotas','Cuidado y baño'],['🛒','Minimercados','Cerca de ti']];

  function init(){
    var prevFocus=document.activeElement;
    var scrollY=window.scrollY||document.documentElement.scrollTop||0;
    var prev={overflow:document.body.style.overflow,position:document.body.style.position,top:document.body.style.top,
              left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
    var closed=false,stopped=false,timer=null;

    var wel=document.createElement('div');
    wel.className='vn-wel';wel.setAttribute('role','dialog');wel.setAttribute('aria-modal','true');wel.setAttribute('aria-label','Bienvenida');
    wel.innerHTML=
      '<div class="vn-badge">📍 Los Naranjos · Jamundí</div>'+
      '<div class="vn-stage">'+
        '<img class="vn-fb" alt="Árbol de Los Naranjos" decoding="async">'+
        '<div class="vn-fl vn-f1"></div><div class="vn-fl vn-f2"></div>'+
      '</div>'+
      '<div class="vn-info"><h1 class="vn-title">Bienvenidos</h1>'+
      '<p class="vn-sub">Lo que hacen tus vecinos, a pocos pasos de tu casa.</p>'+
      '<button type="button" class="vn-go">Entrar a la vitrina</button></div>';
    document.body.appendChild(wel);

    // Bloqueo estático real (iOS incluido): fija el body y conserva la posición.
    document.body.style.overflow='hidden';
    document.body.style.position='fixed';
    document.body.style.top='-'+scrollY+'px';
    document.body.style.left='0';
    document.body.style.right='0';
    document.body.style.width='100%';
    document.body.classList.add('vn-lock');document.documentElement.classList.add('vn-lock');

    function stop(e){ if(e.cancelable) e.preventDefault(); }
    function onKey(e){ if(e.key==='Escape') close(); }
    wel.addEventListener('wheel',stop,{passive:false});
    wel.addEventListener('touchmove',stop,{passive:false});
    document.addEventListener('gesturestart',stop,{passive:false});
    document.addEventListener('gesturechange',stop,{passive:false});
    document.addEventListener('gestureend',stop,{passive:false});
    document.addEventListener('keydown',onKey);

    // Altura exacta del viewport visible (evita que la barra de Safari desborde en iPhone).
    function setVH(){
      var h=(window.visualViewport&&window.visualViewport.height)||window.innerHeight||0;
      if(h) wel.style.setProperty('--vn-vh',h+'px');
    }
    setVH();
    window.addEventListener('resize',setVH);
    if(window.visualViewport) window.visualViewport.addEventListener('resize',setVH);

    var btn=wel.querySelector('.vn-go'),fb=wel.querySelector('.vn-fb');
    fb.src=TREE;
    fb.onload=function(){ fb.style.opacity='1'; };
    fb.onerror=function(){ if(!/\.png$/i.test(fb.src)) fb.src='images/arbol-naranjos.png'; };
    btn.focus();

    // Letreros que rotan por todas las categorías (pausados si la pestaña no se ve).
    var fl=wel.querySelectorAll('.vn-fl'),p=0,turn=0;
    function fill(el){
      var c=CATS[p%CATS.length];p++;
      el.textContent=c[0]+' '+c[1];
      var s=document.createElement('small');s.textContent=c[2];el.appendChild(s);
    }
    if(fl.length){
      fill(fl[0]);fill(fl[1]);
      timer=setInterval(function(){
        if(stopped||document.hidden)return;
        var el=fl[turn%2];turn++;el.classList.add('vn-sw');
        setTimeout(function(){ if(stopped)return; fill(el); el.classList.remove('vn-sw'); },380);
      },1700);
    }

    function restore(){
      document.body.style.overflow=prev.overflow;
      document.body.style.position=prev.position;
      document.body.style.top=prev.top;
      document.body.style.left=prev.left;
      document.body.style.right=prev.right;
      document.body.style.width=prev.width;
      document.body.classList.remove('vn-lock');document.documentElement.classList.remove('vn-lock');
      window.scrollTo(0,scrollY);
    }

    function cleanup(){
      if(timer){clearInterval(timer);timer=null}
      wel.removeEventListener('wheel',stop);
      wel.removeEventListener('touchmove',stop);
      document.removeEventListener('gesturestart',stop);
      document.removeEventListener('gesturechange',stop);
      document.removeEventListener('gestureend',stop);
      document.removeEventListener('keydown',onKey);
      window.removeEventListener('resize',setVH);
      if(window.visualViewport) window.visualViewport.removeEventListener('resize',setVH);
      if(wel.parentNode) wel.parentNode.removeChild(wel);
      if(prevFocus&&prevFocus.focus)try{prevFocus.focus()}catch(e){}
    }

    function close(){
      if(closed)return;closed=true;stopped=true;
      if(timer){clearInterval(timer);timer=null}
      try{localStorage.setItem(KEY,'1')}catch(e){}
      restore();
      try{document.dispatchEvent(new CustomEvent('vn:bienvenida:closed'))}catch(e){}
      wel.classList.add('vn-out');
      setTimeout(cleanup,480);
    }

    btn.addEventListener('click',close);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
