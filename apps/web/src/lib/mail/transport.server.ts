import 'server-only';
import { Resend } from 'resend';
export type Mail = { from:string; to:string[]; subject:string; html:string;
  attachments?: Array<{filename:string;content:string;contentType:string;contentId:string}> };
export type MailTransport = (mail: Mail,key: string)=>Promise<void>;
export function mailConfigured() { return process.env.MAIL_TRANSPORT==='resend' && Boolean(process.env.RESEND_API_KEY && process.env.FROM_EMAIL && process.env.SECURITY_DATA_KEY); }
export const sendTransactionalMail: MailTransport = async (mail,key)=>{
  if (!mailConfigured()) throw new Error('Mail delivery disabled');
  const result=await new Resend(process.env.RESEND_API_KEY).emails.send(mail,{idempotencyKey:key});
  if (result.error || !result.data?.id) throw new Error('Mail delivery failed');
};
// Development/test delivery is injectable and records to memory; it never calls
// the provider or marks production jobs delivered by pretending a send succeeded.
export function memoryMailTransport() {
  const messages=new Map<string,Mail>();
  const send: MailTransport=async(mail,key)=>{if(!messages.has(key))messages.set(key,structuredClone(mail));};
  return {messages,send};
}
