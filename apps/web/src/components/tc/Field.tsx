'use client';
import {cloneElement,isValidElement,useId,type ReactElement,type ReactNode} from 'react';
type ControlProps = { 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' };
export function Field({label,children,hint,error}:{label:string;children:ReactNode;hint?:string;error?:string}) {
  const id=useId();
  const control=isValidElement(children)&&typeof children.type==='string'&&['input','textarea','select'].includes(children.type)?children as ReactElement<ControlProps>:null;
  const description=[control?.props['aria-describedby'],hint?`${id}-hint`:'',error?`${id}-error`:''].filter(Boolean).join(' ')||undefined;
  return <label className="field"><span className="field-label">{label}</span>{control?cloneElement(control,{'aria-describedby':description,'aria-invalid':error?true:control.props['aria-invalid']}):children}{hint&&<span id={`${id}-hint`} className="hint">{hint}</span>}{error&&<span id={`${id}-error`} className="field-error" role="alert">{error}</span>}</label>;
}
