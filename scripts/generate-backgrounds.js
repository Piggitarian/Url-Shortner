// Original animated landscapes, drawn and encoded locally with JavaScript.
import gifenc from 'gifenc';
import { mkdir, writeFile } from 'node:fs/promises';
const { GIFEncoder } = gifenc;
// Landscapes · Step 1: Define the canvas size, animation duration, and palette helpers.
const W = 640, H = 360, FRAMES = 72;
const rgb = hex => hex.match(/\w\w/g).map(v => parseInt(v, 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// Landscapes · Step 2: Assign each theme a sky gradient and landscape palette.
const themes = {
  meadow: { sky: ['34594f','a5ad87'], colors: ['d1c7a0','aab899','92a58a','688b75','4d7864','3d6855','325a48','284c3c','203f32','193329','759886','658d7f','90b19b','d4d5a8','b5ba87','596b43','7a8752','acc57c','d0d7a3','e5dcae','ded8a4','40523a','dfb589','e9e4bf'] },
  dusk: { sky: ['302d4b','b4919b'], colors: ['cbb3b5','a49ab1','8888a6','696d94','545c82','444e73','354261','2d3755','232c46','1c253b','706d91','615f86','9994b1','c4b1c2','b3a3b5','4e4c73','6a618a','b5a3ca','d7c5d9','e7cfc2','cfb8c8','3e3b59','bd90a6','eee0d1'] },
  ocean: { sky: ['345865','abc5bb'], colors: ['d3d5bf','a6c3bc','91b1ae','729da1','5c8791','4a7684','396773','2c5763','234852','1c3b46','85b3b3','699ca2','a6cccc','d4ded0','b5c8ba','677e72','819990','9ebfaa','e1e4c7','e9e7cc','d8ddc2','3d5955','d5bca0','f3efd7'] },
  forest: { sky: ['243e3d','718578'], colors: ['a3b3a2','869e94','708b80','537968','416653','365741','284734','203b2c','193025','13261e','527b70','42695e','73968a','a3b4a2','8ca086','415139','566e47','9dbb7d','b6cf98','c8d7b0','a9ba94','2e4633','8ca687','d5dec1'] },
  ember: { sky: ['483b45','c5a18a'], colors: ['dcc4a2','b2a39b','a49292','897b7d','736b6f','62595b','55494a','463c3c','372e32','292429','9f8784','8a7776','b49b91','ddbc9b','c5a58a','625249','836b50','c8ac79','dfc693','f0d6ab','dcc4a1','493b39','d7a071','f5e1bb'] },
};
// Landscapes · Step 3: Build one indexed-color frame for the selected theme.
function createFrame(theme, frame) {
  const definition = themes[theme];
  // Darker, quieter colors while retaining the original landscape palette.
  const dim = color => color.map(channel => Math.round(channel * .79));
  const palette = Array.from({length:40},(_,i)=>dim(mix(rgb(definition.sky[0]),rgb(definition.sky[1]),i/39)));
  palette.push(...definition.colors.map(color=>dim(rgb(color))));
// Landscapes · Step 4: Provide pixel, rectangle, ellipse, polygon, hill, and tree drawing helpers.
  const pixels = new Uint8Array(W * H), t = frame / FRAMES * Math.PI * 2, C = i => 40+i;
  const put=(x,y,color)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H)pixels[y*W+x]=color;};
  const rect=(x,y,w,h,color)=>{for(let py=Math.max(0,Math.round(y));py<Math.min(H,Math.round(y+h));py++)for(let px=Math.max(0,Math.round(x));px<Math.min(W,Math.round(x+w));px++)pixels[py*W+px]=color;};
  const ellipse=(cx,cy,rx,ry,color)=>{for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(H-1,Math.ceil(cy+ry));y++){const s=Math.sqrt(Math.max(0,1-((y-cy)/ry)**2))*rx;rect(cx-s,y,s*2,1,color);}};
  const polygon=(points,color)=>{const ys=points.map(p=>p[1]);for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(H-1,Math.ceil(Math.max(...ys)));y++){const intersections=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))intersections.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));}intersections.sort((a,b)=>a-b);for(let i=0;i<intersections.length;i+=2)rect(intersections[i],y,intersections[i+1]-intersections[i],1,color);}};
  const hill=(height,amplitude,seed,color)=>{const points=[[0,H]];for(let x=-5;x<=W+5;x+=5)points.push([x,height+Math.sin(x/85+seed)*amplitude+Math.sin(x/34+seed)*amplitude/4]);points.push([W,H]);polygon(points,color);};
  const pine=(x,y,size,color)=>{rect(x-1,y-size*.5,2,size*.5+2,color);for(let i=0;i<4;i++){const base=y-size*.15-i*size*.17,width=size*(.27-i*.044);polygon([[x,base-size*.43],[x-width,base],[x+width,base]],color);}};
// Landscapes · Step 5: Draw the sky, drifting clouds, and sun or stars.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)pixels[y*W+x]=Math.min(39,Math.round(y/220*39)+((x+y)%5===0?1:0));
  for(const[x,y,width,height,phase]of[[80,80,52,5,0],[465,98,69,5,2],[555,44,29,3,3],[209,120,40,3,1]]){
    const shift=Math.sin(t+phase)*25;ellipse(x+shift,y,width,height,C(1));ellipse(x-15+shift,y-4,width/2,height,C(1));rect(x-width+shift,y+2,width*1.5,2,C(0));
  }
  if(theme==='dusk'||theme==='forest'){
    ellipse(482,72,16,16,C(23));ellipse(490,66,15,16,12);
    for(let i=0;i<38;i++){const x=(i*167+29)%W,y=(i*53+13)%119,color=Math.sin(t+i*2)>-.2?C(19):C(1);put(x,y,color);if(i%7===0){put(x-1,y,color);put(x+1,y,color);put(x,y-1,color);put(x,y+1,color);}}
  }else{
    ellipse(470,111,22,22,C(0));ellipse(470,111,17,17,C(19));
    for(let i=0;i<3;i++){const x=440+i*12+Math.sin(t)*12,y=57+i*4+Math.cos(t+i)*2;put(x,y,C(3));put(x-1,y-1,C(3));put(x+1,y-1,C(3));}
  }
