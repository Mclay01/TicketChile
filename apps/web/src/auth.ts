import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { authenticate,createSession,findIdentity,principal,readSession,revokeSession } from "@/lib/security/identity.server";
import { verifyMfa } from "@/lib/security/mfa.server";
import { publicLimit } from "@/lib/security/rate-limit.server";

export const authOptions:NextAuthOptions={
  secret:(process.env.NEXTAUTH_SECRET||process.env.AUTH_SECRET||"").trim(),
  session:{strategy:"jwt",maxAge:604800},pages:{signIn:"/signin"},
  providers:[
    GoogleProvider({clientId:process.env.GOOGLE_CLIENT_ID||process.env.AUTH_GOOGLE_ID||"",
      clientSecret:process.env.GOOGLE_CLIENT_SECRET||process.env.AUTH_GOOGLE_SECRET||""}),
    CredentialsProvider({name:"credentials",credentials:{email:{label:"Email",type:"email"},
      password:{label:"Password",type:"password"},code:{label:"MFA",type:"text"}},
    async authorize(credentials,request){
      const email=String(credentials?.email||"").trim().toLowerCase();
      await publicLimit(new Request("http://localhost/auth",{headers:request.headers as Record<string,string>}),"login:BUYER",email,{hits:15,seconds:900});
      const p=await authenticate("BUYER",email,String(credentials?.password||"")); if(!p)return null;
      if(p.mfa_enabled)await verifyMfa(p,String(credentials?.code||""));
      const sid=await createSession(p,p.mfa_enabled);
      return {id:p.id,email:p.email,name:p.name,securitySid:sid};
    }}),
  ],
  callbacks:{
    async signIn({account,profile,user}){
      if(account?.provider!=="google")return true;
      const verified=(profile as {email_verified?:boolean}|undefined)?.email_verified===true;
      if(!verified||!user.email)return false;
      const p=await findIdentity("BUYER",user.email);
      // Google is not a substitute for this application's enrolled second factor.
      // Enrolled buyers use password+TOTP/recovery-code login.
      return !p || (!p.disabled&&p.active&&!p.mfa_enabled);
    },
    async jwt({token,user,account}){
      if(user && account?.provider==="credentials")token.securitySid=(user as typeof user & {securitySid:string}).securitySid;
      if(user && account?.provider==="google"){
        const email=String(user.email||"").trim().toLowerCase();
        const row=await pool.query<{id:string}>(`INSERT INTO usuarios(id,nombre,email,password_hash,email_verified_at)
          VALUES($1,$2,$3,'',NOW()) ON CONFLICT(email) DO UPDATE SET email_verified_at=COALESCE(usuarios.email_verified_at,NOW()) RETURNING id`,
        [randomUUID(),user.name||"Usuario",email]);
        const p=await principal("BUYER",row.rows[0].id);
        if(p&&!p.disabled&&p.active&&!p.mfa_enabled)token.securitySid=await createSession(p);
      }
      // Never mint a fresh persisted session for an existing JWT during refresh.
      return token;
    },
    async session({session,token}){
      const p=await readSession(typeof token.securitySid==="string"?token.securitySid:"","BUYER");
      if(!p){session.user=undefined;return session;}
      session.user={name:p.name,email:p.email,image:session.user?.image};
      (session.user as typeof session.user & {id:string}).id=p.id;
      (session.user as typeof session.user & {securityVersion:number}).securityVersion=p.version;
      return session;
    },
  },
  events:{async signOut({token}){if(typeof token?.securitySid==="string")await revokeSession(token.securitySid);}},
};
