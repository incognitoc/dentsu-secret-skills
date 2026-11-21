// Kyoto is a single static mesh. Its streets, eaves, screens and lanterns share one draw call.
(() => {
  const canvas = document.querySelector('#city-view');
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:false});
  if (!gl) return;

  const vertex = `
    attribute vec3 point, pigment;
    attribute vec4 faceEdges;
    attribute float material;
    varying vec4 edges;
    varying float surface;
    uniform vec3 eye;
    uniform float aspect;
    varying vec3 ink, world;
    varying float depth;
    void main() {
      vec3 p = point - eye;
      float d = p.z * ${cityCamera.cosPitch} - p.y * ${cityCamera.sinPitch};
      float h = p.y * ${cityCamera.cosPitch} + p.z * ${cityCamera.sinPitch};
      gl_Position = vec4(p.x*${cityCamera.lens}/aspect,h*${cityCamera.lens},d*1.00143-0.20014,d);
      depth=d; ink=pigment; world=point; edges=faceEdges; surface=material;
    }`;
  const fragment = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec3 ink, world;
    varying vec4 edges;
    varying float depth, surface;
    const vec3 sumi = vec3(.095,.128,.154);
    const vec3 paper = vec3(.91,.80,.62);
    float hash(vec2 p) {
      p=fract(p*vec2(.1031,.11369));
      p+=dot(p,p.yx+19.19);
      return fract((p.x+p.y)*p.x);
    }
    float noise(vec2 p) {
      vec2 i=floor(p),f=fract(p);
      f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                 mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
    }
    float ruling(float t,float thickness) {
      return 1.-smoothstep(thickness,thickness+.04,abs(fract(t+.5)-.5));
    }
    void main() {
      vec2 xy=world.xz+world.y*vec2(.31,.64);
      float detail=1.-smoothstep(12.,58.,depth);
      float grain=noise(xy*vec2(14.,24.));
      float wash=noise(xy*.72);
      vec3 color=ink;
      if(surface<1.5 && surface>.5) {
        // Indigo tile courses with an offset, unprinted lip on each row.
        float row=world.y*5.+noise(xy*2.)*.06;
        float seam=ruling(row,.058);
        color=mix(ink,paper,.09+.13*step(.5,fract(row)));
        color=mix(color,sumi,seam*.82*detail);
        color=mix(color,paper,ruling(row-.105,.026)*.48*detail);
      } else if(surface>1.5 && surface<2.5) {
        float grainLine=world.y*8.+world.x*1.6+sin(world.z*1.5+world.y)*.35+wash*.42;
        color=mix(ink,sumi,ruling(grainLine,.06)*detail*.66);
        color=mix(color,paper,ruling(grainLine-.2,.024)*detail*.23);
      } else if(surface>2.5 && surface<3.5) {
        // Staggered paving blocks, cut into the same ochre colour plate.
        float row=world.z*.94;
        vec2 slab=vec2(world.x*.54+.5*mod(floor(row),2.),row)+.014*wash;
        color=mix(ink,paper,.18*hash(floor(slab)));
        color=mix(color,sumi,max(ruling(slab.x,.012),ruling(slab.y,.013))*detail*.7);
      }
      color=mix(color,paper,.13*step(.48,wash)+.065*grain);
      float dist=min(min(edges.x,edges.y),min(edges.z,edges.w));
      float stroke=clamp(depth*.00095,.016,.065)*(.78+.46*wash);
      color=mix(color,sumi,(1.-smoothstep(stroke*.44,stroke*1.65,dist))*(.48+.39*detail));
      color+=detail*(grain-.5)*.052;
      float fog=smoothstep(15.,137.,depth);
      gl_FragColor=vec4(mix(color,vec3(.43,.49,.52),fog*.77),1.);
    }`;
  function shader(type, source) {
    const part = gl.createShader(type);
    gl.shaderSource(part,source);
    gl.compileShader(part);
    if (!gl.getShaderParameter(part,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(part));
    return part;
  }

  const mesh = [];
  const colors = new Map();
  function face(a,b,c,d,color) {
    if (!colors.has(color)) colors.set(color,[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255));
    const rgb=colors.get(color);
    // Distances to the four outer edges give a continuous keyblock contour
    // across both triangles, without drawing a diagonal down each wall.
    const length=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
    const w=Math.max(length(a,b),length(c,d)),h=Math.max(length(a,d),length(b,c));
    const points=[a,b,c,d], edges=[[0,0,w,h],[w,0,0,h],[w,h,0,0],[0,h,w,0]];
    const material=materials.get(color)||0;
    for(const i of [0,1,2,0,2,3]) mesh.push(...points[i],...rgb,...edges[i],material);
  }
  const timber='#855b40', beam='#aa6845', tile='#40617b', edge='#263e50', plaster='#dbbe93';
  const materials=new Map([[tile,1],['#63849a',1],['#536e80',1],[timber,2],[beam,2],['#bfa381',3]]);
  const baseRoof=[tile,'#63849a','#536e80'];
  const roofColors=[baseRoof,['#535f67','#76828a','#65747c'],['#445d60','#66817f','#586e71'],
    ['#555768','#787b8c','#686b7b'],['#465972','#6b8096','#5a6e83']];
  const wallColors=[plaster,'#ceb18e','#e3ccb0','#c8bd9c','#d8b7a0','#bdb7a6','#e0c59e'];
  const woodColors=[[timber,beam],['#765746','#966d50'],['#855441','#a76249'],
    ['#715849','#986f53'],['#89694b','#ab8059']];
  for(const roof of roofColors) for(const pigment of roof) materials.set(pigment,1);
  for(const wood of woodColors) for(const pigment of wood) materials.set(pigment,2);
  function block(x,y,z,w,h,l,col) {
    const a=[x,y,z], b=[x+w,y,z], c=[x+w,y,z+l], d=[x,y,z+l];
    const up=p=>[p[0],p[1]+h,p[2]];
    face(a,b,up(b),up(a),col); face(b,c,up(c),up(b),col);
    face(c,d,up(d),up(c),col); face(d,a,up(a),up(d),col);
    face(up(a),up(b),up(c),up(d),col);
  }
  function roof(x,z,w,l,y,h,roofInk=baseRoof,eaveInk=timber) {
    const ridge=Math.max(.15,(l-w)*.5);
    for(const sign of [-1,1]) {
      const ring=t=>[x+sign*w*.5*t,y+h*(1-t)*(1-t*.45),ridge+(l*.5-ridge)*t];
      let last=ring(0);
      for(let k=1;k<=4;k++){
        const cur=ring(k/4);
        face([last[0],last[1],z-last[2]],[cur[0],cur[1],z-cur[2]],
          [cur[0],cur[1],z+cur[2]],[last[0],last[1],z+last[2]],sign<0?roofInk[1]:roofInk[0]);
        for(const end of [-1,1]) {
          face([x,last[1],z+end*last[2]],[last[0],last[1],z+end*last[2]],
            [cur[0],cur[1],z+end*cur[2]],[x,cur[1],z+end*cur[2]],roofInk[2]);
        }
        last=cur;
      }
      block(x+sign*w/2-.04,y-.12,z-l/2,.08,.14,l,edge);
      // Narrow raised tiles follow the slope from the ridge towards the eaves.
      const ribs=Math.ceil(l/.48);
      for(let j=0;j<=ribs;j++){
        const f=j/ribs*2-1;
        for(let k=0;k<4;k++){
          const a=ring(k/4),b=ring((k+1)/4);
          face([a[0],a[1]+.024,z+f*a[2]],[b[0],b[1]+.024,z+f*b[2]],
            [b[0],b[1]+.024,z+f*b[2]+.035],[a[0],a[1]+.024,z+f*a[2]+.035],edge);
        }
      }
    }
    block(x-.11,y+h,z-ridge-.15,.22,.14,ridge*2+.3,edge);
    for(const end of [-1,1])block(x-w/2,y-.12,z+end*l/2,w,.15,.09,eaveInk);
  }
  // Street runs along +Z. Shopfronts on both sides face the centre line.
  function shop(side,z,i){
    const id=(side<0 ? i*2 : (i-2)*2+1);
    const roofInk=roofColors[(id*3+Math.floor(id/5))%roofColors.length];
    const wallInk=wallColors[(id*3)%wallColors.length];
    const [woodInk,beamInk]=woodColors[(id+Math.floor(id/7))%woodColors.length];
    const h=3.1+((i*7+(side+1)*3)%5)*.48;
    const w=4.6+(i%3)*.4,l=5.6+(i%2)*.65;
    const x=side*(5.3+w/2+(i%3)*.22);
    const front=x-side*w/2;
    block(x-w/2,0,z-l/2,w,h,l,wallInk);
    for(let n=0;n<6;n++){
      const zz=z-l/2+.2+n*(l-.4)/5;
      block(front-.055,.06,zz,.11,h-.1,.105,woodInk);
    }
    for(let n=0;n<3;n++){
      const zz=z-l/2+.25+n*(l-.45)/3, len=(l-.65)/3;
      block(front-.065,.3,zz,.13,1.65,len,n===1?beamInk:'#d4b888');
      for(let j=1;j<7;j++)block(front-.08,.3,zz+j*len/7,.16,1.65,.035,woodInk);
      block(front-.09,1.1,zz,.18,.055,len,woodInk);
    }
    block(front-.1,2.05,z-l/2,.2,.14,l,beamInk);
    const awning=front-side*.78;
    face([front,2.7,z-l/2],[awning,2.32,z-l/2],[awning,2.32,z+l/2],[front,2.7,z+l/2],roofInk[0]);
    block(awning-.12,2.22,z-l/2,.24,.12,l,edge);
    if(i%3!==0){
      const cloth=['#345053','#8d5343','#4f5966'][i%3];
      for(let k=0;k<3;k++) block(awning-.035,1.63,z-.66+k*.44,.07,.55,.41,cloth);
    }
    block(awning-.19,1.53,z-l*.36,.38,.52,.38,'#e2a968');
    block(awning-.19,2.02,z-l*.36,.38,.06,.38,woodInk);
    roof(x,z,w+1.05,l+.58,h,1.7,roofInk,woodInk);
  }
  block(-85,-.31,-55,170,.22,305,'#927e67');
  block(-4.6,-.09,-55,9.2,.07,305,'#bfa381');
  for(let z=-45;z<226;z+=2.2){
    face([-4.6,0,z],[4.6,0,z],[4.6,0,z+.028],[-4.6,0,z+.028],'#7c7163');
  }
  for(let i=0;i<38;i++){
    const z=i*7.1-32;
    shop(-1,z,i);shop(1,z+1.65,i+2);
  }
  for(const [x,z] of [[-15,35],[17,123],[-16,197]]){
    block(x-3.1,0,z-3.1,6.2,3.1,6.2,timber);
    for(let i=0;i<5;i++){
      const size=10-i*1.38,base=3+i*3.2;
      block(x-size*.31,base,z-size*.31,size*.62,2.8,size*.62,beam);
      const half=size*.31;
      block(x-half-.13,base+.25,z-half-.13,size*.62+.26,.15,size*.62+.26,timber);
      for(let j=-2;j<=2;j++){
        block(x+j*half*.44-.045,base+.48,z-half-.07,.09,1.5,.14,timber);
      }
      block(x-half,base+1.88,z-half-.1,size*.62,.13,.2,timber);
      roof(x,z,size,size,base+2.2,1.75);
    }
    block(x-.09,19,z-.09,.18,3.2,.18,edge);
  }

  let program, eye, aspect;
  function setup() {
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buf=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
    for(const [name,offset] of [['point',0],['pigment',12],['faceEdges',24],['material',40]]){
      const id=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(id);
      gl.vertexAttribPointer(id,name==='material'?1:name==='faceEdges'?4:3,gl.FLOAT,false,44,offset);
    }
    eye=gl.getUniformLocation(program,'eye');aspect=gl.getUniformLocation(program,'aspect');
    gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  }
  let z=0,target=0,previous=0,elapsed=0,frame=0;
  const city=canvas.parentElement, runner=city.querySelector('.runner');
  function draw(now){
    frame=0;
    if(document.hidden||gl.isContextLost())return;
    const dt=Math.min(.06,(now-previous)/1000);previous=now;
    const moving=!document.body.classList.contains('paused');
    if(moving){elapsed+=dt;target=Math.min(100,target+dt*.198);}
    z+=(target-z)*(1-Math.exp(-dt*10));
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,1.5);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    }
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const altitude=5.7;
    gl.uniform3f(eye,0,altitude,z);gl.uniform1f(aspect,w/h);
    gl.drawArrays(gl.TRIANGLES,0,mesh.length/11);
    // Project the passing silhouette onto a nearby roof in world coordinates.
    const jump=elapsed%21-16;
    runner.style.opacity=moving && jump>0 && jump<1.3 ? '1':'0';
    if(jump>0 && jump<1.3){
      const t=jump/1.3;
      const deltaZ=Math.floor((z+20+32)/7.1)*7.1-32+7*t-z;
      const dy=5.3+2*Math.sin(Math.PI*t)-altitude;
      const d=deltaZ*cityCamera.cosPitch-dy*cityCamera.sinPitch;
      const sx=w/2+6.4*(h*cityCamera.lens/2)/d,sy=h/2-(dy*cityCamera.cosPitch+deltaZ*cityCamera.sinPitch)*(h*cityCamera.lens/2)/d;
      runner.style.transform='translate('+sx+'px,'+(sy-32)+'px) scale('+(h*.028/d)+')';
    }
    city.classList.add('rendering');
    if(moving||Math.abs(target-z)>.003)requestDraw();
  }
  function requestDraw(){if(!frame)frame=requestAnimationFrame(draw);}
  function start(){try{setup();requestDraw();}catch(error){console.warn('Kyoto scene unavailable',error);}}
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();city.classList.remove('rendering');});
  canvas.addEventListener('webglcontextrestored',start);
  window.addEventListener('wheel',e=>{
    if(e.ctrlKey||e.defaultPrevented||document.querySelector('dialog[open]')||e.target.closest('#topics.docked #filter-panel')||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;
    target=Math.max(-20,Math.min(100,target+Math.max(-9,Math.min(9,e.deltaY*unit*.024))));
    requestDraw();
  },{passive:true});
  new ResizeObserver(requestDraw).observe(canvas);
  new MutationObserver(requestDraw).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',requestDraw);
  start();
})();
