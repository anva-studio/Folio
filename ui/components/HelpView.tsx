import {lazy,Suspense} from 'react';
import {useProduct} from '../../application/productNavigation';
import {ScreenBoundary} from './ScreenBoundary';
const Help=lazy(()=>import('../screens/HelpScreen').then(module=>({default:module.HelpScreen})));
/** Help stays bundled offline, without parsing the full manual at every launch. */
export function HelpView({initialArticle}:{initialArticle?:string}){
  const product=useProduct();
  return <ScreenBoundary onRecover={product.openProfiles} recoveryLabel="Back to profiles" message="Help could not open from the local app files. Your financial records have not been cleared. Return to profiles or restart Folio; if a save error is also shown, resolve it before closing."><Suspense fallback={<p className="card" role="status">Opening Help…</p>}><Help initialArticle={initialArticle}/></Suspense></ScreenBoundary>;
}
