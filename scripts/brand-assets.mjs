import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const quill='M51 7C34 5 17 16 15 34c-1 7 2 12 7 14L12 57l3 3 12-13c12 0 25-13 25-30 0-4 0-7-1-10ZM24 40 43 16 29 38l12-3-15 9-2-4Z';
const mark=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#D9A441" d="${quill}"/></svg>`;
const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0E1626"/><path fill="#D9A441" d="${quill}"/></svg>`;
await fs.writeFile('public/folio-mark.svg',mark);await fs.writeFile('public/favicon.svg',icon);
await sharp(Buffer.from(icon)).resize(512,512).png().toFile('public/icon-512.png');
const sizes=[16,24,32,48,64,128,256];const frames=await Promise.all(sizes.map(size=>sharp(Buffer.from(icon)).resize(size,size).png().toBuffer()));
const header=Buffer.alloc(6+16*frames.length);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);let offset=header.length;
frames.forEach((frame,i)=>{const p=6+i*16;header[p]=sizes[i]===256?0:sizes[i];header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(frame.length,p+8);header.writeUInt32LE(offset,p+12);offset+=frame.length;});
await fs.mkdir('build',{recursive:true});await fs.writeFile('build/folio.ico',Buffer.concat([header,...frames]));
for(const [density,legacy,adaptive] of [['mdpi',48,108],['hdpi',72,162],['xhdpi',96,216],['xxhdpi',144,324],['xxxhdpi',192,432]]){
 const folder=`android/app/src/main/res/mipmap-${density}`;
 for(const name of ['ic_launcher','ic_launcher_round'])await sharp(Buffer.from(icon)).resize(legacy,legacy).png().toFile(`${folder}/${name}.png`);
 const foreground=`<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108"><g transform="translate(21 21) scale(1.03125)"><path fill="#D9A441" d="${quill}"/></g></svg>`;
 await sharp(Buffer.from(foreground)).resize(adaptive,adaptive).png().toFile(`${folder}/ic_launcher_foreground.png`);
}
const adaptive=`<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/><monochrome android:drawable="@drawable/folio_monochrome"/></adaptive-icon>`;
for(const name of ['ic_launcher','ic_launcher_round'])await fs.writeFile(`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`,adaptive);
await fs.writeFile('android/app/src/main/res/values/ic_launcher_background.xml','<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#0E1626</color></resources>');
await fs.writeFile('android/app/src/main/res/drawable/folio_monochrome.xml',`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><group android:translateX="21" android:translateY="21" android:scaleX="1.03125" android:scaleY="1.03125"><path android:fillColor="#FFFFFFFF" android:pathData="${quill}"/></group></vector>`);
for(const folder of await fs.readdir('android/app/src/main/res')){
 const filename=path.join('android/app/src/main/res',folder,'splash.png');
 try{const m=await sharp(filename).metadata();const width=m.width,height=m.height;const size=Math.min(256,Math.round(Math.min(width,height)*.3));const emblem=await sharp(Buffer.from(mark)).resize(size,size).png().toBuffer();const out=await sharp({create:{width,height,channels:4,background:'#0E1626'}}).composite([{input:emblem,gravity:'center'}]).png().toBuffer();await fs.writeFile(filename,out);}catch(error){if(error.code!=='ENOENT'&&!String(error).includes('Input file is missing'))throw error;}
}
await sharp('build/artwork/folio-hero-original.png').resize({width:1440,withoutEnlargement:true}).webp({quality:85}).toFile('public/folio-hero.webp');
await sharp('build/artwork/example-meera-original.png').resize(256,256,{fit:'cover'}).webp({quality:85}).toFile('public/example-meera.webp');
console.log('Quill: seven ICO sizes, legacy/adaptive/monochrome Android assets, splash; optimized supplied hero and fictional portrait.');
