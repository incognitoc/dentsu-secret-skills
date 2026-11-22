// Kyoto is a single static mesh drawn as a woodblock print: flat colour plates,
// bokashi gradients, a sumi keyline round every face and a soft paper tooth.
// Materials: 0 plain, 1 roof tile, 2 timber, 3 paving, 4 mountain, 5 sky,
// 6 foliage, 7 lamplight, 8 hillside.
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
      if(material>4.5&&material<5.5)gl_Position.z=.999999*gl_Position.w;
      depth=d; ink=pigment; world=point; edges=faceEdges; surface=material;
    }`;
  // Surfaces are printed with swatches cut from the painted backdrop itself
  // (see paintingAtlas below), so near geometry and the painting share one hand.
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
    const vec3 sumi = vec3(.08,.075,.08);
    float hash(vec2 p) {
      p=fract(p*vec2(.1031,.11369));
      p+=dot(p,p.yx+19.19);
      return fract((p.x+p.y)*p.x);
    }
    vec2 mirrored(vec2 u){return 1.-abs(1.-mod(u,2.));}
    // The atlas is a 4x2 grid of swatches.
    float noise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
    }
    vec3 cut(float cell,vec2 u){
      vec2 origin=vec2(mod(cell,4.),floor(cell/4.))*vec2(.25,.5);
      vec2 inset=.01+mirrored(u)*.98;
      return texture2D(printPlate,origin+inset*vec2(.25,.5)).rgb;
    }
    // Two offset impressions of each swatch, mixed through a soft blotch mask,
    // break up the repeat and the mirror seams.
    vec3 swatch(float cell,vec2 u){
      float m=smoothstep(.35,.65,noise(u*.9+cell*7.));
      return mix(cut(cell,u),cut(cell,u*1.07+vec2(.37,.71)),m);
    }
    void main() {
      vec2 face=vec2(world.x*.6+world.z*.8,world.y);
      float tone=.9+.2*hash(floor(world.xz*.5+world.y*.3));
      vec3 color;
      if(surface>.5&&surface<1.5){
        color=swatch(0.,vec2(world.z*.42,world.y*1.1+abs(world.x)*.25));
      } else if(surface>1.5&&surface<2.5){
        color=swatch(1.,face*vec2(.42,.36));
      } else if(surface>2.5&&surface<3.5){
        color=swatch(2.,world.xz*vec2(.16,.3));
      } else if(surface>5.5&&surface<6.5){
        float cell=ink.r>ink.g+.25?5.:(ink.r>.8?6.:7.);
        color=swatch(cell,vec2(world.x*.3+world.z*.2,world.y*.3+world.z*.15));
      } else if(surface>6.5&&surface<7.5){
        color=swatch(4.,face*vec2(.6,.5))*1.08;
      } else {
        color=swatch(3.,face*vec2(.35,.5));
      }
      color*=tone;
      float dist=min(min(edges.x,edges.y),min(edges.z,edges.w));
      float stroke=clamp(depth*.001,.018,.07);
      float line=(1.-smoothstep(stroke*.5,stroke*1.5,dist))*.45;
      if(surface>5.5&&surface<6.5)line=0.;
      color=mix(color,sumi,line);
      gl_FragColor=vec4(color,1.);
    }`;
  function shader(type, source) {
    const part = gl.createShader(type);
    gl.shaderSource(part,source);
    gl.compileShader(part);
    if (!gl.getShaderParameter(part,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(part));
    return part;
  }

  // Distance along the street sets both its centre line and the elevation of each terrace.
  const centerX=t=>5.6*Math.sin(t/16)+2.4*Math.sin(t/8+.25);
  const elevation=t=>-.24*t-1.1*Math.sin(t/16);
  const bearing=t=>Math.atan((centerX(t+.1)-centerX(t-.1))/.2);
  function streetPoint(side,t,y){
    const a=bearing(t);
    return [centerX(t)+side*Math.cos(a),y,t-side*Math.sin(a)];
  }
  // Path, terraces and shops all repeat every PERIOD, so the walk can loop forever.
  const PERIOD=32*Math.PI, LOTS=14;
  let seed=7;
  const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
  let lot=null;
  const mesh = [];
  const colors = new Map();
  const materials = new Map();
  function face(a,b,c,d,color,mat) {
    if (!colors.has(color)) colors.set(color,[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255));
    const rgb=colors.get(color);
    // Distances to the four outer edges give a continuous keyblock contour
    // across both triangles, without drawing a diagonal down each wall.
    const length=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
    const w=Math.max(length(a,b),length(c,d)),h=Math.max(length(a,d),length(b,c));
    const points=[a,b,c,d], edges=[[0,0,w,h],[w,0,0,h],[w,h,0,0],[0,h,w,0]];
    const material=mat??materials.get(color)??0;
    const placed=lot?points.map(([x,y,z])=>[
      lot.x+x*lot.cos+(z-lot.t)*lot.sin,lot.y+y,
      lot.t-x*lot.sin+(z-lot.t)*lot.cos
    ]):points;
    for(const i of [0,1,2,0,2,3]) mesh.push(...placed[i],...rgb,...edges[i],material);
  }
  function block(x,y,z,w,h,l,col,mat) {
    const a=[x,y,z], b=[x+w,y,z], c=[x+w,y,z+l], d=[x,y,z+l];
    const up=p=>[p[0],p[1]+h,p[2]];
    face(a,b,up(b),up(a),col,mat); face(b,c,up(c),up(b),col,mat);
    face(c,d,up(d),up(c),col,mat); face(d,a,up(a),up(d),col,mat);
    face(up(a),up(b),up(c),up(d),col,mat);
  }

  // Palette sampled from Edo-period landscape prints.
  const sumiInk='#1c1d20', lamp='#f0a050', vermilion='#c2452c', vermilionDark='#93321f';
  const tileInks=[['#5b6866','#6f7c78','#4d5957'],['#55605f','#68736f','#475150'],
    ['#606a6a','#77817c','#525b5a'],['#4f5c5e','#64716f','#434f51']];
  const plasterInks=['#d9c39a','#cdb48c','#e0cba5','#c9b28e','#d4bd95'];
  const woodInks=[['#4a3426','#5e4330'],['#3f2d22','#55402f'],['#53392a','#6a4a35'],['#463328','#5a4232']];
  for(const set of tileInks)for(const c of set)materials.set(c,1);
  for(const set of woodInks)for(const c of set)materials.set(c,2);
  materials.set(lamp,7);

  // Gable roof with a long ridge, upturned eaves and raised tile ribs.
  function roof(x,z,w,l,y,h,ink=tileInks[0],eaveInk=woodInks[0][0],ridgeLength){
    const ridge=ridgeLength??Math.max(.15,l*.5-w*.16);
    const lift=t=>h*(1-t)*(1-t*.55)+h*.12*Math.pow(t,4);
    for(const sign of [-1,1]){
      const ring=t=>[x+sign*w*.5*t,y+lift(t),ridge+(l*.5-ridge)*t];
      let last=ring(0);
      for(let k=1;k<=5;k++){
        const cur=ring(k/5);
        face([last[0],last[1],z-last[2]],[cur[0],cur[1],z-cur[2]],
          [cur[0],cur[1],z+cur[2]],[last[0],last[1],z+last[2]],sign<0?ink[1]:ink[0]);
        for(const end of [-1,1]){
          face([x,last[1],z+end*last[2]],[last[0],last[1],z+end*last[2]],
            [cur[0],cur[1],z+end*cur[2]],[x,cur[1],z+end*cur[2]],ink[2]);
        }
        last=cur;
      }
      block(x+sign*w/2-.05,y+lift(1)-.14,z-l/2,.1,.16,l,sumiInk,0);
      const ribs=Math.ceil(l/.6);
      for(let j=0;j<=ribs;j++){
        const f=j/ribs*2-1;
        for(let k=0;k<5;k++){
          const a=ring(k/5),b=ring((k+1)/5);
          face([a[0],a[1]+.03,z+f*a[2]],[b[0],b[1]+.03,z+f*b[2]],
            [b[0],b[1]+.03,z+f*b[2]+.05],[a[0],a[1]+.03,z+f*a[2]+.05],ink[2],1);
        }
      }
    }
    block(x-.14,y+h-.02,z-ridge-.2,.28,.22,ridge*2+.4,sumiInk,0);
    for(const end of [-1,1])block(x-w/2,y-.1,z+end*l/2,w,.14,.1,eaveInk,2);
  }

  // A tree is a stack of irregular rings; pines are flattened tiers.
  function tree(x,y,z,r,ink,kind){
    const sides=10, tiers=kind==='pine'?4:5;
    block(x-r*.08,y,z-r*.08,r*.16,r*.9,r*.16,'#3a2c22',2);
    const wob=[];for(let s=0;s<sides;s++)wob.push(.8+rand()*.4);
    for(let k=0;k<tiers;k++){
      let ry, rad, rad2, y0, y1;
      if(kind==='pine'){
        y0=y+r*(.7+k*.42); y1=y0+r*.22; rad=r*(1.05-k*.2); rad2=rad*.8;
      }else{
        const a=k/tiers*Math.PI, b=(k+1)/tiers*Math.PI;
        y0=y+r*(1.1-Math.cos(a)); y1=y+r*(1.1-Math.cos(b));
        rad=r*Math.sin(a)+.02; rad2=r*Math.sin(b)+.02;
      }
      for(let s=0;s<sides;s++){
        const a0=s/sides*Math.PI*2, a1=(s+1)/sides*Math.PI*2, w0=wob[s], w1=wob[(s+1)%sides];
        face([x+Math.cos(a0)*rad*w0,y0,z+Math.sin(a0)*rad*w0],[x+Math.cos(a1)*rad*w1,y0,z+Math.sin(a1)*rad*w1],
          [x+Math.cos(a1)*rad2*w1,y1,z+Math.sin(a1)*rad2*w1],[x+Math.cos(a0)*rad2*w0,y1,z+Math.sin(a0)*rad2*w0],ink,6);
      }
      if(kind==='pine'||k===tiers-1){
        for(let s=0;s<sides;s+=2){
          const a0=s/sides*Math.PI*2,a1=(s+1)/sides*Math.PI*2,a2=(s+2)/sides*Math.PI*2;
          face([x,y1,z],[x+Math.cos(a0)*rad2,y1,z+Math.sin(a0)*rad2],
            [x+Math.cos(a1)*rad2,y1,z+Math.sin(a1)*rad2],[x+Math.cos(a2)*rad2,y1,z+Math.sin(a2)*rad2],ink,6);
        }
      }
    }
  }
  const foliage={sakura:['#e9b7b9','#f0c9c6','#dfa4ab'],maple:['#d3542c','#e0703a','#c4432a'],
    green:['#4d6a3c','#5c7a45','#3f5c37'],pine:['#2e4a36','#36553c']};
  const pick=a=>a[Math.floor(rand()*a.length)];
  function randomTree(x,y,z,r){
    const roll=rand();
    if(roll<.22)tree(x,y,z,r,pick(foliage.sakura),'round');
    else if(roll<.40)tree(x,y,z,r,pick(foliage.maple),'round');
    else if(roll<.70)tree(x,y,z,r*1.1,pick(foliage.pine),'pine');
    else tree(x,y,z,r,pick(foliage.green),'round');
  }

  // Machiya shopfronts along +Z: dark timber lattice lit from within,
  // pale plaster above, lanterns and noren under the eaves.
  function shop(side,z,i){
    const id=(side<0?i*2:(i-2)*2+1);
    const tile=tileInks[(id*3+Math.floor(id/5))%tileInks.length];
    const plaster=plasterInks[(id*3)%plasterInks.length];
    const [wood,beam]=woodInks[(id+Math.floor(id/7))%woodInks.length];
    const h=3.2+((i*7+(side+1)*3)%5)*.45;
    const w=4.6+(i%3)*.4,l=5.6+(i%2)*.65;
    const x=side*(4.45+w/2+(i%3)*.22);
    const front=x-side*w/2;
    block(x-w/2,-1.65,z-l/2,w,1.65,l,'#7b746a',3);
    block(x-w/2,0,z-l/2,w,h,l,wood);
    block(front-side*.02-.04,2.25,z-l/2+.1,.08,h-2.35,l-.2,plaster,0);
    for(let n=0;n<6;n++){
      const zz=z-l/2+.2+n*(l-.4)/5;
      block(front-.07,.06,zz,.14,h-.1,.12,beam);
    }
    for(let n=0;n<3;n++){
      const zz=z-l/2+.3+n*(l-.5)/3, len=(l-.75)/3;
      block(front-.05,.35,zz,.1,1.55,len,lamp);
      for(let j=1;j<9;j++)block(front-.1,.35,zz+j*len/9,.2,1.55,.04,wood);
      block(front-.11,1.12,zz,.22,.05,len,wood);
    }
    block(front-.12,2.05,z-l/2,.24,.16,l,beam);
    // Upper-storey mushiko window glowing through its slats.
    block(front-side*.03-.05,2.55,z-l*.22,.1,.6,l*.44,lamp);
    for(let j=0;j<8;j++)block(front-side*.06-.07,2.55,z-l*.22+j*l*.44/7,.14,.6,.05,wood);
    const awning=front-side*.85;
    face([front,2.75,z-l/2],[awning,2.35,z-l/2],[awning,2.35,z+l/2],[front,2.75,z+l/2],tile[0],1);
    block(awning-.12,2.25,z-l/2,.24,.12,l,sumiInk,0);
    if(i%3!==0){
      const cloth=['#2f4a5c','#8a3b2c','#3d4f3c'][i%3];
      for(let k=0;k<3;k++)block(awning-.035,1.6,z-.66+k*.44,.07,.62,.41,cloth,0);
    }
    block(awning-.2,1.45,z-l*.36,.4,.6,.4,lamp);
    block(awning-.2,2.05,z-l*.36,.4,.07,.4,sumiInk,0);
    block(awning-.2,1.38,z-l*.36,.4,.07,.4,sumiInk,0);
    roof(x,z,w+1.1,l+.6,h,1.75,tile,wood);
  }

  // Stone stair street, with granite curbs and a moss strip beyond.
  const tread=1.05, halfWidth=3.7;
  for(let i=-50;i<236;i++){
    const t=i*tread,end=t+tread,y=elevation(t);
    const left=streetPoint(-halfWidth,t,y),right=streetPoint(halfWidth,t,y);
    const nextLeft=streetPoint(-halfWidth,end,y),nextRight=streetPoint(halfWidth,end,y);
    face(left,right,nextRight,nextLeft,'#a59a86',3);
    face(nextLeft,nextRight,streetPoint(halfWidth,end,elevation(end)),streetPoint(-halfWidth,end,elevation(end)),'#6d665b',0);
    for(const sign of [-1,1]){
      face(streetPoint(sign*halfWidth,t,y-.05),streetPoint(sign*14,t,y-.05),
        streetPoint(sign*14,end,elevation(end)-.05),streetPoint(sign*halfWidth,end,elevation(end)-.05),'#6e6858',3);
    }
  }
  for(let i=0;i<38;i++){
    for(const side of [-1,1]){
      const k=i%LOTS,t=i*PERIOD/LOTS-32+(side>0?1.65:0),a=bearing(t);
      lot={t,x:centerX(t),y:elevation(t),cos:Math.cos(a),sin:Math.sin(a)};
      seed=1+k*2+(side>0?1:0);
      shop(side,t,k+(side>0?2:0));
    }
  }
  lot=null;

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
    // Build the swatch atlas from regions of the painted backdrop.
    const plate=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,plate);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([90,90,90,255]));
    const image=new Image();
    image.onload=()=>{
      if(!gl.isTexture(plate))return;
      const atlas=document.createElement('canvas');atlas.width=1024;atlas.height=512;
      const g=atlas.getContext('2d');
      // [x,y,w,h] in the 1774x887 painting: tiles, timber lattice, stone steps,
      // plaster, lit shoji, maple, cherry blossom, green canopy.
      [[0,0,1,1],[478,645,120,140],[905,805,170,72],[336,572,105,40],
       [612,812,42,62],[1190,598,150,80],[20,400,170,100],[1240,690,120,70]]
        .forEach(([x,y,w,h],i)=>g.drawImage(image,x,y,w,h,(i%4)*256,Math.floor(i/4)*256,256,256));
      // The foreground roof's courses rise about 20 degrees; rotate them level.
      g.save();g.beginPath();g.rect(0,0,256,256);g.clip();
      g.translate(128,128);g.scale(256/230,256/120);g.rotate(20*Math.PI/180);
      g.drawImage(image,-1500,-790);g.restore();
      gl.bindTexture(gl.TEXTURE_2D,plate);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      requestDraw();
    };
    image.src='assets/kyoto.webp';
    heading=gl.getUniformLocation(program,'heading');
    eye=gl.getUniformLocation(program,'eye');aspect=gl.getUniformLocation(program,'aspect');
    gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  }
  let z=0,target=0,previous=0,elapsed=0,frame=0;
  // Heading range over the scroll span sizes the painted backdrop.
  const headingAt=t=>Math.atan((centerX(t+10)-centerX(t))/10);
  const restAngle=headingAt(0), panScale=.12;
  let minAngle=restAngle,maxAngle=restAngle;
  for(let t=-20;t<=PERIOD+20;t++){minAngle=Math.min(minAngle,headingAt(t));maxAngle=Math.max(maxAngle,headingAt(t));}
  const city=canvas.parentElement, backdrop=city.querySelector('.skyline');
  function draw(now){
    frame=0;
    if(document.hidden||gl.isContextLost())return;
    const dt=Math.min(.06,(now-previous)/1000);previous=now;
    const moving=!document.body.classList.contains('paused');
    if(moving){elapsed+=dt;target+=dt*.2614;}
    if(z>PERIOD){z-=PERIOD;target-=PERIOD;}
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
    // The painting sits at infinity, so it turns with the camera one-for-one:
    // a pan of r radians slides it by focal*tan(r) pixels the other way.
    // Damped below one-for-one so the whole painting, pagoda included, stays in frame.
    const focal=h*cityCamera.lens/2*panScale, rel=angle-restAngle;
    const leftNeed=focal*Math.tan(-minAngle+restAngle+.04), rightNeed=focal*Math.tan(maxAngle-restAngle+.04);
    const imgW=Math.max(w+leftNeed+rightNeed,h*2), imgH=imgW/2;
    const left0=-leftNeed-(imgW-w-leftNeed-rightNeed)/2;
    const top=Math.min(0,Math.max(h-imgH,h*.5-.47*imgH));
    Object.assign(backdrop.style,{inset:'auto',left:left0+'px',top:top+'px',width:imgW+'px',height:imgH+'px',
      backgroundSize:'100% 100%',transform:'translateX('+(-Math.tan(rel)*focal)+'px)'});
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
    target=Math.max(-20,(target+Math.max(-9,Math.min(9,e.deltaY*unit*.024))));
    requestDraw();
  },{passive:true});
  new ResizeObserver(requestDraw).observe(canvas);
  new MutationObserver(requestDraw).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',requestDraw);
  start();
})();
