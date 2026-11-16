/* Bienvenida · Vitrina Digital Los Naranjos
   Se inyecta sola: solo hay que cargar este archivo con defer. No toca ids ni clases existentes.
   Se muestra la primera vez que se entra (localStorage). Para probarla siempre: añade ?bienvenida=1 a la URL.
   Árbol 3D ligero (Three.js) con fallback a imagen fija (?nogl=1 fuerza el fallback). */
(function(){
  'use strict';
  var KEY='vn_bienvenida_vista';
  var script=document.currentScript;
  var TREE=(script&&script.getAttribute('data-tree'))||'images/arbol-naranjos-hd.webp';
  var force=/[?&]bienvenida=1/.test(location.search);
  var noGL=/[?&]nogl=1/.test(location.search);
  // Si se llega desde un enlace compartido de producto, no bloqueamos con la
  // bienvenida: el usuario debe ver la vitrina y el producto de inmediato.
  var deepLink=/[?&]producto=/.test(location.search);
  try{if(!force&&(deepLink||localStorage.getItem(KEY)))return}catch(e){if(deepLink&&!force)return}

  var CATS=[['🍲','Comidas','Almuerzos caseros'],['💅','Belleza y uñas','Con cita'],['🧁','Postres','Por encargo'],
            ['🛠️','Técnicos','Arreglos en casa'],['🐶','Mascotas','Cuidado y baño'],['🛒','Minimercados','Cerca de ti']];

  function init(){
    var prevFocus=document.activeElement;
    var scrollY=window.scrollY||document.documentElement.scrollTop||0;
    var prev={overflow:document.body.style.overflow,position:document.body.style.position,top:document.body.style.top,
              left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
    var closed=false,stopped=false,timer=null,toastTimer=null;

    var wel=document.createElement('div');
    wel.className='vn-wel';wel.setAttribute('role','dialog');wel.setAttribute('aria-modal','true');wel.setAttribute('aria-label','Bienvenida');
    wel.innerHTML=
      '<div class="vn-card">'+
        '<div class="vn-badge">📍 Los Naranjos · Jamundí</div>'+
        '<div class="vn-stage">'+
          '<img class="vn-fb" alt="Árbol de Los Naranjos" decoding="async">'+
          '<canvas class="vn-c" role="img" aria-label="Árbol de Los Naranjos en 3D. Arrastra para inclinarlo"></canvas>'+
          '<div class="vn-fl vn-f1"></div><div class="vn-fl vn-f2"></div>'+
        '</div>'+
        '<div class="vn-info"><h1 class="vn-title">Bienvenidos</h1>'+
        '<p class="vn-sub">Lo que hacen tus vecinos, a pocos pasos de tu casa.</p>'+
        '<button type="button" class="vn-go">Entrar a la vitrina</button></div>'+
        '<div class="vn-toast" role="status" aria-live="polite"></div>'+
      '</div>';
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

    var btn=wel.querySelector('.vn-go'),fb=wel.querySelector('.vn-fb'),toast=wel.querySelector('.vn-toast');
    var stage=wel.querySelector('.vn-stage'),canvas=wel.querySelector('.vn-c');
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

    // Árbol 3D: mismo montaje del mockup (capas de grosor, sombra, arrastre y balanceo).
    var stop3D=function(){};
    function useFallback(){
      wel.classList.remove('vn-3d-ready');
      wel.classList.add('vn-nogl');
      fb.style.opacity='1';
    }
    function start3D(){
      if(noGL||!window.THREE){ useFallback(); return; }
      var THREE=window.THREE;
      var renderer=null,scene=null,camera=null,group=null,shadow=null,raf=0,ro=null,dead=false;
      var geos=[],mats=[],texs=[];
      var reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
      var coarse=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      var drag=false,lx=0,off=0,tx=0,t0=performance.now();

      function onLost(e){
        if(e&&e.preventDefault) e.preventDefault();
        useFallback();
        stop3D();
      }

      stop3D=function(){
        if(dead)return;dead=true;
        if(raf){cancelAnimationFrame(raf);raf=0}
        if(ro){ro.disconnect();ro=null}else{window.removeEventListener('resize',size)}
        canvas.removeEventListener('pointerdown',down);
        canvas.removeEventListener('pointerup',up);
        canvas.removeEventListener('pointercancel',up);
        canvas.removeEventListener('pointermove',move);
        canvas.removeEventListener('webglcontextlost',onLost);
        for(var i=0;i<geos.length;i++){try{geos[i].dispose()}catch(e){}}
        for(var j=0;j<mats.length;j++){try{mats[j].dispose()}catch(e){}}
        for(var k=0;k<texs.length;k++){try{texs[k].dispose()}catch(e){}}
        if(renderer){try{renderer.dispose()}catch(e){}try{renderer.forceContextLoss()}catch(e){}}
        renderer=null;scene=null;camera=null;group=null;shadow=null;
      };

      function size(){
        if(dead||!renderer||!camera||!stage)return;
        var w=stage.clientWidth||1,h=stage.clientHeight||1;
        renderer.setSize(w,h,false);
        camera.aspect=w/h;
        camera.fov=h>w*1.1?38:32;
        camera.updateProjectionMatrix();
      }

      function down(e){drag=true;lx=e.clientX;try{canvas.setPointerCapture(e.pointerId)}catch(err){}}
      function up(){drag=false}
      function move(e){
        if(dead)return;
        var r=canvas.getBoundingClientRect();
        tx=((e.clientY-r.top)/r.height-.5)*.35;
        if(drag){off=Math.max(-.85,Math.min(.85,off+(e.clientX-lx)*.012));lx=e.clientX}
      }

      function loop(now){
        if(dead)return;
        raf=requestAnimationFrame(loop);
        if(document.hidden)return;
        var t=(now-t0)/1000;
        if(!drag)off*=.96;
        var sway=reduce?0:Math.sin(t*.9)*.32;
        group.rotation.y+=((off+sway)-group.rotation.y)*.12;
        group.rotation.x+=(tx-group.rotation.x)*.06;
        if(!reduce){
          group.position.y=Math.sin(t*1.4)*.07;
          if(shadow) shadow.scale.setScalar(1-Math.sin(t*1.4)*.04);
        }
        renderer.render(scene,camera);
      }

      try{
        renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,coarse?1.5:2));
        if(THREE.sRGBEncoding!==undefined) renderer.outputEncoding=THREE.sRGBEncoding;
        scene=new THREE.Scene();
        camera=new THREE.PerspectiveCamera(32,1,.1,50);
        camera.position.set(0,.1,6.4);
        group=new THREE.Group();scene.add(group);

        var H=2.5,W=H*0.7568;
        var loader=new THREE.TextureLoader();
        loader.load(TREE,function(tex){
          if(dead){try{tex.dispose()}catch(e){}return}
          if(THREE.sRGBEncoding!==undefined) tex.encoding=THREE.sRGBEncoding;
          tex.anisotropy=8;texs.push(tex);
          var geo=new THREE.PlaneGeometry(W,H);geos.push(geo);
          for(var i=10;i>=1;i--){
            var mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.45,
              color:new THREE.Color(0x4a2a12).lerp(new THREE.Color(0x7a4a22),i/10)});
            mats.push(mat);
            var mesh=new THREE.Mesh(geo,mat);mesh.position.z=-i*.016;group.add(mesh);
          }
          var fm=new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.45});
          mats.push(fm);group.add(new THREE.Mesh(geo,fm));
          wel.classList.add('vn-3d-ready');
          if(!raf)raf=requestAnimationFrame(loop);
        },undefined,function(){
          if(dead)return;
          useFallback();
          stop3D();
        });

        var sc=document.createElement('canvas');sc.width=sc.height=128;
        var sg=sc.getContext('2d');
        var rg=sg.createRadialGradient(64,64,4,64,64,62);
        rg.addColorStop(0,'rgba(20,30,20,.5)');rg.addColorStop(1,'rgba(20,30,20,0)');
        sg.fillStyle=rg;sg.fillRect(0,0,128,128);
        var st=new THREE.CanvasTexture(sc);texs.push(st);
        var sgeo=new THREE.PlaneGeometry(2.4,2.4);geos.push(sgeo);
        var smat=new THREE.MeshBasicMaterial({map:st,transparent:true,depthWrite:false});mats.push(smat);
        shadow=new THREE.Mesh(sgeo,smat);
        shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.55;
        scene.add(shadow);

        size();
        if(window.ResizeObserver){ro=new ResizeObserver(size);ro.observe(stage)}else{window.addEventListener('resize',size)}
        canvas.addEventListener('pointerdown',down);
        canvas.addEventListener('pointerup',up);
        canvas.addEventListener('pointercancel',up);
        canvas.addEventListener('pointermove',move);
        canvas.addEventListener('webglcontextlost',onLost,false);
        if(!raf)raf=requestAnimationFrame(loop);
      }catch(e){
        useFallback();
        stop3D();
      }
    }

    function showToast(msg){
      toast.textContent=msg;toast.classList.add('vn-show');
      if(toastTimer)clearTimeout(toastTimer);
      toastTimer=setTimeout(function(){toast.classList.remove('vn-show')},1600);
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
      stopped=true;
      if(timer){clearInterval(timer);timer=null}
      if(toastTimer){clearTimeout(toastTimer);toastTimer=null}
      stop3D();
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
      stop3D();
      try{localStorage.setItem(KEY,'1')}catch(e){}
      restore();
      try{document.dispatchEvent(new CustomEvent('vn:bienvenida:closed'))}catch(e){}
      wel.classList.add('vn-out');
      setTimeout(cleanup,480);
    }

    btn.addEventListener('click',function(){
      showToast('Entrando a la vitrina…');
      close();
    });
    start3D();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
