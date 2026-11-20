import {useEffect,useState} from 'react';
import {useSession} from '../../application/FolioProvider';
import {ProfileAvatar} from './ProfileAvatar';
export function CurrentIdentity(){const {controller,repo,profileId,controllerRevision}=useSession();const [name,setName]=useState('Your Folio');useEffect(()=>{let active=true;if(profileId)void repo.listProfiles().then(list=>{if(active)setName(list.find(p=>p.profileId===profileId)?.label??'Your Folio');}).catch(()=>{if(active)setName('Your Folio');});return()=>{active=false;};},[repo,profileId,controllerRevision]);return <div className="current-identity"><ProfileAvatar name={name} photo={controller?.snapshot.identity?.photo}/><span>{name}</span></div>;}
