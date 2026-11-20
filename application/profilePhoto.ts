export async function prepareProfilePhoto(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG or WebP photo.');
 if(file.size>15*1024*1024)throw new Error('Choose a photo smaller than 15 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('Invalid image');
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const context=canvas.getContext('2d');if(!context)throw new Error('Image processing unavailable');
  const side=Math.min(image.naturalWidth,image.naturalHeight);context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,256,256);
  const data=canvas.toDataURL('image/jpeg',0.82);if(data.length>150000)throw new Error('Photo could not be reduced sufficiently.');return data;
 }catch{throw new Error('Folio couldn’t read this photo. Choose a valid JPEG, PNG or WebP image.');}finally{URL.revokeObjectURL(url);}
}
