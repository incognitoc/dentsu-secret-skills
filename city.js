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
    uniform vec2 heading;
    varying vec3 ink, world;
    varying float depth;
    void main() {
      vec3 p = point - eye;
      p.xz=vec2(p.x*heading.y-p.z*heading.x,p.x*heading.x+p.z*heading.y);
      float d = p.z * ${cityCamera.cosPitch} - p.y * ${cityCamera.sinPitch};
      float h = p.y * ${cityCamera.cosPitch} + p.z * ${cityCamera.sinPitch};
      gl_Position = vec4(p.x*${cityCamera.lens}/aspect,h*${cityCamera.lens},d*1.00016-0.20002,d);
      if(material>4.5)gl_Position.z=.999999*gl_Position.w;
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
    uniform sampler2D printPlate;
    const vec3 sumi = vec3(.049,.058,.064);
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
      if(surface>3.5){
        float tooth=texture2D(printPlate,world.xy*.036).g-.5;
        if(surface>4.5){
          float height=smoothstep(-22.,265.,world.y);
          vec3 dusk=mix(vec3(.89,.66,.49),vec3(.145,.29,.40),height);
          float moon=1.-smoothstep(18.,19.,distance(world.xy,vec2(340.,168.)));
          gl_FragColor=vec4(mix(dusk,vec3(1.,.79,.49),moon)+tooth*.12,1.);
        }else{
          gl_FragColor=vec4(ink+tooth*.11,1.);
        }
        return;
      }
      vec2 xy=world.xz+world.y*vec2(.31,.64);
      float detail=1.-smoothstep(12.,58.,depth);
      float grain=noise(xy*vec2(14.,24.));
      float wash=noise(xy*.72);
      vec3 color=ink;
      if(surface<1.5 && surface>.5) {
        // Indigo tile courses with an offset, unprinted lip on each row.
        float row=world.y*5.+noise(xy*2.)*.06;
        float seam=ruling(row,.058);
        float tilePrint=texture2D(printPlate,world.xz*vec2(.19,.24)).r-.5;
        color=mix(ink,paper,.09+.13*step(.5,fract(row)));
        color=mix(color,sumi,seam*.46*detail);
        color=mix(color,paper,ruling(row-.105,.026)*.27*detail);
        color+=vec3(.46,.43,.37)*tilePrint;
      } else if(surface>1.5 && surface<2.5) {
        float grainLine=world.y*8.+world.x*1.6+sin(world.z*1.5+world.y)*.35+wash*.42;
        color=mix(ink,sumi,ruling(grainLine,.06)*detail*.66);
        color=mix(color,paper,ruling(grainLine-.2,.024)*detail*.23);
      } else if(surface>2.5 && surface<3.5) {
        // Staggered paving blocks, cut into the same ochre colour plate.
        float row=world.z*.91 + .042*(noise(world.xz*1.3)-.5);
        vec2 slab=vec2(world.x*.57+.43*hash(vec2(floor(row),3.)),row);
        slab.x+=.035*(noise(world.xz*2.)-.5);
        float stone=hash(floor(slab));
        color=mix(vec3(.42,.46,.46),ink,.27+.46*stone);
        color=mix(color,paper,.16*wash+.09*grain);
        color=mix(color,sumi,max(ruling(slab.x,.012),ruling(slab.y,.013))*detail*(.22+.24*wash));
      }
      // Coordinates follow the masonry and wood, including vertical shop fronts.
      vec2 sheet=vec2(world.x+world.z*.73,world.y+world.z*.52-world.x*.24);
      vec2 impression=texture2D(printPlate,sheet*.41).gb-.5;
      color=mix(color,paper,.14*smoothstep(.27,.76,wash)+.04*grain);
      color+=impression.x*vec3(.33,.31,.28)+impression.y*vec3(.22,.17,.12);
      float dist=min(min(edges.x,edges.y),min(edges.z,edges.w));
      float stroke=clamp(depth*.00095,.016,.065)*(.78+.46*wash);
      color=mix(color,sumi,(1.-smoothstep(stroke*.44,stroke*1.65,dist))*(.43+.35*detail));
      color+=detail*(grain-.5)*.052;
      float fog=smoothstep(15.,137.,depth);
      gl_FragColor=vec4(mix(color,vec3(.59,.56,.52),fog*.78),1.);
    }`;
  function shader(type, source) {
    const part = gl.createShader(type);
    gl.shaderSource(part,source);
    gl.compileShader(part);
    if (!gl.getShaderParameter(part,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(part));
    return part;
  }

  // Distance along the street sets both its centre line and the elevation of each terrace.
  const centerX=t=>5.6*Math.sin(t/15)+2.4*Math.sin(t/8+.25);
  const elevation=t=>-.24*t-1.1*Math.sin(t/16);
  const bearing=t=>Math.atan((centerX(t+.1)-centerX(t-.1))/.2);
  function streetPoint(side,t,y){
    const a=bearing(t);
    return [centerX(t)+side*Math.cos(a),y,t-side*Math.sin(a)];
  }
  let lot=null;
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
    const placed=lot?points.map(([x,y,z])=>[
      lot.x+x*lot.cos+(z-lot.t)*lot.sin,lot.y+y,
      lot.t-x*lot.sin+(z-lot.t)*lot.cos
    ]):points;
    for(const i of [0,1,2,0,2,3]) mesh.push(...placed[i],...rgb,...edges[i],material);
  }
  const timber='#855b40', beam='#aa6845', tile='#40617b', edge='#202c34', plaster='#dbbe93';
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
    const x=side*(4.45+w/2+(i%3)*.22);
    const front=x-side*w/2;
    block(x-w/2,-1.65,z-l/2,w,1.65,l,'#81776a');
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
  const tread=1.05, halfWidth=3.7;
  for(let i=-50;i<236;i++){
    const t=i*tread,end=t+tread,y=elevation(t);
    const left=streetPoint(-halfWidth,t,y),right=streetPoint(halfWidth,t,y);
    const nextLeft=streetPoint(-halfWidth,end,y),nextRight=streetPoint(halfWidth,end,y);
    face(left,right,nextRight,nextLeft,'#bfa381');
    face(nextLeft,nextRight,streetPoint(halfWidth,end,elevation(end)),streetPoint(-halfWidth,end,elevation(end)),'#887866');
    for(const sign of [-1,1]){
      face(streetPoint(sign*halfWidth,t,y-.05),streetPoint(sign*14,t,y-.05),
        streetPoint(sign*14,end,elevation(end)-.05),streetPoint(sign*halfWidth,end,elevation(end)-.05),'#927e67');
    }
  }
  for(let i=0;i<38;i++){
    for(const side of [-1,1]){
      const t=i*7.1-32+(side>0?1.65:0),a=bearing(t);
      lot={t,x:centerX(t),y:elevation(t),cos:Math.cos(a),sin:Math.sin(a)};
      shop(side,t,i+(side>0?2:0));
    }
  }
  lot=null;

  // The entire valley is projected by the street camera, including the skyline.
  const skyInk='#506b80';
  materials.set(skyInk,5);
  for(let i=0;i<64;i++){
    const a=i*Math.PI/32,b=(i+1)*Math.PI/32;
    const x=850*Math.sin(a),z=850*Math.cos(a),xx=850*Math.sin(b),zz=850*Math.cos(b);
    face([x,-1800,z],[xx,-1800,zz],[xx,1800,zz],[x,1800,z],skyInk);
  }
  for(const [distance,base,amplitude,pigment] of [
    [580,47,22,'#748286'],[465,21,15,'#606f71'],[350,-4,11,'#526561']
  ]){
    materials.set(pigment,4);
    const ridge=x=>base+amplitude*(.68*Math.sin(x*.014+distance)+.29*Math.sin(x*.044)+.12*Math.cos(x*.089));
    for(let x=-1900;x<1900;x+=8){
      face([x,-220,distance],[x+8,-220,distance],[x+8,ridge(x+8),distance],[x,ridge(x),distance],pigment);
    }
  }
  face([-1500,-64,-100],[1500,-64,-100],[1500,-64,700],[-1500,-64,700],'#928770');
  for(let t=-60;t<250;t+=5){
    const y=elevation(t)-2.3,nextY=elevation(t+5)-2.3;
    face([-340,y,t],[340,y,t],[340,nextY,t+5],[-340,nextY,t+5],'#928770');
  }
  for(let row=0;row<6;row++){
    for(let n=-15;n<=15;n++){
      const x=n*9+3*Math.sin(row+n),t=50+row*28+4*Math.cos(n*3+row);
      if(Math.abs(x-centerX(t))<18)continue;
      const floor=elevation(t)-1.2,h=3.5+.8*Math.sin(n*row+2);
      block(x-3,floor-4,t-3,6,h+4,6,wallColors[Math.abs(n+row)%wallColors.length]);
      roof(x,t,7.3,8,floor+h,2.1);
    }
  }
  // Landmarks sit on terraces, so they keep their place as the camera turns.
  const towerX=-35,towerZ=78,base=elevation(towerZ)+4;
  block(towerX-5,base-10,towerZ-5,10,10,10,'#81776a');
  for(let k=0;k<5;k++){
    const width=11-k*1.5,y=base+k*3.8;
    block(towerX-width*.32,y,towerZ-width*.32,width*.64,2.8,width*.64,timber);
    roof(towerX,towerZ,width,width,y+2.7,1.9);
  }
  block(towerX-.12,base+20,towerZ-.12,.24,3.2,.24,edge);
  const templeY=elevation(82)+9;
  for(const x of [28,34,40])for(const t of [77,83,89])block(x,templeY-16,t,.7,16,.7,timber);
  block(26,templeY-1,75,17,1.2,16,beam);
  block(28,templeY,77,13,4.3,12,plaster);
  roof(34.5,83,17,19,templeY+4.2,3.8);

  let program, eye, aspect, heading;
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
    const plate=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,plate);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    const image=new Image();
    image.onload=()=>{
      if(!gl.isTexture(plate))return;
      gl.bindTexture(gl.TEXTURE_2D,plate);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      gl.generateMipmap(gl.TEXTURE_2D);
      requestDraw();
    };
    image.src='assets/kyoto-print.png';
    heading=gl.getUniformLocation(program,'heading');
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
    const altitude=elevation(z)+5.0;
    const angle=Math.atan((centerX(z+10)-centerX(z))/10);
    const sin=Math.sin(angle),cos=Math.cos(angle);
    gl.uniform2f(heading,sin,cos);
    gl.uniform3f(eye,centerX(z),altitude,z);gl.uniform1f(aspect,w/h);
    gl.drawArrays(gl.TRIANGLES,0,mesh.length/11);
    // Project the passing silhouette onto a nearby roof in world coordinates.
    const jump=elapsed%21-16;
    runner.style.opacity=moving && jump>0 && jump<1.3 ? '1':'0';
    if(jump>0 && jump<1.3){
      const t=jump/1.3;
      const deltaZ=Math.floor((z+20+32)/7.1)*7.1-32+7*t-z;
      const target=streetPoint(6.4,z+deltaZ,elevation(z+deltaZ)+5.3+2*Math.sin(Math.PI*t));
      const dx=target[0]-centerX(z),dz=target[2]-z;
      const lateral=dx*cos-dz*sin, forward=dx*sin+dz*cos;
      const dy=target[1]-altitude;
      const d=forward*cityCamera.cosPitch-dy*cityCamera.sinPitch;
      const sx=w/2+lateral*(h*cityCamera.lens/2)/d,sy=h/2-(dy*cityCamera.cosPitch+forward*cityCamera.sinPitch)*(h*cityCamera.lens/2)/d;
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
