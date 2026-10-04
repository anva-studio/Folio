import {useState} from 'react';
export function ProfileAvatar({name,photo,size=44}:{name:string;photo?:string;size?:number}) {
 const [failed,setFailed]=useState<string>();
 const initials=name.trim().split(/\s+/).slice(0,2).map(n=>Array.from(n)[0]).join('').toUpperCase()||'F';
 return <span className="profile-avatar" style={{width:size,height:size}}>{photo&&photo!==failed?<img src={photo} alt={`${name}'s profile`} onError={()=>setFailed(photo)}/>:<span aria-label={`${name}'s initials`}>{initials}</span>}</span>;
}
