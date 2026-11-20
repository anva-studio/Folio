import { Component, type ReactNode } from 'react';
/** Keep navigation, save status and Lock mounted if one view cannot render/load. */
export class ScreenBoundary extends Component<{children:ReactNode;onRecover:()=>void;message?:string;recoveryLabel?:string},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed)return <section className="card" role="alert"><h2>This view couldn’t open</h2><p>{this.props.message??'Your profile has not been cleared. Try another section, or lock and reopen the profile. If a save error is also shown, resolve it before closing Folio.'}</p><button type="button" className="btn btn-secondary" onClick={this.props.onRecover}>{this.props.recoveryLabel??'Return to Dashboard'}</button></section>;
    return this.props.children;
  }
}
