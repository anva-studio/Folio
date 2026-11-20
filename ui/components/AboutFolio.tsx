
import { FOLIO_VERSION } from '../../application/release';
import {ContactAnva} from './ContactAnva';
import {BrandMark} from './BrandMark';
import {CONTACT,openExternal} from '../../application/externalActions';
import {useProduct} from '../../application/productNavigation';
import {useState} from 'react';
export function AboutFolio() {
  const product=useProduct();const [error,setError]=useState('');
  return <>
    <section className="card about-card" aria-labelledby="about-folio-title">
      <h2 className="card-title" id="about-folio-title">About Folio</h2>
      <BrandMark size={48}/><p>Folio began with a simple idea: personal finances should feel personal.</p>
      <p>Made by ANVA for people who want a clearer way to record, understand, and plan their money, Folio brings accounts, transactions, schedules, debts, goals, planning, and reports together in one private space.</p>
      <p>Your financial records stay on your device. There is no bank login, no mandatory cloud account, and no need to hand your financial life to us just to make the app useful.</p>
      <p>Like everything we make, Folio is free to use. We hope it gives you a calmer place to understand where you are and think about where you want to go.</p>
      <p className="muted">Record → Understand → Plan → Protect</p>
      <p>Version {FOLIO_VERSION}</p>
    </section>
    <section className="card about-card" aria-labelledby="about-anva-title">
      <h2 className="card-title" id="about-anva-title">About ANVA</h2>
      <p className="about-lead">A tiny independent, AI-assisted software studio.</p>
      <p>ANVA is a tiny independent, AI-assisted software studio built around curiosity, creativity, and the simple joy of making things we wish existed.</p>
      <p>We use AI openly as part of our creative and development process—to explore ideas, solve problems, write and refine code, experiment, and help turn our ideas into working software. We don’t pretend otherwise, and we don’t see AI as something to hide. It’s simply one of the tools that makes ANVA possible.</p>
      <p>Our adventures can lead anywhere—from thoughtful creative tools and useful everyday software to games, experiments, and wonderfully unnecessary little ideas we simply couldn’t resist building.</p>
      <p>There’s no grand plan to fit everything into one category. If an idea feels useful, interesting, playful, or just too good to leave sitting in a conversation, we might turn it into something real.</p>
      <p>We build what we’d want to use, make it with care, and then move on to the next adventure.</p>
    </section>
    <button className="btn btn-secondary" onClick={()=>product.openHelp()}>Read Help & FAQ</button>
    <ContactAnva/>
    <section className="card about-card" aria-labelledby="support-anva-title">
      <h2 className="card-title" id="support-anva-title">Support ANVA</h2>
      <p>Everything we make is free to use. If you enjoy our work and feel like supporting our next adventure, you can buy us a coffee.</p>
      <p>Support is always appreciated and entirely optional. There’s nothing to unlock and no obligation—enjoy the app either way.</p>
      <a className="btn btn-secondary" href={CONTACT.coffee} target="_blank" rel="noopener noreferrer" onClick={e=>{e.preventDefault();void openExternal(CONTACT.coffee).catch(()=>setError('Could not open the browser. Visit '+CONTACT.coffee));}}>Buy ANVA a Coffee</a>{error&&<p role="alert">{error}</p>}
      <p className="muted">Opens an external website only when you choose this link.</p>
    </section>
    <section className="card about-card" aria-labelledby="privacy-title">
      <h2 className="card-title" id="privacy-title">Privacy &amp; use</h2>
      <p>Read how Folio stores your records, handles exports and protects access in Help.</p>
      <div className="gate-links"><button className="link-btn" onClick={()=>product.openHelp('privacy-policy')}>Privacy Policy</button><button className="link-btn" onClick={()=>product.openHelp('use-limitations')}>Use &amp; financial limitations</button><button className="link-btn" onClick={()=>product.openHelp('licenses')}>Licenses &amp; credits</button></div>
    </section>
  </>;
}




