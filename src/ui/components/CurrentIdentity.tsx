import {useEffect,useState} from 'react';
import {useSession} from '../../application/FolioProvider';
import {ProfileAvatar} from './ProfileAvatar';
export function CurrentIdentity(){const {controller,repo,profileId,controllerRevision}=useSession();const [name,setName]=useState('Your Folio');useEffect(()=>{if(profileId)void repo.listProfiles().then(list=>setName(list.find(p=>p.profileId===profileId)?.label??'Your Folio'));},[repo,profileId,controllerRevision]);return <div className="current-identity"><ProfileAvatar name={name} photo={controller?.snapshot.identity?.photo}/><span>{name}</span></div>;}