// Landscapes · Step 6: Layer distant hills, shoreline trees, and animated water reflections.
  hill(164,17,0,C(2));hill(188,18,2,C(3));hill(211,18,4,C(4));
  for(let i=0;i<45;i++)pine(i*16-5,217+Math.sin(i)*9,16+i*13%16,C(4));
  rect(0,229,W,H-229,C(10));for(let y=230;y<H;y++)rect(0,y,W,1,C(Math.floor((y-230)/27)%2?11:10));
  for(let i=0;i<85;i++){const y=234+i*19%118,x=(i*97+Math.round(Math.sin(t+i)*18)+W)%W,width=5+i*7%30;rect(x,y,width,1,C(i%4===0?12:11));}
  for(let i=0;i<15;i++){const y=234+i*4,x=465+Math.sin(t+i)*(4+i/2);rect(x-12-i/2,y,24+i,1,C(i%3===0?13:12));}
  polygon([[0,216],[43,214],[86,224],[138,229],[172,241],[147,257],[106,269],[81,290],[0,317]],C(5));polygon([[640,214],[595,218],[566,233],[533,248],[527,274],[565,284],[640,291]],C(5));
// Landscapes · Step 7: Add the lighthouse and boat or forest details for each landscape.
  if(theme==='ocean'){
    polygon([[554,224],[550,189],[559,189],[563,224]],C(18));rect(550,192,10,4,C(4));rect(549,186,12,4,C(19));polygon([[548,186],[555,180],[562,186]],C(8));put(555,202,C(8));put(556,202,C(8));
    const shift=Math.sin(t)*3;rect(80+shift,251,24,3,C(7));polygon([[85+shift,251],[99+shift,251],[95+shift,246],[89+shift,246]],C(0));
  }else{
    for(let i=0;i<15;i++)pine(11+i*9,238+Math.sin(i)*6,28+i*13%25,C(6));for(let i=0;i<9;i++)pine(556+i*11,240+Math.sin(i)*8,36+i*11%20,C(6));
  }
// Landscapes · Step 8: Draw foreground banks, swaying plants, and small moving highlights.
  polygon([[0,267],[51,274],[74,289],[127,306],[172,327],[238,360],[0,360]],C(7));polygon([[640,270],[602,287],[572,301],[535,319],[478,347],[446,360],[640,360]],C(7));polygon([[0,304],[45,311],[97,336],[140,360],[0,360]],C(8));polygon([[640,315],[592,327],[555,349],[543,360],[640,360]],C(8));
  for(let i=0;i<9;i++){pine(-5+i*14,323+i*4,55+i*8%35,C(8));pine(572+i*12,331+i*3,55+i*11%40,C(8));}
  for(let i=0;i<100;i++){
    const x=(i*131+10)%W,y=322+i*29%38;if(x>100+(y-320)*3&&x<550-(y-320)*2)continue;
    const sway=Math.sin(t+i)*1.5;rect(x,y-5,1,6,C(15));put(x+sway,y-6,C(16));if(i%4===0){put(x+sway,y-7,C(theme==='dusk'?22:17));put(x+1+sway,y-7,C(18));}
  }
  for(let i=0;i<11;i++){const x=28+i*57%600+Math.sin(t+i)*5,y=235+i*29%108+Math.cos(t+i)*5;if(Math.sin(t+i*2)>.2){put(x,y,C(18));if(i%3===0){put(x-1,y,C(17));put(x+1,y,C(17));}}}
  // Drifting mist near the forest shore and floating leaves at sunset.
  if(theme==='forest')for(let i=0;i<8;i++)rect(120+i*33+Math.sin(t+i)*8,242+i%3*3,36+i*3,1,C(12));
  if(theme==='ember')for(let i=0;i<12;i++){const x=(i*71+35)%W+Math.sin(t+i)*9,y=130+i*13+Math.cos(t+i)*8;put(x,y,C(22));put(x+1,y,C(14));}
  return{pixels,palette};
}
// Landscapes · Step 9: Encode looping GIFs and export still posters for paused motion.
await mkdir(new URL('../public/assets/',import.meta.url),{recursive:true});
for(const theme of Object.keys(themes)){
  const gif=GIFEncoder();for(let frame=0;frame<FRAMES;frame++){
    const{pixels,palette}=createFrame(theme,frame);gif.writeFrame(pixels,W,H,{palette,delay:100,repeat:0});
    if(!frame){const still=GIFEncoder();still.writeFrame(pixels,W,H,{palette});still.finish();await writeFile(new URL(`../public/assets/${theme}-still.gif`,import.meta.url),still.bytes());}
  }
  gif.finish();await writeFile(new URL(`../public/assets/${theme}.gif`,import.meta.url),gif.bytes());console.log(`${theme}: ${FRAMES} frames, ${(gif.bytes().length/1024).toFixed(0)} KB`);
}
