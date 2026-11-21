// The DOM buttons handle input and accessibility. The meshes use those same model
// transforms, so each hit target and its cover share the street's camera.
(() => {
  const canvas = document.createElement('canvas');
  canvas.id = 'book-models';
  canvas.setAttribute('aria-hidden','true');
  list.prepend(canvas);
  const gl = canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});
  if (!gl) return;
  const vs = `
    attribute vec3 point; attribute vec2 uv; attribute vec4 paint;
    uniform mat4 model; uniform vec2 size,origin,horizon,view;
    uniform float focal;
    varying mediump vec3 scenePoint;
    varying vec2 tex; varying vec4 pigment;
    void main(){
      vec3 local=vec3(point.xy*size,point.z*size.x);
      vec3 world=(model*vec4(local,1.)).xyz;
      scenePoint=world;
      float d=focal-world.z;
      vec2 screen=(origin+world.xy-horizon)*focal+(horizon-view*.5)*d;
      gl_Position=vec4(2.*screen.x/view.x,-2.*screen.y/view.y,d*.999-2.,d);
      tex=uv; pigment=paint;
    }`;
  const fs = `
    precision mediump float;
    varying vec2 tex; varying vec4 pigment;
    uniform sampler2D cover; uniform float opacity; varying mediump vec3 scenePoint;
    uniform mat4 caster[4];
    uniform vec4 strength;
    uniform vec2 halfCover;
    float shade(mat4 inversePose,float alpha){
      if(alpha<.005)return 0.;
      vec3 p=(inversePose*vec4(scenePoint,1.)).xyz;
      vec3 ray=(inversePose*vec4(-.14,-.22,1.,0.)).xyz;
      if(abs(ray.z)<.035)return 0.;
      float t=-p.z/ray.z;
      if(t<=0.)return 0.;
      vec2 delta=abs(p.xy+ray.xy*t)-halfCover;
      float edge=length(max(delta,0.))+min(max(delta.x,delta.y),0.);
      float blur=clamp(3.+t*.14,4.,22.);
      return alpha*(1.-smoothstep(-blur,blur,edge))*.55;
    }
    void main(){
      vec3 color=mix(pigment.rgb,texture2D(cover,tex).rgb,pigment.a);
      float occlusion=max(max(shade(caster[0],strength.x),shade(caster[1],strength.y)),
                          max(shade(caster[2],strength.z),shade(caster[3],strength.w)));
      gl_FragColor=vec4(color*(1.-occlusion)*opacity,opacity);
    }`;
  function compile(type,source) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const vertices=[];
  const fabric=[1,1,1,1],paper=[.82,.75,.60,0],thread=[.41,.34,.24,0],spine=[.24,.23,.17,0];
  function triangle(a,b,c,color){
    for(const v of [a,b,c])vertices.push(v[0]-.5,v[1]-.5,v[2],v[0],v[1],...color);
  }
  function quad(a,b,c,d,color){triangle(a,b,c,color);triangle(a,c,d,color);}
  function geometry(worn){
    const start=vertices.length/9;
    const a=[0,0,0],b=[1,0,0],c=[1,1,0],d=[0,1,0];
    if(worn){
      const cut=[.78,0,0],end=[1,.15,0];
      triangle(a,cut,d,fabric);triangle(c,d,cut,fabric);triangle(c,cut,end,fabric);
      triangle(cut,end,[.795,.141,.026],[.87,.78,.58,0]);
      triangle(cut,[.795,.141,.026],[.784,.153,.001],thread);
    }else quad(a,b,c,d,fabric);
    // Independent text block, board on the back, sewn spine and ruled page edges.
    const z=-.10;
    quad([0,0,z],[0,1,z],[1,1,z],[1,0,z],spine);
    quad([.014,.012,-.01],[.987,.012,-.01],[.987,.987,-.01],[.014,.987,-.01],paper);
    const outline=[[.014,.012],[.987,.012],[.987,.987],[.014,.987]];
    for(let side=0;side<4;side++){
      const [x,y]=outline[side],[u,v]=outline[(side+1)%4];
      for(let j=0;j<12;j++){
        const front=-.011-j*.007,back=front-.007;
        const tint=side===3?spine:(j%3===0?[.65,.57,.45,0]:paper);
        quad([x,y,front],[u,v,front],[u,v,back],[x,y,back],tint);
      }
    }
    return {start,count:vertices.length/9-start};
  }
  const fresh=geometry(false),worn=geometry(true);
  function coverArt(item){
    const sheet=document.createElement('canvas');sheet.width=320;sheet.height=460;
    const g=sheet.getContext('2d'),id=item.article.id;
    const [name,color]=covers[id-1],aged=readBooks.has(id);
    g.fillStyle=color;g.fillRect(0,0,320,460);
    let seed=id*391;
    const random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
    for(let y=0;y<460;y+=3){g.fillStyle='rgba(232,220,191,'+(.04+.09*random())+')';g.fillRect(0,y,320,1);}
    for(let x=0;x<320;x+=4){g.fillStyle='#15252517';g.fillRect(x,0,1,460);}
    if(aged){
      const patina=g.createRadialGradient(150,208,80,150,208,280);
      patina.addColorStop(0,'#b4986222');patina.addColorStop(1,'#ccad79c9');
      g.fillStyle=patina;g.fillRect(0,0,320,460);
      for(let i=0;i<220;i++){
        const x=random()*320,y=random()*460;
        if(Math.min(x,320-x,y,460-y)<19){g.fillStyle='#e5d3a980';g.fillRect(x,y,1+random()*9,1+random()*2);}
      }
    }
    g.strokeStyle='#dfcb9b';g.lineWidth=3;g.beginPath();g.moveTo(21,30);g.lineTo(21,425);g.stroke();
    for(const y of [30,158,292,425]){g.fillStyle='#262621';g.fillRect(18,y-3,7,7);g.fillStyle='#e9dbb6';g.fillRect(0,y-1,23,3);}
    const labelX=207,labelY=40,labelW=71,labelH=name.length*41+20;
    g.fillStyle=aged?'#dfcda4':'#eee1bd';g.fillRect(labelX,labelY,labelW,labelH);
    g.strokeStyle='#75694d';g.lineWidth=1.6;g.strokeRect(labelX+4,labelY+4,labelW-8,labelH-8);
    g.fillStyle='#302d24';g.textAlign='center';g.textBaseline='middle';
    g.font='bold 37px ManualGlyphs,momochidori-variable,"Microsoft JhengHei","微軟正黑體","Microsoft YaHei","Songti TC",serif';
    [...name].forEach((ch,i)=>g.fillText(ch,labelX+labelW/2,labelY+30+i*41));
    g.fillStyle='#ebdfbf';g.font='20px ManualGlyphs,momochidori-variable,"Microsoft JhengHei","微軟正黑體","Microsoft YaHei",serif';g.save();g.translate(52,38);
    if(item.article.chapter==='序篇'){g.fillText('序',0,0);g.fillText('篇',0,24);}else{g.rotate(Math.PI/2);g.textAlign='left';g.fillText(item.article.chapter,0,0);}g.restore();
    g.fillStyle='#873e31';g.fillRect(48,374,59,35);g.strokeStyle='#e3bf8b';g.strokeRect(50,376,55,31);
    g.fillStyle='#ffeac7';g.font='19px serif';g.fillText('卷'+String(id).padStart(2,'0'),78,392);
    return sheet;
  }

  let program,buffer,uniforms,frame=0,until=0;
  const textures=new Map();
  function texture(item){
    let entry=textures.get(item);
    if(!entry){entry={id:gl.createTexture()};textures.set(item,entry);}
    gl.bindTexture(gl.TEXTURE_2D,entry.id);
    const aged=readBooks.has(item.article.id);
    if(entry.aged!==aged){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,coverArt(item));
      for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
      for(const key of [gl.TEXTURE_MAG_FILTER,gl.TEXTURE_MIN_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
      entry.aged=aged;
    }
  }
  function draw(now){
    frame=0;if(document.hidden||gl.isContextLost())return;
    const w=list.clientWidth,h=list.clientHeight,ratio=Math.min(devicePixelRatio,2);
    if(!w||!h)return;
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){
      canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    }
    gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const style=getComputedStyle(list);
    gl.uniform2f(uniforms.view,w,h);gl.uniform1f(uniforms.focal,parseFloat(style.perspective));
    gl.uniform2fv(uniforms.horizon,style.perspectiveOrigin.split(' ').map(parseFloat));
    const ordered=books.map(item=>({item,css:getComputedStyle(item.book)}))
      .filter(({css})=>+css.opacity>.005)
      .map(entry=>({...entry,pose:new DOMMatrix(entry.css.transform)}))
      .sort((a,b)=>a.pose.m43-b.pose.m43);
    const matrices=new Float32Array(64), weights=new Float32Array(4);
    for(const receiver of ordered){
      const {item,css,pose}=receiver;
      const book=item.book,bw=book.offsetWidth,bh=book.offsetHeight;
      gl.uniform2f(uniforms.size,bw,bh);
      gl.uniform2f(uniforms.origin,book.offsetLeft+bw/2,book.offsetTop+bh/2);
      gl.uniformMatrix4fv(uniforms.model,false,pose.toFloat32Array());
      // Test against the actual animated cover planes, in the common book-centred frame.
      const blockers=ordered.filter(other=>other.pose.m43>pose.m43+.2)
        .sort((a,b)=>Math.abs(a.pose.m41-pose.m41)-Math.abs(b.pose.m41-pose.m41)).slice(0,4);
      weights.fill(0);
      blockers.forEach((entry,i)=>{
        matrices.set(entry.pose.inverse().toFloat32Array(),16*i);
        weights[i]=+entry.css.opacity;
      });
      gl.uniformMatrix4fv(uniforms['caster[0]'],false,matrices);
      gl.uniform4fv(uniforms.strength,weights);gl.uniform2f(uniforms.halfCover,bw/2,bh/2);
      gl.uniform1f(uniforms.opacity,+css.opacity);
      texture(item);
      const shape=readBooks.has(item.article.id)?worn:fresh;
      gl.drawArrays(gl.TRIANGLES,shape.start,shape.count);

    }
    list.classList.add('models-ready');
    if(now<until)frame=requestAnimationFrame(draw);
  }
  function refresh(){
    until=performance.now()+520;
    if(!frame)frame=requestAnimationFrame(draw);
  }
  function setup(){
    program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    for(const [name,size,offset] of [['point',3,0],['uv',2,12],['paint',4,20]]){
      const id=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(id);gl.vertexAttribPointer(id,size,gl.FLOAT,false,36,offset);
    }
    uniforms=Object.fromEntries(['model','size','origin','horizon','view','focal','opacity','caster[0]','strength','halfCover'].map(n=>[n,gl.getUniformLocation(program,n)]));
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);refresh();
  }
  try{setup();}catch(error){console.warn('Book models unavailable',error);return;}
  list.addEventListener('books-change',refresh);
  window.addEventListener('scroll',refresh,{passive:true});
  new ResizeObserver(refresh).observe(list);
  document.fonts.ready.then(()=>{for(const entry of textures.values())entry.aged=undefined;refresh();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();list.classList.remove('models-ready');});
  canvas.addEventListener('webglcontextrestored',()=>{textures.clear();setup();});
})();
