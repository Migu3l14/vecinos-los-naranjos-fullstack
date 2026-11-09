/* Bienvenida 3D · Vitrina Digital Los Naranjos
   Se inyecta sola: solo hay que cargar este archivo con defer. No toca ids ni clases existentes.
   Se muestra la primera vez que se entra (localStorage). Para probarla siempre: añade ?bienvenida=1 a la URL. */
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
    var prevFocus=document.activeElement,prevOverflow=document.body.style.overflow;
    var wel=document.createElement('div');
    wel.className='vn-wel';wel.setAttribute('role','dialog');wel.setAttribute('aria-modal','true');wel.setAttribute('aria-label','Bienvenida');
    wel.innerHTML=
      '<div class="vn-badge">📍 Los Naranjos · Jamundí</div>'+
      '<div class="vn-stage">'+
        '<img class="vn-fb" alt="">'+
        '<canvas class="vn-canvas" role="img" aria-label="Árbol de Los Naranjos en 3D. Arrastra para inclinarlo"></canvas>'+
        '<div class="vn-fl vn-f1"></div><div class="vn-fl vn-f2"></div>'+
      '</div>'+
      '<div class="vn-info"><h1 class="vn-title">Bienvenidos</h1>'+
      '<p class="vn-sub">Lo que hacen tus vecinos, a pocos pasos de tu casa.</p>'+
      '<button type="button" class="vn-go">Entrar a la vitrina</button></div>';
    document.body.appendChild(wel);
    document.body.style.overflow='hidden';
    document.body.classList.add('vn-lock');document.documentElement.classList.add('vn-lock');
    function stopScroll(e){e.preventDefault()}
    wel.addEventListener('wheel',stopScroll,{passive:false});
    wel.addEventListener('touchmove',stopScroll,{passive:false});
    var btn=wel.querySelector('.vn-go'),stage=wel.querySelector('.vn-stage'),canvas=wel.querySelector('.vn-canvas'),fb=wel.querySelector('.vn-fb');
    fb.decoding='async'; fb.src=TREE; fb.style.opacity='0';
    fb.onload=function(){ if(!wel.classList.contains('vn-has3d')) fb.style.opacity='1'; };
    fb.onerror=function(){ if(!/\.png$/i.test(fb.src)) fb.src='images/arbol-naranjos.png'; };
    btn.focus();

    function close(){
      try{localStorage.setItem(KEY,'1')}catch(e){}
      try{document.dispatchEvent(new CustomEvent('vn:bienvenida:closed'))}catch(e){}
      wel.classList.add('vn-out');
      document.body.style.overflow=prevOverflow;
      document.body.classList.remove('vn-lock');document.documentElement.classList.remove('vn-lock');
      setTimeout(function(){stopped=true;if(wel.parentNode)wel.parentNode.removeChild(wel);if(prevFocus&&prevFocus.focus)try{prevFocus.focus()}catch(e){}},480);
    }
    var stopped=false;
    btn.addEventListener('click',close);
    document.addEventListener('keydown',function esc(e){if(e.key==='Escape'&&!stopped){close();document.removeEventListener('keydown',esc)}});

    // Letreros que rotan por todas las categorías
    var fl=wel.querySelectorAll('.vn-fl'),p=0,turn=0;
    function fill(el){var c=CATS[p%CATS.length];p++;el.innerHTML=c[0]+' '+c[1]+'<small>'+c[2]+'</small>'}
    fill(fl[0]);fill(fl[1]);
    var timer=setInterval(function(){
      if(stopped){clearInterval(timer);return}
      var el=fl[turn%2];turn++;el.classList.add('vn-sw');
      setTimeout(function(){fill(el);el.classList.remove('vn-sw')},380);
    },1700);

    function fallback(){var i=wel.querySelector('.vn-fb');i.style.opacity='1';wel.classList.add('vn-nogl');wel.classList.remove('vn-has3d')}

    // Three.js se carga solo cuando se muestra la bienvenida
    function startThree(){
      try{
        var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
        var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});
        renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
        renderer.outputEncoding=THREE.sRGBEncoding;
        var scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(32,1,.1,50);cam.position.set(0,.1,6.4);
        var grp=new THREE.Group();scene.add(grp);
        var H=2.5;
        new THREE.TextureLoader().load(TREE,function(tex){
          tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
          var geo=new THREE.PlaneGeometry(H*tex.image.width/tex.image.height,H);
          for(var i=10;i>=1;i--){ // capas oscuras detrA�s: dan grosor al inclinar
            var m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.45,color:new THREE.Color(0x4a2a12).lerp(new THREE.Color(0x7a4a22),i/10)}));
            m.position.z=-i*.016;grp.add(m);
          }
          grp.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.45})));
          wel.classList.add('vn-has3d');
        },undefined,fallback);
        var sc=document.createElement('canvas');sc.width=sc.height=128;var sg=sc.getContext('2d');
        var rg=sg.createRadialGradient(64,64,4,64,64,62);rg.addColorStop(0,'rgba(20,30,20,.5)');rg.addColorStop(1,'rgba(20,30,20,0)');sg.fillStyle=rg;sg.fillRect(0,0,128,128);
        var shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthWrite:false}));
        shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.55;scene.add(shadow);
        function size(){var w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);cam.aspect=w/h;cam.fov=h>w*1.1?38:32;cam.updateProjectionMatrix()}
        size();
        if(window.ResizeObserver)new ResizeObserver(size).observe(stage);else addEventListener('resize',size);
        var drag=false,lx=0,off=0,tx=0;
        canvas.addEventListener('pointerdown',function(e){drag=true;lx=e.clientX;canvas.setPointerCapture(e.pointerId)});
        canvas.addEventListener('pointerup',function(){drag=false});
        canvas.addEventListener('pointercancel',function(){drag=false});
        canvas.addEventListener('pointermove',function(e){
          var r=canvas.getBoundingClientRect();tx=((e.clientY-r.top)/r.height-.5)*.35;
          if(drag){off=Math.max(-.85,Math.min(.85,off+(e.clientX-lx)*.012));lx=e.clientX}
        });
        var t0=performance.now();
        (function loop(now){
          if(stopped){renderer.dispose();return}
          var t=(now-t0)/1000;
          if(!drag)off*=.96;
          grp.rotation.y+=((off+(reduce?0:Math.sin(t*.9)*.32))-grp.rotation.y)*.12;
          grp.rotation.x+=(tx-grp.rotation.x)*.06;
          if(!reduce){grp.position.y=Math.sin(t*1.4)*.07;shadow.scale.setScalar(1-Math.sin(t*1.4)*.04)}
          renderer.render(scene,cam);requestAnimationFrame(loop);
        })(t0);
      }catch(e){fallback()}
    }
    if(window.THREE){startThree()}
    else{
      var s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload=startThree;s.onerror=fallback;document.head.appendChild(s);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
